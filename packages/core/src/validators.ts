import type { AnswerValue, Answers, CustomValidator, Question, RangeValidator, Validator } from "@kvesto/schema";
import { isEmptyAnswer } from "./logic.js";

export interface CustomValidatorContext {
  question: Question;
  /** The validator's `options` from the survey JSON. */
  options: Record<string, unknown>;
  /** Answers to the visible questions, for rules that compare questions. */
  answers: Answers;
}

/**
 * A host-provided rule for `{ "type": "custom", "name": … }` validators.
 * Return `true` or `null` when the answer is valid, `false` to use the
 * validator's `message` (or a generic one), or a string as the error message.
 * Must be synchronous and side-effect free: it runs on every validation, in
 * the browser and on the server.
 */
export type CustomValidatorFn = (value: AnswerValue, context: CustomValidatorContext) => boolean | string | null;

export type CustomValidators = Record<string, CustomValidatorFn>;

const regexCache = new Map<string, RegExp>();

function compile(pattern: string, flags = ""): RegExp {
  const key = `${flags}/${pattern}`;
  let re = regexCache.get(key);
  if (!re) {
    // The whole answer must match, as with the HTML `pattern` attribute.
    re = new RegExp(`^(?:${pattern})$`, flags);
    if (regexCache.size > 500) regexCache.clear();
    regexCache.set(key, re);
  }
  return re;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function between(n: number, min: number | undefined, max: number | undefined): boolean {
  return (min === undefined || n >= min) && (max === undefined || n <= max);
}

/** "at least 2", "at most 5", "between 2 and 5". */
function bounds(min: number | string | undefined, max: number | string | undefined, unit = ""): string {
  const u = unit ? ` ${unit}` : "";
  if (min !== undefined && max !== undefined) return min === max ? `exactly ${min}${u}` : `between ${min} and ${max}${u}`;
  if (min !== undefined) return `at least ${min}${u}`;
  return `at most ${max}${u}`;
}

function checkRange(question: Question, value: AnswerValue, v: RangeValidator): string | null {
  if (question.type === "text" && question.inputType === "date") {
    if (typeof value !== "string") return "Enter a date.";
    const min = v.min as string | undefined;
    const max = v.max as string | undefined;
    // YYYY-MM-DD strings compare correctly as text.
    if ((min === undefined || value >= min) && (max === undefined || value <= max)) return null;
    if (min !== undefined && max !== undefined) return `Enter a date between ${min} and ${max}.`;
    return min !== undefined ? `Enter a date on or after ${min}.` : `Enter a date on or before ${max}.`;
  }
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (Number.isNaN(n)) return "Enter a number.";
  const min = v.min as number | undefined;
  const max = v.max as number | undefined;
  return between(n, min, max) ? null : `Enter a number ${bounds(min, max)}.`;
}

function countOf(question: Question, value: AnswerValue): number {
  if (question.type === "matrix" && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).filter((cell) => !isEmptyAnswer(cell as AnswerValue)).length;
  }
  return Array.isArray(value) ? value.length : 0;
}

function countUnit(question: Question, n: number | undefined): string {
  const one = n === 1;
  if (question.type === "file") return one ? "file" : "files";
  if (question.type === "matrix") return one ? "row" : "rows";
  return one ? "option" : "options";
}

function runCustom(
  question: Question,
  value: AnswerValue,
  v: CustomValidator,
  custom: CustomValidators | undefined,
  answers: Answers,
): string | null {
  const fn = custom?.[v.name];
  // Never pass silently: an answer that can't be checked is not accepted.
  if (!fn) return `This answer can't be checked (unknown validator "${v.name}").`;
  const result = fn(value, { question, options: v.options ?? {}, answers });
  if (result === true || result === null) return null;
  if (typeof result === "string") return v.message ?? result;
  return v.message ?? "This answer is not valid.";
}

/** One validator against a non-empty answer that already has the right shape. */
function runValidator(
  question: Question,
  value: AnswerValue,
  v: Validator,
  custom: CustomValidators | undefined,
  answers: Answers,
): string | null {
  const fail = (fallback: string) => v.message ?? fallback;
  switch (v.type) {
    case "pattern":
      return typeof value === "string" && compile(v.pattern, v.flags).test(value)
        ? null
        : fail("Enter a value in the expected format.");
    case "length": {
      const n = typeof value === "string" ? [...value].length : 0;
      return between(n, v.min, v.max) ? null : fail(`Enter ${bounds(v.min, v.max, "characters")}.`);
    }
    case "email":
      return typeof value === "string" && EMAIL.test(value) ? null : fail("Enter a valid email address.");
    case "url":
      return typeof value === "string" && isHttpUrl(value) ? null : fail("Enter a valid web address (http or https).");
    case "range": {
      const err = checkRange(question, value, v);
      return err ? fail(err) : null;
    }
    case "count": {
      const n = countOf(question, value);
      if (between(n, v.min, v.max)) return null;
      const verb = question.type === "file" ? "Attach" : question.type === "matrix" ? "Answer" : "Choose";
      return fail(`${verb} ${bounds(v.min, v.max, countUnit(question, v.max ?? v.min))}.`);
    }
    case "custom":
      return runCustom(question, value, v, custom, answers);
  }
}

/** Run a question's validators in order; the first failure wins. */
export function runValidators(
  question: Question,
  value: AnswerValue,
  validators: readonly Validator[],
  context: { custom: CustomValidators | undefined; answers: Answers },
): string | null {
  for (const v of validators) {
    const err = runValidator(question, value, v, context.custom, context.answers);
    if (err) return err;
  }
  return null;
}
