/**
 * Helpers for walking the elements of a survey.
 *
 * Code that needs "every question" or "the questions of a page" should go
 * through these instead of reading `page.elements` directly, so it keeps
 * working once pages can hold nested containers.
 *
 * They are generic over the element type, so they work on parsed surveys
 * (`Survey`) and on survey JSON as authored (`SurveyInput`) alike.
 */

/** The minimal shape the helpers need: pages with a list of elements. */
export interface SurveyLike<E> {
  pages: readonly PageLike<E>[];
}

export interface PageLike<E> {
  elements: readonly E[];
}

/** Where an element sits in the survey. */
export interface ElementLocation {
  /** Index of the page in `survey.pages`. */
  pageIndex: number;
  /** Index of the element in its parent's `elements`. */
  index: number;
  /** Path from the survey root, e.g. `["pages", 0, "elements", 2]`, for error messages. */
  path: (string | number)[];
}

/**
 * Visit every element in document order. Return `false` from the callback to
 * stop early. Returns false when stopped, true otherwise.
 */
export function walkElements<E>(survey: SurveyLike<E>, visit: (element: E, location: ElementLocation) => void | boolean): boolean {
  for (const [pageIndex, page] of survey.pages.entries()) {
    for (const [index, element] of page.elements.entries()) {
      if (visit(element, { pageIndex, index, path: ["pages", pageIndex, "elements", index] }) === false) return false;
    }
  }
  return true;
}

/** The questions of one page, in order. */
export function pageQuestions<E>(page: PageLike<E>): E[] {
  return [...page.elements];
}

/** Every question in the survey, in document order. */
export function allQuestions<E>(survey: SurveyLike<E>): E[] {
  return survey.pages.flatMap((page) => pageQuestions(page));
}

/** Find an element by id, with where it sits. */
export function findElement<E extends { id: string }>(
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
