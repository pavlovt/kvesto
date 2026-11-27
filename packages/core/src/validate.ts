import {
  panelQuestions,
  walkElements,
  type AnswerValue,
  type Element,
  type Panel,
  type Answers,
  type FileAnswer,
  type FileQuestion,
  type Question,
  type Survey,
} from "@kvesto/schema";
import { isEmptyAnswer, repeatItems, resolveLogic, type SurveyLogic } from "./logic.js";
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
  /**
   * Where the problem is, as an error key: a question id, a repeating panel id
   * (for the number of items), or `panelId.index.questionId` for a question
   * inside an item of a repeating panel.
   */
  questionId: string;
  message: string;
  /** The same location as a path into the answers, e.g. `["children", 0, "age"]`. */
  path: (string | number)[];
}

/** The error key of a question inside an item of a repeating panel. */
export function itemKey(panelId: string, index: number, questionId: string): string {
  return `${panelId}.${index}.${questionId}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Validate a repeating panel's answer: the number of items, and every visible
 * question in every item (with that item's conditional logic).
 */
export function validateRepeat(
  panel: Panel,
  value: AnswerValue | undefined,
  logic: SurveyLogic,
  options: Pick<ValidateOptions, "validators"> & { strict?: boolean } = {},
): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  const add = (questionId: string, message: string, path: (string | number)[]) => issues.push({ questionId, message, path });
  if (value !== undefined && value !== null && (!Array.isArray(value) || repeatItems(value).length !== value.length)) {
    add(panel.id, "Expected a list of items.", [panel.id]);
    return issues;
  }
  const raw = repeatItems(value);
  const { min = 0, max } = panel.repeat ?? {};
  if (raw.length < min) add(panel.id, `Add at least ${plural(min, "item", "items")}.`, [panel.id]);
  if (max !== undefined && raw.length > max) add(panel.id, `Add at most ${plural(max, "item", "items")}.`, [panel.id]);

  const questions = panelQuestions<Element>(panel);
  const known = new Set(questions.map((q) => q.id));
  const itemLogic = logic.items[panel.id] ?? [];
  raw.forEach((item, i) => {
    if (options.strict) {
      for (const k of Object.keys(item)) if (!known.has(k)) add(itemKey(panel.id, i, k), "Unknown question", [panel.id, i, k]);
    }
    const il = itemLogic[i];
    if (!il) return;
    for (const q of questions) {
      if (!il.visibleQuestions.has(q.id)) continue;
      const message = validateAnswer(q, item[q.id], {
        required: il.requiredQuestions.has(q.id),
        validators: options.validators,
        answers: { ...logic.answers, ...il.answers },
      });
      if (message) add(itemKey(panel.id, i, q.id), message, [panel.id, i, q.id]);
    }
  });
  return issues;
}

/** The questions and repeating panels to validate for some elements: questions inside repeats belong to their panel. */
export function validationTargets(elements: readonly Element[]): { questions: Question[]; repeats: Panel[] } {
  const questions: Question[] = [];
  const repeats: Panel[] = [];
  walkElements({ pages: [{ elements }] }, (el) => {
    if (el.type !== "panel") questions.push(el);
    else if (el.repeat) {
      repeats.push(el);
      return "skip";
    }
  });
  return { questions, repeats };
}

/**
 * Validate a full set of answers against a survey, applying its conditional
 * logic: hidden questions are skipped, `requiredIf` is honoured, repeating
 * panels are checked item by item, and answers to unknown questions are
 * reported. Used by the server; handy for your own backend too.
 */
export function validateAnswers(
  survey: Survey,
  answers: Answers,
  options: Pick<ValidateOptions, "validators"> = {},
): { issues: AnswerIssue[]; answers: Answers } {
  const logic = resolveLogic(survey, answers);
  const { questions, repeats } = validationTargets(survey.pages.flatMap((p) => p.elements));
  const known = new Set([...questions, ...repeats].map((q) => q.id));
  const issues: AnswerIssue[] = Object.keys(answers)
    .filter((k) => !known.has(k))
    .map((questionId) => ({ questionId, message: "Unknown question", path: [questionId] }));
  for (const q of questions) {
    if (!logic.visibleQuestions.has(q.id)) continue;
    const message = validateAnswer(q, answers[q.id], {
      required: logic.requiredQuestions.has(q.id),
      validators: options.validators,
      answers: logic.answers,
    });
    if (message) issues.push({ questionId: q.id, message, path: [q.id] });
  }
  for (const panel of repeats) {
    if (!logic.visiblePanels.has(panel.id)) continue;
    issues.push(...validateRepeat(panel, answers[panel.id], logic, { validators: options.validators, strict: true }));
  }
  return { issues, answers: logic.answers };
}
