/**
 * Where an element may be dropped. Pure functions over survey JSON, shared by
 * pointer and keyboard drag and drop so both follow the same rules.
 */
import type { ElementInput, PanelInput, SurveyInput } from "@kvesto/core";
import { containsRepeat, findElementIn, type Container, type ElementPosition } from "./document.js";

export type DropTarget = ElementPosition;

const containsFile = (el: ElementInput): boolean =>
  el.type === "file" || (el.type === "panel" && (el as PanelInput).elements.some(containsFile));

/** Whether a panel is a repeating panel or sits inside one. */
function inRepeat(survey: SurveyInput, panelId: string): boolean {
  const found = findElementIn(survey, panelId);
  if (!found) return false;
  return [...found.panels, panelId].some((id) => {
    const el = findElementIn(survey, id)?.element;
    return Boolean(el && el.type === "panel" && (el as PanelInput).repeat);
  });
}

/**
 * Whether `element` may go into `container`. `movingId` is the id of the
 * element being moved (null when adding a new one): a panel can't go inside
 * itself. Repeats don't nest, and file questions can't be repeated.
 */
export function canDropInto(
  survey: SurveyInput,
  element: ElementInput,
  movingId: string | null,
  container: Container,
): boolean {
  if ("page" in container) return survey.pages.some((p) => p.id === container.page);
  const panel = findElementIn(survey, container.panel);
  if (!panel || panel.element.type !== "panel") return false;
  if (movingId && (container.panel === movingId || panel.panels.includes(movingId))) return false;
  if (inRepeat(survey, container.panel) && (containsRepeat(element) || containsFile(element))) return false;
  return true;
}

export const containerKey = (c: Container): string => ("page" in c ? `page:${c.page}` : `panel:${c.panel}`);

export function parseContainer(key: string | undefined): Container | null {
  if (!key) return null;
  const at = key.indexOf(":");
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  if (kind === "page") return { page: id };
  if (kind === "panel") return { panel: id };
  return null;
}

export const sameTarget = (a: DropTarget | null, b: DropTarget | null): boolean =>
  Boolean(a && b && a.index === b.index && containerKey(a.container) === containerKey(b.container));

/**
 * Whether dropping the moving element at `target` would leave it where it is
 * (right before or right after itself).
 */
export function isNoop(survey: SurveyInput, movingId: string | null, target: DropTarget): boolean {
  if (!movingId) return false;
  const found = findElementIn(survey, movingId);
  if (!found || containerKey(found.container) !== containerKey(target.container)) return false;
  return target.index === found.index || target.index === found.index + 1;
}

/**
 * Every place the element can be dropped, in document order: before each
 * element, inside each panel that accepts it, and at the end of each list.
 * When moving, the element's own position is included once (so a keyboard
 * drag starts there) and positions inside itself are left out.
 */
export function dropTargets(survey: SurveyInput, element: ElementInput, movingId: string | null): DropTarget[] {
  const out: DropTarget[] = [];
  const here = movingId ? findElementIn(survey, movingId) : undefined;
  const walk = (list: ElementInput[], container: Container) => {
    const own = here && containerKey(here.container) === containerKey(container);
    for (let i = 0; i <= list.length; i++) {
      if (!(own && i === here.index + 1)) out.push({ container, index: i });
      const el = list[i];
      if (el?.type === "panel" && el.id !== movingId) {
        const inner: Container = { panel: el.id };
        if (canDropInto(survey, element, movingId, inner)) walk((el as PanelInput).elements, inner);
      }
    }
  };
  for (const page of survey.pages) walk(page.elements as ElementInput[], { page: page.id });
  return out;
}

const name = (el: { id: string; title?: unknown }) => (typeof el.title === "string" && el.title ? el.title : el.id);

/** A target in words, for screen reader announcements: `before "Role" in page "About you"`. */
export function describeTarget(survey: SurveyInput, target: DropTarget): string {
  let list: ElementInput[] = [];
  let where: string;
  if ("page" in target.container) {
    const id = target.container.page;
    const page = survey.pages.find((p) => p.id === id);
    list = (page?.elements ?? []) as ElementInput[];
    where = `page "${page?.title || id}"`;
  } else {
    const panel = findElementIn(survey, target.container.panel)?.element as PanelInput | undefined;
    list = panel?.elements ?? [];
    where = `${panel?.repeat ? "repeating panel" : "panel"} "${panel ? name(panel) : target.container.panel}"`;
  }
  if (list.length === 0) return `in empty ${where}`;
  const next = list[target.index];
  return next ? `before "${name(next)}" in ${where}` : `at the end of ${where}`;
}
