/**
 * Size limits for survey documents and answers, so a huge or deeply nested
 * document can't tie up a server or a browser. The schema enforces the
 * defaults; a server can lower them (`createApp({ limits })`) and checks the
 * raw JSON with these functions before parsing it.
 *
 * The checks walk the JSON with a depth cap, so they are safe to run on
 * anything, however it is nested.
 */

export interface SurveyLimits {
  /** Pages in a survey. */
  pages: number;
  /** Elements in a survey, panels and their contents included. */
  elements: number;
  /** How deep panels may be nested in panels. */
  panelDepth: number;
  /** Choices, rows, columns or items of one question. */
  choices: number;
  /** Characters in any one string. */
  stringLength: number;
  /** How deep `all` / `any` / `not` conditions may be nested. */
  conditionDepth: number;
  /** How deep the JSON may be nested at all. */
  jsonDepth: number;
}

export interface AnswerLimits {
  /** Characters in one text answer. */
  stringLength: number;
  /** Values in one list answer (choices, tags, files). */
  arrayLength: number;
  /** Items of one repeating panel. */
  repeatItems: number;
  /** How deep the answers JSON may be nested. */
  jsonDepth: number;
}

/** Generous: real surveys are far below these. */
export const SURVEY_LIMITS: SurveyLimits = {
  pages: 200,
  elements: 5_000,
  panelDepth: 10,
  choices: 2_000,
  // Image sources may be data: URLs of up to 2 MB.
  stringLength: 2_000_000,
  conditionDepth: 20,
  jsonDepth: 64,
};

export const ANSWER_LIMITS: AnswerLimits = {
  stringLength: 100_000,
  arrayLength: 2_000,
  repeatItems: 500,
  jsonDepth: 8,
};

export interface LimitIssue {
  path: (string | number)[];
  message: string;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** Long strings and too-deep nesting anywhere in `value`. Returns false when it stopped at the depth cap. */
function walk(value: unknown, path: (string | number)[], depth: number, stringLength: number, jsonDepth: number, add: (i: LimitIssue) => void): boolean {
  if (depth > jsonDepth) {
    add({ path, message: `Nested more than ${jsonDepth} levels deep` });
    return false;
  }
  if (typeof value === "string") {
    if (value.length > stringLength) add({ path, message: `Longer than ${stringLength} characters` });
    return true;
  }
  if (typeof value !== "object" || value === null) return true;
  const entries: [string | number, unknown][] = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
  for (const [k, v] of entries) {
    if (typeof k === "string" && k.length > 200) add({ path: [...path, k.slice(0, 20)], message: "A key longer than 200 characters" });
    if (!walk(v, [...path, k], depth + 1, stringLength, jsonDepth, add)) return false;
  }
  return true;
}

function conditionDepth(c: unknown, depth = 1): number {
  if (!isObject(c)) return depth;
  const children = Array.isArray(c.all) ? c.all : Array.isArray(c.any) ? c.any : c.not !== undefined ? [c.not] : [];
  return children.reduce<number>((max, child) => Math.max(max, conditionDepth(child, depth + 1)), depth);
}

const CONDITIONS = ["visibleIf", "requiredIf", "enableIf", "resetIf"];
const LISTS = ["choices", "rows", "columns", "items"];

/** Where a survey document goes over `limits` (the defaults, or lower ones). At most 20 issues. */
export function surveyLimitIssues(doc: unknown, limits: Partial<SurveyLimits> = {}): LimitIssue[] {
  const l = { ...SURVEY_LIMITS, ...limits };
  const issues: LimitIssue[] = [];
  const add = (i: LimitIssue) => {
    if (issues.length < 20) issues.push(i);
  };
  // Stop here when the nesting is too deep: everything below assumes it isn't.
  if (!walk(doc, [], 0, l.stringLength, l.jsonDepth, add) || !isObject(doc)) return issues;
  const checkConditions = (owner: Json, path: (string | number)[]) => {
    for (const key of CONDITIONS) {
      if (owner[key] !== undefined && conditionDepth(owner[key]) > l.conditionDepth) {
        add({ path: [...path, key], message: `Conditions nested more than ${l.conditionDepth} levels deep` });
      }
    }
  };
  let elements = 0;
  const visit = (list: unknown, path: (string | number)[], panelDepth: number) => {
    if (!Array.isArray(list)) return;
    list.forEach((el, i) => {
      if (!isObject(el)) return;
      const at = [...path, i];
      elements++;
      checkConditions(el, at);
      for (const key of LISTS) {
        const items = el[key];
        if (Array.isArray(items) && items.length > l.choices) add({ path: [...at, key], message: `More than ${l.choices} ${key}` });
      }
      if (Array.isArray(el.elements)) {
        if (panelDepth + 1 > l.panelDepth) add({ path: [...at, "elements"], message: `Panels nested more than ${l.panelDepth} levels deep` });
        else visit(el.elements, [...at, "elements"], panelDepth + 1);
      }
    });
  };
  const pages = Array.isArray(doc.pages) ? doc.pages : [];
  if (pages.length > l.pages) add({ path: ["pages"], message: `More than ${l.pages} pages` });
  pages.slice(0, l.pages).forEach((page, i) => {
    if (!isObject(page)) return;
    checkConditions(page, ["pages", i]);
    visit(page.elements, ["pages", i, "elements"], 0);
  });
  if (elements > l.elements) add({ path: ["pages"], message: `More than ${l.elements} elements` });
  return issues;
}

/** Where answers go over `limits` (the defaults, or lower ones). At most 20 issues. */
export function answerLimitIssues(answers: unknown, limits: Partial<AnswerLimits> = {}): LimitIssue[] {
  const l = { ...ANSWER_LIMITS, ...limits };
  const issues: LimitIssue[] = [];
  const add = (i: LimitIssue) => {
    if (issues.length < 20) issues.push(i);
  };
  if (!walk(answers, [], 0, l.stringLength, l.jsonDepth, add) || !isObject(answers)) return issues;
  const lists = (value: unknown, path: (string | number)[]) => {
    if (!Array.isArray(value)) {
      if (isObject(value)) for (const [k, v] of Object.entries(value)) lists(v, [...path, k]);
      return;
    }
    // A list of objects is a repeating panel's items (or files); a list of strings is choices or tags.
    const repeat = value.length > 0 && value.every((v) => isObject(v) && !("url" in v));
    const max = repeat ? l.repeatItems : l.arrayLength;
    if (value.length > max) add({ path, message: repeat ? `More than ${max} items` : `More than ${max} values` });
    value.forEach((v, i) => lists(v, [...path, i]));
  };
  for (const [k, v] of Object.entries(answers)) lists(v, [k]);
  return issues;
}
