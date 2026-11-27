import { pageQuestions, type AnswerValue, type Element, type RepeatItem, type Answers, type Comparison, type Condition, type ConditionValue, type Page, type Question, type Survey } from "@kvesto/schema";

export function isEmptyAnswer(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

type Scalar = string | number | boolean;

/** The answer as a list of scalars, for set-like comparisons. */
function scalars(value: unknown): Scalar[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "object" && v !== null && "name" in v ? String(v.name) : v)) as Scalar[];
  }
  if (typeof value === "object") return [];
  return [value as Scalar];
}

function sameSet(a: Scalar[], b: Scalar[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function compareOrdered(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && typeof b === "number") return a - b;
  // ISO dates and other strings compare lexicographically.
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

function evaluateComparison(c: Comparison, answers: Answers): boolean {
  let value: unknown = answers[c.question];
  if (c.row !== undefined) {
    value = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[c.row] : undefined;
  }
  const empty = isEmptyAnswer(value as AnswerValue | undefined);
  const expected = c.value;
  const list: ConditionValue[] = Array.isArray(expected) ? expected : expected === undefined ? [] : [expected];

  switch (c.op) {
    case "empty":
      return empty;
    case "notEmpty":
      return !empty;
    case "eq":
      if (empty) return false;
      if (Array.isArray(value)) return sameSet(scalars(value), list);
      return !Array.isArray(expected) && value === expected;
    case "neq":
      return !evaluateComparison({ ...c, op: "eq" }, answers);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (empty || Array.isArray(expected)) return false;
      const d = compareOrdered(value, expected);
      if (d === null) return false;
      return c.op === "gt" ? d > 0 : c.op === "gte" ? d >= 0 : c.op === "lt" ? d < 0 : d <= 0;
    }
    case "contains":
      if (empty) return false;
      if (typeof value === "string") return list.every((x) => value.includes(String(x)));
      return list.every((x) => scalars(value).includes(x));
    case "notContains":
      return !evaluateComparison({ ...c, op: "contains" }, answers);
    case "in":
      return !empty && scalars(value).some((x) => list.includes(x));
    case "notIn":
      return !evaluateComparison({ ...c, op: "in" }, answers);
  }
}

/**
 * Evaluate a condition against answers. Pure data in, boolean out: conditions
 * are never compiled or run as code.
 */
export function evaluateCondition(condition: Condition, answers: Answers, item?: Answers): boolean {
  if ("all" in condition) return condition.all.every((c) => evaluateCondition(c, answers, item));
  if ("any" in condition) return condition.any.some((c) => evaluateCondition(c, answers, item));
  if ("not" in condition) return !evaluateCondition(condition.not, answers, item);
  // `scope: "item"` compares an answer in the current item of a repeating panel.
  return evaluateComparison(condition, condition.scope === "item" ? (item ?? {}) : answers);
}

export interface SurveyLogic {
  /** Ids of the pages that are currently shown, in order. */
  visiblePages: Set<string>;
  /** Ids of the questions that are currently shown (a hidden page or panel hides all its questions). */
  visibleQuestions: Set<string>;
  /** Ids of the panels that are currently shown. */
  visiblePanels: Set<string>;
  /** Ids of the questions that are currently required (`required`, or `requiredIf` holds). */
  requiredQuestions: Set<string>;
  /** Answers with hidden questions removed: what gets submitted. */
  answers: Answers;
  /** Per visible repeating panel: the logic of each of its items, in order. */
  items: Record<string, ItemLogic[]>;
}

/** Visibility inside one item of a repeating panel. */
export interface ItemLogic {
  visibleQuestions: Set<string>;
  visiblePanels: Set<string>;
  requiredQuestions: Set<string>;
  /** The item's answers with hidden questions removed (a `RepeatItem`; typed wider so the survey level fits too). */
  answers: Answers;
}

/** The items of a repeating panel's answer (anything else counts as no items). */
export function repeatItems(value: AnswerValue | undefined): RepeatItem[] {
  return Array.isArray(value) ? value.filter((v): v is RepeatItem => typeof v === "object" && v !== null && !Array.isArray(v)) : [];
}

/**
 * Work out which pages and questions are visible and required.
 *
 * Conditions only refer to earlier questions (the schema enforces this), so
 * one pass in survey order is enough, and the answer of a hidden question
 * counts as empty for every condition after it.
 */
export function resolveLogic(survey: Survey, answers: Answers): SurveyLogic {
  const visiblePages = new Set<string>();
  const effective: Answers = {};
  const top: ItemLogic = { visibleQuestions: new Set(), visiblePanels: new Set(), requiredQuestions: new Set(), answers: effective };
  const items: Record<string, ItemLogic[]> = {};

  /**
   * Walk elements, recording into `into`. Outside repeats, `into` is the
   * survey-level logic and `item` is undefined; inside an item, `into`
   * collects that item and `item` is the item's raw answers.
   */
  const visit = (elements: readonly Element[], parentVisible: boolean, into: ItemLogic, item: RepeatItem | undefined) => {
    for (const el of elements) {
      const visible = parentVisible && (!el.visibleIf || evaluateCondition(el.visibleIf, effective, into.answers));
      if (el.type === "panel") {
        if (visible) into.visiblePanels.add(el.id);
        if (el.repeat && !item) {
          if (!visible) continue;
          const list = repeatItems(answers[el.id]).map((raw) => {
            const logic: ItemLogic = { visibleQuestions: new Set(), visiblePanels: new Set(), requiredQuestions: new Set(), answers: {} };
            visit(el.elements, true, logic, raw);
            return logic;
          });
          items[el.id] = list;
          if (answers[el.id] !== undefined) effective[el.id] = list.map((l) => l.answers as RepeatItem);
          continue;
        }
        // Still walk a hidden panel: nothing inside is visible, but the walk keeps document order.
        visit(el.elements, visible, into, item);
        continue;
      }
      if (!visible) continue;
      into.visibleQuestions.add(el.id);
      if (el.required || (el.requiredIf && evaluateCondition(el.requiredIf, effective, into.answers))) {
        into.requiredQuestions.add(el.id);
      }
      const v = (item ?? answers)[el.id];
      if (v !== undefined) into.answers[el.id] = v;
    }
  };

  for (const page of survey.pages) {
    const pageVisible = !page.visibleIf || evaluateCondition(page.visibleIf, effective);
    if (pageVisible) visiblePages.add(page.id);
    visit(page.elements, pageVisible, top, undefined);
  }
  return {
    visiblePages,
    visibleQuestions: top.visibleQuestions,
    visiblePanels: top.visiblePanels,
    requiredQuestions: top.requiredQuestions,
    answers: effective,
    items,
  };
}

/** The visible questions of a page, in order, including those inside visible panels. */
export function visibleElements(page: Page, logic: SurveyLogic): Question[] {
  return pageQuestions(page).filter((q) => logic.visibleQuestions.has(q.id));
}
