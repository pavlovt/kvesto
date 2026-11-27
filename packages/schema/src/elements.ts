/**
 * Helpers for walking the elements of a survey.
 *
 * A page holds elements: questions and panels, and a panel holds elements
 * too. Code that needs "every question" or "the questions of a page" should
 * go through these helpers instead of reading `page.elements` directly.
 *
 * They are generic over the element type, so they work on parsed surveys
 * (`Survey`) and on survey JSON as authored (`SurveyInput`) alike.
 */

/** The minimal element shape the helpers need. */
export interface ElementLike {
  id: string;
  type: string;
}

/** The minimal shape the helpers need: pages with a list of elements. */
export interface SurveyLike<E> {
  pages: readonly PageLike<E>[];
}

export interface PageLike<E> {
  elements: readonly E[];
}

/** The panels among `E`. */
export type PanelOf<E> = Extract<E, { type: "panel" }>;
/** Element types that show something but take no answer. */
export const DISPLAY_TYPES = ["content", "image"] as const;
export type DisplayType = (typeof DISPLAY_TYPES)[number];
/** The display elements among `E` (content and images). */
export type DisplayOf<E> = Extract<E, { type: DisplayType }>;
/** The questions among `E` (everything that is not a panel or a display element). */
export type QuestionOf<E> = Exclude<E, { type: "panel" | DisplayType }>;

/** Where an element sits in the survey. */
export interface ElementLocation {
  /** Index of the page in `survey.pages`. */
  pageIndex: number;
  /** Index of the element in its parent's `elements`. */
  index: number;
  /** Ids of the panels around the element, outermost first. Empty at the top of a page. */
  panels: string[];
  /** Id of the repeating panel the element is inside, if any. Its answers live in that panel's items. */
  repeat?: string;
  /** Path from the survey root, e.g. `["pages", 0, "elements", 2, "elements", 0]`, for error messages. */
  path: (string | number)[];
}

export function isPanel<E extends ElementLike>(element: E): element is PanelOf<E> & E {
  return element.type === "panel";
}

/** A content block or image: shown, but never answered. */
export function isDisplayElement<E extends ElementLike>(element: E): element is DisplayOf<E> & E {
  return (DISPLAY_TYPES as readonly string[]).includes(element.type);
}

/** A question: anything that is neither a panel nor a display element. */
export function isQuestion<E extends ElementLike>(element: E): element is QuestionOf<E> & E {
  return !isPanel(element) && !isDisplayElement(element);
}

/** A panel with `repeat` settings: its contents are answered once per item. */
export function isRepeatingPanel<E extends ElementLike>(element: E): element is PanelOf<E> & E {
  return isPanel(element) && Boolean((element as { repeat?: unknown }).repeat);
}

const childrenOf = <E extends ElementLike>(element: E): readonly E[] =>
  isPanel(element) ? ((element as unknown as { elements: readonly E[] }).elements ?? []) : [];

/**
 * Visit every element (panels and questions) in document order, a panel
 * before its contents. Return `false` from the callback to stop early, or
 * `"skip"` on a panel to not visit its contents. Returns false when stopped.
 */
export function walkElements<E extends ElementLike>(
  survey: SurveyLike<E>,
  visit: (element: E, location: ElementLocation) => void | boolean | "skip",
): boolean {
  const walk = (
    elements: readonly E[],
    pageIndex: number,
    panels: string[],
    repeat: string | undefined,
    path: (string | number)[],
  ): boolean => {
    for (const [index, element] of elements.entries()) {
      const at = [...path, "elements", index];
      const verdict = visit(element, { pageIndex, index, panels, ...(repeat ? { repeat } : {}), path: at });
      if (verdict === false) return false;
      if (verdict === "skip" || !isPanel(element)) continue;
      const inner = repeat ?? (isRepeatingPanel(element) ? element.id : undefined);
      if (!walk(childrenOf(element), pageIndex, [...panels, element.id], inner, at)) return false;
    }
    return true;
  };
  for (const [pageIndex, page] of survey.pages.entries()) {
    if (!walk(page.elements, pageIndex, [], undefined, ["pages", pageIndex])) return false;
  }
  return true;
}

function collectQuestions<E extends ElementLike>(elements: readonly E[], out: QuestionOf<E>[]): QuestionOf<E>[] {
  for (const element of elements) {
    if (isPanel(element)) collectQuestions(childrenOf(element), out);
    else if (isQuestion(element)) out.push(element as QuestionOf<E>);
  }
  return out;
}

/**
 * The questions of one page, in order, including those inside panels (also
 * repeating ones: use `walkElements` and `location.repeat` to tell them apart).
 */
export function pageQuestions<E extends ElementLike>(page: PageLike<E>): QuestionOf<E>[] {
  return collectQuestions(page.elements, []);
}

/** The questions inside a panel, at any depth. */
export function panelQuestions<E extends ElementLike>(panel: E): QuestionOf<E>[] {
  return collectQuestions(childrenOf(panel), []);
}

/** Every question in the survey, in document order. */
export function allQuestions<E extends ElementLike>(survey: SurveyLike<E>): QuestionOf<E>[] {
  return survey.pages.flatMap((page) => pageQuestions(page));
}

/** Find an element (question or panel) by id, with where it sits. */
export function findElement<E extends ElementLike>(
  survey: SurveyLike<E>,
  id: string,
): { element: E; location: ElementLocation } | undefined {
  let found: { element: E; location: ElementLocation } | undefined;
  walkElements(survey, (element, location) => {
    if (element.id !== id) return;
    found = { element, location };
    return false;
  });
  return found;
}

/** Find a question by id. Panels and display elements are not questions, so their ids give undefined. */
export function findQuestion<E extends ElementLike>(survey: SurveyLike<E>, id: string): QuestionOf<E> | undefined {
  const found = findElement(survey, id)?.element;
  return found && isQuestion(found) ? (found as QuestionOf<E>) : undefined;
}
