import { pageQuestions, type AnswerValue, type Answers, type Comparison, type Condition, type ConditionValue, type Page, type Question, type Survey } from "@kvesto/schema";

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
export function evaluateCondition(condition: Condition, answers: Answers): boolean {
  if ("all" in condition) return condition.all.every((c) => evaluateCondition(c, answers));
  if ("any" in condition) return condition.any.some((c) => evaluateCondition(c, answers));
  if ("not" in condition) return !evaluateCondition(condition.not, answers);
  return evaluateComparison(condition, answers);
}

export interface SurveyLogic {
  /** Ids of the pages that are currently shown, in order. */
  visiblePages: Set<string>;
  /** Ids of the questions that are currently shown (a hidden page hides all its questions). */
  visibleQuestions: Set<string>;
  /** Ids of the questions that are currently required (`required`, or `requiredIf` holds). */
  requiredQuestions: Set<string>;
  /** Answers with hidden questions removed: what gets submitted. */
  answers: Answers;
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
  const visibleQuestions = new Set<string>();
  const requiredQuestions = new Set<string>();
  const effective: Answers = {};

  for (const page of survey.pages) {
    const pageVisible = !page.visibleIf || evaluateCondition(page.visibleIf, effective);
    if (pageVisible) visiblePages.add(page.id);
    for (const q of pageQuestions(page)) {
      const visible = pageVisible && (!q.visibleIf || evaluateCondition(q.visibleIf, effective));
      if (!visible) continue;
      visibleQuestions.add(q.id);
      if (q.required || (q.requiredIf && evaluateCondition(q.requiredIf, effective))) requiredQuestions.add(q.id);
      const v = answers[q.id];
      if (v !== undefined) effective[q.id] = v;
    }
  }
  return { visiblePages, visibleQuestions, requiredQuestions, answers: effective };
}

export function visibleElements(page: Page, logic: SurveyLogic): Question[] {
  return pageQuestions(page).filter((q) => logic.visibleQuestions.has(q.id));
}
