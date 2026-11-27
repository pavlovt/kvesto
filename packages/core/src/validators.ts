import { textOf, type AnswerValue, type Answers, type CustomValidator, type Question, type RangeValidator, type Validator } from "@kvesto/schema";
import { isEmptyAnswer } from "./logic.js";
import { evaluateExpressionCondition, type EvaluateOptions } from "./expression.js";
import { bounds, message, type MessageKey } from "./i18n.js";

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

function checkRange(question: Question, value: AnswerValue, v: RangeValidator, L: string | undefined): string | null {
  if (question.type === "text" && question.inputType === "date") {
    if (typeof value !== "string") return message(L, "date");
    const min = v.min as string | undefined;
    const max = v.max as string | undefined;
    // YYYY-MM-DD strings compare correctly as text.
    if ((min === undefined || value >= min) && (max === undefined || value <= max)) return null;
    if (min !== undefined && max !== undefined) return message(L, "dateBetween", { min, max });
    return min !== undefined ? message(L, "dateMin", { min }) : message(L, "dateMax", { max: max! });
  }
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (Number.isNaN(n)) return message(L, "number");
  const min = v.min as number | undefined;
  const max = v.max as number | undefined;
  return between(n, min, max) ? null : message(L, "numberRange", { bounds: bounds(L, min, max) });
}

function countOf(question: Question, value: AnswerValue): number {
  if (question.type === "matrix" && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).filter((cell) => !isEmptyAnswer(cell as AnswerValue)).length;
  }
  return Array.isArray(value) ? value.length : 0;
}

function countUnit(question: Question, n: number | undefined): MessageKey {
  const one = n === 1;
  if (question.type === "file") return one ? "unitFile" : "unitFiles";
  if (question.type === "matrix") return one ? "unitRow" : "unitRows";
  return one ? "unitOption" : "unitOptions";
}

function runCustom(
  question: Question,
  value: AnswerValue,
  v: CustomValidator,
  custom: CustomValidators | undefined,
  answers: Answers,
  L?: string,
): string | null {
  const fn = custom?.[v.name];
  // Never pass silently: an answer that can't be checked is not accepted.
  if (!fn) return `This answer can't be checked (unknown validator "${v.name}").`;
  const result = fn(value, { question, options: v.options ?? {}, answers });
  if (result === true || result === null) return null;
  if (typeof result === "string") return v.message ? textOf(v.message, L) : result;
  return v.message ? textOf(v.message, L) : message(L, "invalid");
}

/** One validator against a non-empty answer that already has the right shape. */
function runValidator(
  question: Question,
  value: AnswerValue,
  v: Validator,
  custom: CustomValidators | undefined,
  answers: Answers,
  expression?: EvaluateOptions,
  L?: string,
): string | null {
  const fail = (fallback: string) => (v.message ? textOf(v.message, L) : fallback);
  switch (v.type) {
    case "pattern":
      return typeof value === "string" && compile(v.pattern, v.flags).test(value)
        ? null
        : fail(message(L, "format"));
    case "length": {
      const n = typeof value === "string" ? [...value].length : 0;
      return between(n, v.min, v.max) ? null : fail(message(L, "length", { bounds: bounds(L, v.min, v.max) }));
    }
    case "email":
      return typeof value === "string" && EMAIL.test(value) ? null : fail(message(L, "email"));
    case "url":
      return typeof value === "string" && isHttpUrl(value) ? null : fail(message(L, "url"));
    case "range": {
      const err = checkRange(question, value, v, L);
      return err ? fail(err) : null;
    }
    case "count": {
      const n = countOf(question, value);
      if (between(n, v.min, v.max)) return null;
      const verb = message(L, question.type === "file" ? "verbAttach" : question.type === "matrix" ? "verbAnswer" : "verbChoose");
      return fail(message(L, "count", { verb, bounds: bounds(L, v.min, v.max), unit: message(L, countUnit(question, v.max ?? v.min)) }));
    }
    case "expression":
      return evaluateExpressionCondition(v.expr, answers, expression ?? {}) ? null : fail(message(L, "invalid"));
    case "custom":
      return runCustom(question, value, v, custom, answers, L);
  }
}

/** Run a question's validators in order; the first failure wins. */
export function runValidators(
  question: Question,
  value: AnswerValue,
  validators: readonly Validator[],
  context: {
    custom: CustomValidators | undefined;
    answers: Answers;
    /** Functions, variables and the repeat item for `expression` rules. */
    expression?: EvaluateOptions;
    /** Locale of the messages. Default English. */
    locale?: string;
  },
): string | null {
  for (const v of validators) {
    const err = runValidator(question, value, v, context.custom, context.answers, context.expression, context.locale);
    if (err) return err;
  }
  return null;
}
