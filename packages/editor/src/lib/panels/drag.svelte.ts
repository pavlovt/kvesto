/**
 * Drag and drop for the outline, with pointer events (no drag library) and a
 * keyboard mode for people who don't use a pointer. Every drop is one
 * `moveElement` or `addElement` command, so undo reverts it in one step.
 */
import type { ElementInput } from "@kvesto/core";
import { findElementIn, type SurveyDocument } from "../doc/document.js";
import { newElement, type PaletteKind } from "../doc/factory.js";
import {
  canDropInto,
  describeTarget,
  dropTargets,
  isNoop,
  parseContainer,
  type DropTarget,
} from "../doc/positions.js";

export type DragSource =
  | { type: "move"; id: string; label: string; element: ElementInput }
  | { type: "add"; kind: PaletteKind; label: string; element: ElementInput };

/** How far (px) the pointer moves before a press becomes a drag, so clicks still work. */
const THRESHOLD = 4;

const label = (el: ElementInput) => ("title" in el && typeof el.title === "string" && el.title ? el.title : el.id);

export class OutlineDrag {
  source = $state<DragSource | null>(null);
  target = $state<DropTarget | null>(null);
  mode = $state<"pointer" | "keyboard" | null>(null);
  /** Where the pointer is, for the floating label. */
  ghost = $state<{ x: number; y: number } | null>(null);
  /** Text for the live region. */
  announcement = $state("");
  /** The outline element; pointer drops are only accepted over it. */
  root: HTMLElement | null = null;

  #targets: DropTarget[] = [];
  #at = 0;
  #pending: { source: DragSource; x: number; y: number; pointerId: number } | null = null;
  #suppressClick = false;
  #cleanup: (() => void) | null = null;

  constructor(private doc: SurveyDocument) {}

  get active(): boolean {
    return this.mode !== null;
  }

  /** True once, right after a pointer drag ended: the click that follows should be ignored. */
  consumeClick(): boolean {
    const v = this.#suppressClick;
    this.#suppressClick = false;
    return v;
  }

  moveSource(id: string): DragSource | null {
    const found = findElementIn(this.doc.survey, id);
    return found ? { type: "move", id, label: label(found.element), element: found.element } : null;
  }

  addSource(kind: PaletteKind, text: string): DragSource {
    return { type: "add", kind, label: text, element: newElement(kind, this.doc.survey) };
  }

  // ── Pointer ──────────────────────────────────────────────────────────────

  /** Call on pointerdown. The drag starts once the pointer has moved a few pixels. */
  press(event: PointerEvent, source: DragSource | null): void {
    if (!source || event.button !== 0 || this.active) return;
    this.#pending = { source, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    const move = (e: PointerEvent) => this.#pointerMove(e);
    const up = (e: PointerEvent) => this.#pointerUp(e);
    const cancel = () => this.cancel();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.mode === "pointer") {
        e.preventDefault();
        this.cancel();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    this.#cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
    };
  }

  #pointerMove(e: PointerEvent) {
    const pending = this.#pending;
    if (pending && e.pointerId === pending.pointerId && this.mode === null) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < THRESHOLD) return;
      this.source = pending.source;
      this.mode = "pointer";
      this.announcement = `Dragging ${pending.source.label}.`;
    }
    if (this.mode !== "pointer") return;
    e.preventDefault();
    this.ghost = { x: e.clientX, y: e.clientY };
    this.target = this.hitTest(e.clientX, e.clientY);
  }

  #pointerUp(e: PointerEvent) {
    if (this.mode === "pointer") {
      this.target = this.hitTest(e.clientX, e.clientY);
      // The browser may follow pointerup with a click on the pressed button; ignore that one only.
      this.#suppressClick = true;
      setTimeout(() => (this.#suppressClick = false), 0);
      this.drop();
    } else {
      this.#end();
    }
  }

  /** The drop target under a point, or null when the point isn't a valid place. */
  hitTest(x: number, y: number): DropTarget | null {
    const source = this.source;
    const root = this.root;
    if (!source || !root) return null;
    const hit = root.ownerDocument.elementFromPoint(x, y);
    if (!hit || !root.contains(hit)) return null;
    const movingId = source.type === "move" ? source.id : null;
    if (movingId && hit.closest(`[data-outline="${CSS.escape(movingId)}"]`)) return null;

    let target: DropTarget | null = null;
    const row = hit.closest<HTMLElement>(".kv-outline-row");
    const empty = hit.closest<HTMLElement>(".kv-outline-empty");
    const list = hit.closest<HTMLElement>(".kv-outline-list");
    const page = hit.closest<HTMLElement>("[data-page]");
    if (row) {
      const item = row.closest<HTMLElement>("[data-outline]")!;
      const container = parseContainer(item.dataset.container);
      const index = Number(item.dataset.index);
      if (!container) return null;
      const rect = row.getBoundingClientRect();
      const inner = { panel: item.dataset.outline! };
      if (y < rect.top + rect.height / 2) target = { container, index };
      else if (item.dataset.kind === "panel" && canDropInto(this.doc.survey, source.element, movingId, inner))
        target = { container: inner, index: 0 };
      else target = { container, index: index + 1 };
    } else if (empty) {
      const container = parseContainer(empty.dataset.container);
      if (container) target = { container, index: 0 };
    } else if (list) {
      const container = parseContainer(list.dataset.container);
      if (container) target = { container, index: Number(list.dataset.count) };
    } else if (page) {
      const container = { page: page.dataset.page! };
      const head = hit.closest(".kv-outline-page-head");
      const count = this.doc.survey.pages.find((p) => p.id === container.page)?.elements.length ?? 0;
      target = { container, index: head ? 0 : count };
    }
    if (!target) return null;
    if (!canDropInto(this.doc.survey, source.element, movingId, target.container)) return null;
    if (isNoop(this.doc.survey, movingId, target)) return null;
    return target;
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  /**
   * Keydown on an element's drag handle: Space or Enter picks it up and drops
   * it, the arrow keys move it, Escape cancels. Returns true when handled.
   */
  handleKey(event: KeyboardEvent, id: string): boolean {
    const key = event.key;
    if (this.mode === "keyboard" && this.source?.type === "move" && this.source.id === id) {
      if (key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End") {
        const last = this.#targets.length - 1;
        const to =
          key === "Home" ? 0 : key === "End" ? last : Math.min(last, Math.max(0, this.#at + (key === "ArrowUp" ? -1 : 1)));
        this.#at = to;
        this.target = this.#targets[to] ?? null;
        this.announcement = this.#describe();
      } else if (key === " " || key === "Enter") {
        this.drop();
      } else if (key === "Escape") {
        this.cancel();
      } else if (key !== "Tab") {
        return false;
      }
      event.preventDefault();
      return true;
    }
    if ((key === " " || key === "Enter") && !this.active) {
      const source = this.moveSource(id);
      if (!source) return false;
      event.preventDefault();
      this.source = source;
      this.mode = "keyboard";
      this.#targets = dropTargets(this.doc.survey, source.element, id);
      const found = findElementIn(this.doc.survey, id)!;
      this.#at = Math.max(
        0,
        this.#targets.findIndex((t) => isNoop(this.doc.survey, id, t) && t.index === found.index),
      );
      this.target = this.#targets[this.#at] ?? null;
      this.announcement =
        `Picked up ${source.label}. ${this.#describe()}. ` +
        "Use the up and down arrow keys to move it, Space to drop, Escape to cancel.";
      return true;
    }
    return false;
  }

  #describe(): string {
    const target = this.target;
    if (!target) return "";
    const movingId = this.source?.type === "move" ? this.source.id : null;
    const where = isNoop(this.doc.survey, movingId, target) ? "current position" : describeTarget(this.doc.survey, target);
    return `${where[0]!.toUpperCase()}${where.slice(1)}, ${this.#at + 1} of ${this.#targets.length}`;
  }

  // ── Both ─────────────────────────────────────────────────────────────────

  /** Drop at the current target: one document command. Returns the moved or added id. */
  drop(): string | null {
    const source = this.source;
    const target = this.target;
    let id: string | null = null;
    if (source && target) {
      if (source.type === "move") {
        if (!isNoop(this.doc.survey, source.id, target) && this.doc.moveElement(source.id, target.container, target.index)) {
          id = source.id;
          this.doc.select(source.id);
        }
      } else {
        id = this.doc.addElement(source.element, target);
      }
    }
    if (source) {
      this.announcement = id
        ? `${source.type === "move" ? "Moved" : "Added"} ${source.label} ${describeTarget(this.doc.survey, this.#after(id))}.`
        : `${source.label} was not moved.`;
    }
    this.#end();
    return id;
  }

  /** Where an element is now, as a target (for the announcement after a drop). */
  #after(id: string): DropTarget {
    const found = findElementIn(this.doc.survey, id)!;
    return { container: found.container, index: found.index + 1 };
  }

  cancel(): void {
    if (this.source && this.mode) this.announcement = `Cancelled. ${this.source.label} was not moved.`;
    this.#end();
  }

  #end() {
    this.#cleanup?.();
    this.#cleanup = null;
    this.#pending = null;
    this.source = null;
    this.target = null;
    this.mode = null;
    this.ghost = null;
    this.#targets = [];
  }

  destroy(): void {
    this.#end();
  }
}
