import {
  allQuestions,
  type AnswerValue,
  type Answers,
  type FileAnswer,
  type FileQuestion,
  type Question,
  type Survey,
} from "@kvesto/schema";
import { isEmptyAnswer, resolveLogic } from "./logic.js";
import { runValidators, type CustomValidators } from "./validators.js";

export interface ValidateOptions {
  /** Override `question.required`, e.g. when a `requiredIf` condition holds. */
  required?: boolean;
  /** Functions for `{ "type": "custom", "name": … }` validators, by name. */
  validators?: CustomValidators;
  /** All answers, passed to custom validators that compare questions. */
  answers?: Answers;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isFileAnswer = (v: unknown): v is FileAnswer =>
  isRecord(v) &&
  typeof v.name === "string" &&
  typeof v.type === "string" &&
  typeof v.size === "number" &&
  typeof v.url === "string";

/** Does a file (by name and MIME type) match an `accept` list such as ["image/*", ".pdf"]? */
export function fileMatchesAccept(file: { name: string; type: string }, accept: string[] | undefined): boolean {
  if (!accept || accept.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.some((raw) => {
    const a = raw.trim().toLowerCase();
    if (a.startsWith(".")) return name.endsWith(a);
    if (a.endsWith("/*")) return type.startsWith(a.slice(0, -1));
    return type === a;
  });
}

/** Bytes encoded in a base64 `data:` URL, or null for other URLs. */
function dataUrlBytes(url: string): number | null {
  const m = /^data:[^,]*;base64,(.*)$/s.exec(url);
  if (!m) return null;
  const b64 = m[1]!.replace(/\s/g, "");
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / (1024 * 104.8576)) / 10} MB`;
}

/** Validates one file against a file question's limits. Returns an error message or null. */
export function validateFile(question: FileQuestion, file: { name: string; type: string; size: number }): string | null {
  if (!fileMatchesAccept(file, question.accept)) return `"${file.name}" is not an accepted file type.`;
  if (question.maxSize !== undefined && file.size > question.maxSize) {
    return `"${file.name}" is larger than ${formatBytes(question.maxSize)}.`;
  }
  return null;
}

/**
 * Returns an error message for one answer, or null when it is valid: first
 * `required`, then the answer's shape for its question type, then the
 * question's `validators` in order.
 */
export function validateAnswer(question: Question, value: AnswerValue | undefined, options: ValidateOptions = {}): string | null {
  const required = options.required ?? question.required ?? false;
  if (isEmptyAnswer(value)) return required ? "This question is required." : null;
  const shapeError = checkShape(question, value!, required);
  if (shapeError) return shapeError;
  return question.validators?.length
    ? runValidators(question, value!, question.validators, { custom: options.validators, answers: options.answers ?? {} })
    : null;
}

function checkShape(question: Question, value: AnswerValue, required: boolean): string | null {
  switch (question.type) {
    case "text":
    case "comment":
      if (typeof value !== "string") return "Expected text.";
      if (question.type === "text" && question.inputType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return "Enter a valid email address.";
      }
      return null;
    case "single-choice":
    case "dropdown":
      return typeof value === "string" && question.choices.some((c) => c.value === value)
        ? null
        : "Choose one of the options.";
    case "multiple-choice":
      return Array.isArray(value) && value.every((v) => question.choices.some((c) => c.value === v))
        ? null
        : "Choose from the options.";
    case "rating":
      return typeof value === "number" && Number.isInteger(value) && value >= question.min && value <= question.max
        ? null
        : `Choose a rating from ${question.min} to ${question.max}.`;
    case "boolean":
      return typeof value === "boolean" ? null : "Choose yes or no.";
    case "matrix": {
      if (!isRecord(value)) return "Expected one answer per row.";
      const rows = new Set(question.rows.map((r) => r.value));
      const columns = new Set(question.columns.map((c) => c.value));
      for (const [row, cell] of Object.entries(value)) {
        if (!rows.has(row)) return `Unknown row "${row}".`;
        const picked = question.multiple ? cell : [cell];
        if (!Array.isArray(picked) || !picked.every((c) => typeof c === "string" && columns.has(c))) {
          return question.multiple ? "Choose from the columns in each row." : "Choose one column in each row.";
        }
      }
      if (required) {
        const missing = question.rows.filter((r) => isEmptyAnswer(value[r.value] as AnswerValue | undefined));
        if (missing.length) return `Answer every row (missing: ${missing.map((r) => r.label).join(", ")}).`;
      }
      return null;
    }
    case "ranking": {
      const expected = question.choices.map((c) => c.value);
      const ok =
        Array.isArray(value) &&
        value.length === expected.length &&
        value.every((v) => typeof v === "string" && expected.includes(v)) &&
        new Set(value as string[]).size === value.length;
      return ok ? null : "Rank every item exactly once.";
    }
    case "file": {
      if (!Array.isArray(value) || !value.every(isFileAnswer)) return "Expected uploaded files.";
      if (value.length > question.maxFiles) {
        return question.maxFiles === 1 ? "Attach only one file." : `Attach at most ${question.maxFiles} files.`;
      }
      for (const file of value) {
        const inline = dataUrlBytes(file.url);
        const err = validateFile(question, inline === null ? file : { ...file, size: Math.max(file.size, inline) });
        if (err) return err;
      }
      return null;
    }
  }
}

export interface AnswerIssue {
  questionId: string;
  message: string;
}

/**
 * Validate a full set of answers against a survey, applying its conditional
 * logic: hidden questions are skipped, `requiredIf` is honoured, and answers
 * to unknown questions are reported. Used by the server; handy for your own
 * backend too.
 */
export function validateAnswers(
  survey: Survey,
  answers: Answers,
  options: Pick<ValidateOptions, "validators"> = {},
): { issues: AnswerIssue[]; answers: Answers } {
  const logic = resolveLogic(survey, answers);
  const questions = allQuestions(survey);
  const known = new Set(questions.map((q) => q.id));
  const issues: AnswerIssue[] = Object.keys(answers)
    .filter((k) => !known.has(k))
    .map((questionId) => ({ questionId, message: "Unknown question" }));
  for (const q of questions) {
    if (!logic.visibleQuestions.has(q.id)) continue;
    const message = validateAnswer(q, answers[q.id], {
      required: logic.requiredQuestions.has(q.id),
      validators: options.validators,
      answers: logic.answers,
    });
    if (message) issues.push({ questionId: q.id, message });
  }
  return { issues, answers: logic.answers };
}
