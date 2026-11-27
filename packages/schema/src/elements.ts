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
/** The questions among `E` (everything that is not a panel). */
export type QuestionOf<E> = Exclude<E, { type: "panel" }>;

/** Where an element sits in the survey. */
export interface ElementLocation {
  /** Index of the page in `survey.pages`. */
  pageIndex: number;
  /** Index of the element in its parent's `elements`. */
  index: number;
  /** Ids of the panels around the element, outermost first. Empty at the top of a page. */
  panels: string[];
  /** Path from the survey root, e.g. `["pages", 0, "elements", 2, "elements", 0]`, for error messages. */
  path: (string | number)[];
}

export function isPanel<E extends ElementLike>(element: E): element is PanelOf<E> & E {
  return element.type === "panel";
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
  const walk = (elements: readonly E[], pageIndex: number, panels: string[], path: (string | number)[]): boolean => {
    for (const [index, element] of elements.entries()) {
      const at = [...path, "elements", index];
      const verdict = visit(element, { pageIndex, index, panels, path: at });
      if (verdict === false) return false;
      if (verdict !== "skip" && isPanel(element) && !walk(childrenOf(element), pageIndex, [...panels, element.id], at)) {
        return false;
      }
    }
    return true;
  };
  for (const [pageIndex, page] of survey.pages.entries()) {
    if (!walk(page.elements, pageIndex, [], ["pages", pageIndex])) return false;
  }
  return true;
}

function collectQuestions<E extends ElementLike>(elements: readonly E[], out: QuestionOf<E>[]): QuestionOf<E>[] {
  for (const element of elements) {
    if (isPanel(element)) collectQuestions(childrenOf(element), out);
    else out.push(element as QuestionOf<E>);
  }
  return out;
}

/** The questions of one page, in order, including those inside panels. */
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

/** Find a question by id. Panels are not questions, so a panel id gives undefined. */
export function findQuestion<E extends ElementLike>(survey: SurveyLike<E>, id: string): QuestionOf<E> | undefined {
  const found = findElement(survey, id)?.element;
  return found && !isPanel(found) ? (found as QuestionOf<E>) : undefined;
}
