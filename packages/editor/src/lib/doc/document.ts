/**
 * The editor's document model: survey JSON plus a selection and an undo
 * history. Pure TypeScript, no DOM, no Svelte; every edit is a named command
 * that produces a new survey object, so undo and redo are just moves through
 * snapshots.
 *
 * It edits survey JSON as authored (`SurveyInput`), which may be invalid
 * while someone is mid-edit: the editor validates the result with
 * `SurveySchema` and shows the issues, it never blocks an edit.
 */
import type { ElementInput, PanelInput, SurveyInput } from "@kvesto/core";

type PageInput = SurveyInput["pages"][number];

/** Where elements live: a page, or a panel (by id). */
export type Container = { page: string } | { panel: string };

export interface ElementPosition {
  container: Container;
  index: number;
}

export interface DocumentState {
  survey: SurveyInput;
  /** Id of the selected element (question or panel), or null. */
  selected: string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Label of the command that undo would revert, e.g. "Move question". */
  undoLabel: string | null;
  redoLabel: string | null;
}

export type DocumentListener = (state: DocumentState) => void;

export interface RunOptions {
  /**
   * Consecutive commands with the same merge key become one undo step, so
   * typing a title letter by letter is undone in one go.
   */
  mergeKey?: string;
}

interface Entry {
  survey: SurveyInput;
  selected: string | null;
  label: string;
  mergeKey?: string;
}

const HISTORY_LIMIT = 200;

const clone = <T>(v: T): T => structuredClone(v);

/** Find the elements list of a container in a (mutable) survey. */
function containerList(survey: SurveyInput, container: Container): ElementInput[] | undefined {
  if ("page" in container) return survey.pages.find((p) => p.id === container.page)?.elements as ElementInput[] | undefined;
  const found = findElementIn(survey, container.panel);
  return found && found.element.type === "panel" ? (found.element as PanelInput).elements : undefined;
}

interface Found {
  element: ElementInput;
  list: ElementInput[];
  index: number;
  container: Container;
  /** Ids of the panels around the element, outermost first. */
  panels: string[];
}

function findElementIn(survey: SurveyInput, id: string): Found | undefined {
  const search = (list: ElementInput[], container: Container, panels: string[]): Found | undefined => {
    for (const [index, element] of list.entries()) {
      if (element.id === id) return { element, list, index, container, panels };
      if (element.type === "panel") {
        const inner = search((element as PanelInput).elements, { panel: element.id }, [...panels, element.id]);
        if (inner) return inner;
      }
    }
    return undefined;
  };
  for (const page of survey.pages) {
    const found = search(page.elements as ElementInput[], { page: page.id }, []);
    if (found) return found;
  }
  return undefined;
}

/** Every element and page id in the survey. */
export function usedIds(survey: SurveyInput): Set<string> {
  const ids = new Set<string>(survey.pages.map((p) => p.id));
  const walk = (list: ElementInput[]) => {
    for (const el of list) {
      ids.add(el.id);
      if (el.type === "panel") walk((el as PanelInput).elements);
    }
  };
  for (const page of survey.pages) walk(page.elements as ElementInput[]);
  return ids;
}

/** `base`, or `base2`, `base3`, … : the first id not used in the survey. */
export function uniqueId(survey: SurveyInput, base: string): string {
  const ids = usedIds(survey);
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/** Give an element (and anything inside it) ids that are not used yet. */
function withFreshIds(survey: SurveyInput, element: ElementInput): ElementInput {
  const taken = usedIds(survey);
  const fresh = (el: ElementInput): ElementInput => {
    let id = el.id;
    if (taken.has(id)) {
      const base = id.replace(/\d+$/, "") || "q";
      let n = 2;
      while (taken.has(`${base}${n}`)) n++;
      id = `${base}${n}`;
    }
    taken.add(id);
    return el.type === "panel"
      ? ({ ...el, id, elements: (el as PanelInput).elements.map(fresh) } as ElementInput)
      : ({ ...el, id } as ElementInput);
  };
  return fresh(element);
}

/** Apply a shallow patch: `undefined` values remove the key. */
function patched<T extends object>(target: T, patch: Record<string, unknown>): T {
  const next = { ...target } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next as T;
}

function isInside(survey: SurveyInput, id: string, ancestorId: string): boolean {
  return findElementIn(survey, id)?.panels.includes(ancestorId) ?? false;
}

function containsRepeat(el: ElementInput): boolean {
  if (el.type !== "panel") return false;
  const panel = el as PanelInput;
  return Boolean(panel.repeat) || panel.elements.some(containsRepeat);
}

export class SurveyDocument {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private current: Entry;
  private listeners = new Set<DocumentListener>();

  constructor(survey: SurveyInput) {
    this.current = { survey: clone(survey), selected: null, label: "Open" };
  }

  get survey(): SurveyInput {
    return this.current.survey;
  }

  get selected(): string | null {
    return this.current.selected;
  }

  get state(): DocumentState {
    return {
      survey: this.current.survey,
      selected: this.current.selected,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      undoLabel: this.past.length ? this.current.label : null,
      redoLabel: this.future.at(-1)?.label ?? null,
    };
  }

  /** Svelte store contract: the listener runs now and after every change. */
  subscribe(listener: DocumentListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const state = this.state;
    for (const l of this.listeners) l(state);
  }

  /**
   * Run an edit. `edit` gets a copy of the survey to change in place (or
   * returns a replacement); returning `false` cancels the edit.
   */
  run(
    label: string,
    edit: (draft: SurveyInput) => SurveyInput | void | false,
    options: RunOptions & { renamed?: [from: string, to: string] } = {},
  ): boolean {
    const draft = clone(this.current.survey);
    const result = edit(draft);
    if (result === false) return false;
    const survey = result ?? draft;
    let selected = this.current.selected;
    if (options.renamed && selected === options.renamed[0]) selected = options.renamed[1];
    if (selected && !findElementIn(survey, selected)) selected = null;
    const merge = options.mergeKey !== undefined && this.current.mergeKey === options.mergeKey && this.past.length > 0;
    if (!merge) {
      this.past.push(this.current);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.current = { survey, selected, label, ...(options.mergeKey !== undefined ? { mergeKey: options.mergeKey } : {}) };
    this.future = [];
    this.emit();
    return true;
  }

  undo(): boolean {
    const prev = this.past.pop();
    if (!prev) return false;
    // The undone entry keeps its own label, so redo can name it.
    this.future.push({ ...this.current, mergeKey: undefined } as Entry);
    this.current = { ...prev, mergeKey: undefined } as Entry;
    this.emit();
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.current);
    this.current = next;
    this.emit();
    return true;
  }

  /** Change the selection. Not an undo step. */
  select(id: string | null): void {
    if (id !== null && !findElementIn(this.current.survey, id)) id = null;
    if (id === this.current.selected) return;
    this.current = { ...this.current, selected: id, mergeKey: undefined } as Entry;
    this.emit();
  }

  /** Replace the whole survey, e.g. from the JSON source view. */
  replace(survey: SurveyInput, options: RunOptions = {}): boolean {
    return this.run("Edit source", () => clone(survey), options);
  }

  /** Find an element and where it is. */
  find(id: string): { element: ElementInput; position: ElementPosition; panels: string[] } | undefined {
    const found = findElementIn(this.current.survey, id);
    return found
      ? { element: found.element, position: { container: found.container, index: found.index }, panels: found.panels }
      : undefined;
  }

  /**
   * Add an element. Ids already in use are replaced with fresh ones. Without
   * a container it goes at the end of the selected element's container, or of
   * the last page. Returns the new element's id, or null if the container
   * doesn't exist.
   */
  addElement(element: ElementInput, at?: Partial<ElementPosition>, options: { select?: boolean } = {}): string | null {
    let id: string | null = null;
    const ok = this.run(element.type === "panel" ? "Add panel" : "Add question", (draft) => {
      const container = at?.container ?? this.defaultContainer(draft);
      if (!container) return false;
      if ("panel" in container && containsRepeat(element) && this.insideRepeat(draft, container.panel)) return false;
      const list = containerList(draft, container);
      if (!list) return false;
      const fresh = withFreshIds(draft, element);
      id = fresh.id;
      list.splice(clampIndex(at?.index, list.length), 0, fresh);
    });
    if (!ok) return null;
    if (options.select !== false && id) this.select(id);
    return id;
  }

  private defaultContainer(survey: SurveyInput): Container | null {
    const sel = this.current.selected ? findElementIn(survey, this.current.selected) : undefined;
    if (sel) return sel.element.type === "panel" ? { panel: sel.element.id } : sel.container;
    const page = survey.pages.at(-1);
    return page ? { page: page.id } : null;
  }

  private insideRepeat(survey: SurveyInput, panelId: string): boolean {
    const found = findElementIn(survey, panelId);
    if (!found) return false;
    const chain = [...found.panels, panelId];
    return chain.some((id) => {
      const el = findElementIn(survey, id)?.element;
      return Boolean(el && el.type === "panel" && (el as PanelInput).repeat);
    });
  }

  removeElement(id: string): boolean {
    return this.run("Delete", (draft) => {
      const found = findElementIn(draft, id);
      if (!found) return false;
      found.list.splice(found.index, 1);
    });
  }

  /** Copy an element (with fresh ids) right after itself. Returns the copy's id. */
  duplicateElement(id: string): string | null {
    const found = this.find(id);
    if (!found) return null;
    return this.addElement(clone(found.element), { container: found.position.container, index: found.position.index + 1 });
  }

  /**
   * Move an element to `index` in `container` (the index as seen before the
   * move). Refuses to put a panel inside itself, or a repeating panel inside
   * another one.
   */
  moveElement(id: string, container: Container, index: number): boolean {
    return this.run("Move", (draft) => {
      const found = findElementIn(draft, id);
      if (!found) return false;
      if ("panel" in container && (container.panel === id || isInside(draft, container.panel, id))) return false;
      if ("panel" in container && containsRepeat(found.element) && this.insideRepeat(draft, container.panel)) return false;
      const target = containerList(draft, container);
      if (!target) return false;
      let to = clampIndex(index, target.length);
      if (target === found.list && found.index < to) to--;
      if (target === found.list && to === found.index) return false;
      found.list.splice(found.index, 1);
      target.splice(to, 0, found.element);
    });
  }

  /** Move an element one place up or down within its container. */
  nudgeElement(id: string, delta: -1 | 1): boolean {
    const found = this.find(id);
    if (!found) return false;
    const { container, index } = found.position;
    return this.moveElement(id, container, delta < 0 ? index - 1 : index + 2);
  }

  /**
   * Change some fields of an element. `undefined` removes a field. Changing
   * `id` is allowed (and refused when the new id is taken).
   */
  updateElement(id: string, patch: Record<string, unknown>, options: RunOptions = {}): boolean {
    return this.run(
      "Edit",
      (draft) => {
        const found = findElementIn(draft, id);
        if (!found) return false;
        if (typeof patch.id === "string" && patch.id !== id && usedIds(draft).has(patch.id)) return false;
        found.list[found.index] = patched(found.element, patch);
      },
      { ...options, ...(typeof patch.id === "string" ? { renamed: [id, patch.id] as [string, string] } : {}) },
    );
  }

  /** Change survey-level fields (title, description, …). */
  updateSurvey(patch: Record<string, unknown>, options: RunOptions = {}): boolean {
    return this.run(
      "Edit survey",
      (draft) => patched(draft, patch),
      options,
    );
  }

  addPage(page?: Partial<PageInput>, index?: number): string {
    let id = "";
    this.run("Add page", (draft) => {
      id = uniqueId(draft, page?.id ?? `page${draft.pages.length + 1}`);
      draft.pages.splice(clampIndex(index, draft.pages.length), 0, { elements: [], ...page, id } as PageInput);
    });
    return id;
  }

  /** Remove a page and its contents. The last page can't be removed. */
  removePage(id: string): boolean {
    return this.run("Delete page", (draft) => {
      const i = draft.pages.findIndex((p) => p.id === id);
      if (i < 0 || draft.pages.length === 1) return false;
      draft.pages.splice(i, 1);
    });
  }

  movePage(id: string, index: number): boolean {
    return this.run("Move page", (draft) => {
      const from = draft.pages.findIndex((p) => p.id === id);
      if (from < 0) return false;
      let to = clampIndex(index, draft.pages.length);
      if (from < to) to--;
      if (from === to) return false;
      const [page] = draft.pages.splice(from, 1);
      draft.pages.splice(to, 0, page!);
    });
  }

  updatePage(id: string, patch: Record<string, unknown>, options: RunOptions = {}): boolean {
    return this.run(
      "Edit page",
      (draft) => {
        const i = draft.pages.findIndex((p) => p.id === id);
        if (i < 0) return false;
        if (typeof patch.id === "string" && patch.id !== id && usedIds(draft).has(patch.id)) return false;
        draft.pages[i] = patched(draft.pages[i]!, patch);
      },
      options,
    );
  }
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined || index > length) return length;
  return Math.max(0, index);
}

export function createDocument(survey: SurveyInput): SurveyDocument {
  return new SurveyDocument(survey);
}
