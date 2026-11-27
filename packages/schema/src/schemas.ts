/**
 * The Kvesto survey JSON format.
 *
 * Every survey document carries a `schemaVersion`. Bump `SURVEY_SCHEMA_VERSION`
 * when the format changes in a breaking way and add a migration in `migrate.ts`.
 */
import { z } from "zod";
import { walkElements } from "./elements.js";

export const SURVEY_SCHEMA_VERSION = 1 as const;

/**
 * Human-readable text shown to respondents (titles, descriptions, labels,
 * placeholders). A plain string today; localization will widen this one
 * schema to also accept per-locale strings, so every text field gets it at once.
 */
export const DisplayTextSchema = z.string();
/** Display text that must not be empty. */
export const RequiredDisplayTextSchema = DisplayTextSchema.min(1);
export type DisplayText = z.infer<typeof DisplayTextSchema>;

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, '-' or '_'");

/** A literal a condition compares an answer with. */
export const ConditionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const ConditionOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "notContains",
  "in",
  "notIn",
  "empty",
  "notEmpty",
]);

/** Compares the answer to one question (or one matrix row) with a value. */
export const ComparisonSchema = z.object({
  question: id,
  /** For matrix questions: the row whose answer is compared. */
  row: z.string().min(1).optional(),
  op: ConditionOperatorSchema,
  /** Omitted for `empty` / `notEmpty`; an array for `in` / `notIn`. */
  value: z.union([ConditionValueSchema, z.array(ConditionValueSchema)]).optional(),
});

export type ConditionValue = z.infer<typeof ConditionValueSchema>;
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;
export type Comparison = z.infer<typeof ComparisonSchema>;
export type Condition = Comparison | { all: Condition[] } | { any: Condition[] } | { not: Condition };

/**
 * Conditional logic as plain JSON data (never evaluated as code).
 *
 * - `{ "question": "role", "op": "eq", "value": "dev" }`
 * - `{ "all": [ ... ] }`, `{ "any": [ ... ] }`, `{ "not": { ... } }`
 *
 * A condition may only refer to questions that come earlier in the survey.
 */
export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    ComparisonSchema.strict(),
    z.object({ all: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ any: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ not: ConditionSchema }).strict(),
  ]),
).meta({ id: "Condition", description: "Conditional logic: a comparison, or all / any / not of conditions." });

/** An optional error message shown instead of the validator's default one. */
const validatorMessage = { message: DisplayTextSchema.optional() };
const bound = z.number().int().nonnegative();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

/** Longest regular expression accepted in a `pattern` validator. */
export const MAX_PATTERN_LENGTH = 500;

/** Text must match a regular expression (the whole answer, so `^`/`$` are implied). For text and comment. */
export const PatternValidatorSchema = z.object({
  type: z.literal("pattern"),
  pattern: z.string().min(1).max(MAX_PATTERN_LENGTH),
  /** Regular expression flags: any of `i`, `m`, `s`, `u`. */
  flags: z.string().regex(/^[imsu]*$/, "Use only the flags i, m, s and u").optional(),
  ...validatorMessage,
});

/** Number of characters. For text and comment. */
export const LengthValidatorSchema = z.object({
  type: z.literal("length"),
  min: bound.optional(),
  max: bound.optional(),
  ...validatorMessage,
});

/**
 * Allowed values. Numbers for ratings and `inputType: "number"` text,
 * YYYY-MM-DD dates for `inputType: "date"` text.
 */
export const RangeValidatorSchema = z.object({
  type: z.literal("range"),
  min: z.union([z.number(), isoDate]).optional(),
  max: z.union([z.number(), isoDate]).optional(),
  ...validatorMessage,
});

/** How many options are picked (multiple choice), files attached, or matrix rows answered. */
export const CountValidatorSchema = z.object({
  type: z.literal("count"),
  min: bound.optional(),
  max: bound.optional(),
  ...validatorMessage,
});

/** A well-formed email address. For text. */
export const EmailValidatorSchema = z.object({ type: z.literal("email"), ...validatorMessage });

/** An absolute http(s) URL. For text. */
export const UrlValidatorSchema = z.object({ type: z.literal("url"), ...validatorMessage });

/**
 * A rule implemented by the host application: a function registered under
 * `name` with `createSurvey({ validators })` and the server's `createApp({ validators })`.
 */
export const CustomValidatorSchema = z.object({
  type: z.literal("custom"),
  name: id,
  /** Passed to the registered function as-is. */
  options: z.record(z.string(), z.unknown()).optional(),
  ...validatorMessage,
});

export const ValidatorSchema = z
  .discriminatedUnion("type", [
    PatternValidatorSchema,
    LengthValidatorSchema,
    RangeValidatorSchema,
    CountValidatorSchema,
    EmailValidatorSchema,
    UrlValidatorSchema,
    CustomValidatorSchema,
  ])
  .meta({ id: "Validator", description: "A rule an answer must follow, checked by the runner and the server." });

export type Validator = z.infer<typeof ValidatorSchema>;
export type ValidatorType = Validator["type"];
export type PatternValidator = z.infer<typeof PatternValidatorSchema>;
export type RangeValidator = z.infer<typeof RangeValidatorSchema>;
export type CustomValidator = z.infer<typeof CustomValidatorSchema>;

const questionBase = {
  id,
  title: RequiredDisplayTextSchema,
  description: DisplayTextSchema.optional(),
  required: z.boolean().optional(),
  /** Show the question only while this condition holds. Hidden questions are not validated or submitted. */
  visibleIf: ConditionSchema.optional(),
  /** Make the question required while this condition holds (in addition to `required`). */
  requiredIf: ConditionSchema.optional(),
  /** Extra rules for a non-empty answer. Empty answers are only checked by `required`. */
  validators: z.array(ValidatorSchema).optional(),
};

export const ChoiceSchema = z.object({
  value: z.string().min(1),
  label: RequiredDisplayTextSchema,
});

export const TextQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("text"),
  placeholder: DisplayTextSchema.optional(),
  inputType: z.enum(["text", "email", "number", "date", "url", "tel"]).optional(),
});

export const CommentQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("comment"),
  placeholder: DisplayTextSchema.optional(),
  rows: z.number().int().positive().optional(),
});

export const SingleChoiceQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("single-choice"),
  choices: z.array(ChoiceSchema).min(1),
});

export const MultipleChoiceQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("multiple-choice"),
  choices: z.array(ChoiceSchema).min(1),
});

export const DropdownQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("dropdown"),
  choices: z.array(ChoiceSchema).min(1),
});

export const RatingQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("rating"),
  min: z.number().int().default(1),
  max: z.number().int().default(5),
});

export const BooleanQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("boolean"),
  labelTrue: DisplayTextSchema.optional(),
  labelFalse: DisplayTextSchema.optional(),
});

/**
 * A grid: each row is a statement, each column is one of a shared set of answers.
 * Answer: `{ [rowValue]: columnValue }`, or `{ [rowValue]: columnValue[] }` with `multiple`.
 * `required` means every row must be answered.
 */
export const MatrixQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("matrix"),
  rows: z.array(ChoiceSchema).min(1),
  columns: z.array(ChoiceSchema).min(1),
  /** Allow several columns per row (checkboxes instead of radio buttons). */
  multiple: z.boolean().optional(),
});

/** Order a list of choices. Answer: every choice value, most preferred first. */
export const RankingQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("ranking"),
  choices: z.array(ChoiceSchema).min(2),
});

/**
 * File upload. Files go through the storage adapter's `uploadFile`; without one
 * they are embedded in the answer as data URLs.
 */
export const FileQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("file"),
  /** Accepted MIME types or extensions, e.g. ["image/*", "application/pdf", ".csv"]. Default: anything. */
  accept: z.array(z.string().min(1)).optional(),
  /** Maximum size per file in bytes. */
  maxSize: z.number().int().positive().optional(),
  /** How many files a respondent may attach. Default 1. */
  maxFiles: z.number().int().positive().default(1),
});

export const QuestionSchema = z.discriminatedUnion("type", [
  TextQuestionSchema,
  CommentQuestionSchema,
  SingleChoiceQuestionSchema,
  MultipleChoiceQuestionSchema,
  DropdownQuestionSchema,
  RatingQuestionSchema,
  BooleanQuestionSchema,
  MatrixQuestionSchema,
  RankingQuestionSchema,
  FileQuestionSchema,
]);

/**
 * A group of elements with an optional title, shown as one block. Panels can
 * be nested. Hiding a panel hides everything in it. Panels don't change the
 * answers: questions keep unique ids across the survey and answers stay flat,
 * keyed by question id.
 */
export interface Panel {
  type: "panel";
  id: string;
  title?: DisplayText;
  description?: DisplayText;
  /** Show the panel (and everything in it) only while this condition holds. */
  visibleIf?: Condition;
  elements: Element[];
}

/** Survey JSON for a panel as authored, before defaults are applied. */
export interface PanelInput {
  type: "panel";
  id: string;
  title?: DisplayText;
  description?: DisplayText;
  visibleIf?: Condition;
  elements: ElementInput[];
}

/** Something a page or panel can hold: a question or a panel. */
export type Element = Question | Panel;
export type ElementInput = z.input<typeof QuestionSchema> | PanelInput;
export type ElementType = Element["type"];

export const PanelSchema: z.ZodType<Panel, PanelInput> = z
  .object({
    type: z.literal("panel"),
    id,
    title: DisplayTextSchema.optional(),
    description: DisplayTextSchema.optional(),
    visibleIf: ConditionSchema.optional(),
    get elements() {
      return z.array(ElementSchema);
    },
  })
  .meta({ id: "Panel", description: "A titled group of questions and panels." }) as unknown as z.ZodType<Panel, PanelInput>;

export const ElementSchema: z.ZodType<Element, ElementInput> = z
  .lazy(() => z.union([QuestionSchema, PanelSchema]))
  .meta({ id: "Element", description: "A question or a panel." });

export const PageSchema = z.object({
  id,
  title: DisplayTextSchema.optional(),
  /** Show the page only while this condition holds. Hidden pages are skipped. */
  visibleIf: ConditionSchema.optional(),
  /** Questions and panels, in order. */
  elements: z.array(ElementSchema),
});

/** Is `validator` meaningful for `question`? Returns the reason when not. */
export function validatorProblem(question: Question, validator: Validator): string | null {
  const textual = question.type === "text" || question.type === "comment";
  switch (validator.type) {
    case "pattern":
      try {
        new RegExp(validator.pattern, validator.flags);
      } catch (e) {
        return `Invalid regular expression: ${(e as Error).message}`;
      }
      return textual ? null : "pattern only applies to text and comment questions";
    case "length":
      return textual ? null : "length only applies to text and comment questions";
    case "email":
    case "url":
      return question.type === "text" ? null : `${validator.type} only applies to text questions`;
    case "count":
      return question.type === "multiple-choice" || question.type === "file" || question.type === "matrix"
        ? null
        : "count only applies to multiple-choice, file and matrix questions";
    case "range": {
      const kind =
        question.type === "rating" || (question.type === "text" && question.inputType === "number")
          ? "number"
          : question.type === "text" && question.inputType === "date"
            ? "string"
            : null;
      if (!kind) return 'range only applies to ratings and text questions with inputType "number" or "date"';
      for (const v of [validator.min, validator.max]) {
        if (v !== undefined && typeof v !== kind) {
          return kind === "number" ? "range bounds must be numbers here" : "range bounds must be YYYY-MM-DD dates here";
        }
      }
      return null;
    }
    case "custom":
      return null;
  }
}

/** Every comparison inside a condition tree. */
export function conditionComparisons(condition: Condition): Comparison[] {
  if ("all" in condition) return condition.all.flatMap(conditionComparisons);
  if ("any" in condition) return condition.any.flatMap(conditionComparisons);
  if ("not" in condition) return conditionComparisons(condition.not);
  return [condition];
}

const uniqueValues = (items: { value: string }[]) => new Set(items.map((i) => i.value)).size === items.length;

export const SurveySchema = z
  .object({
    /** Optional link to the published JSON Schema, so editors can autocomplete and check the file. Ignored by Kvesto. */
    $schema: z.string().optional(),
    schemaVersion: z.literal(SURVEY_SCHEMA_VERSION),
    id,
    title: RequiredDisplayTextSchema,
    description: DisplayTextSchema.optional(),
    pages: z.array(PageSchema).min(1),
  })
  .superRefine((survey, ctx) => {
    // Question ids seen so far, in survey order: conditions may only look back.
    const seen = new Map<string, Question>();
    const checkCondition = (condition: Condition | undefined, path: (string | number)[], earlierOnly: Set<string>) => {
      if (!condition) return;
      for (const c of conditionComparisons(condition)) {
        const target = seen.get(c.question);
        if (!target || !earlierOnly.has(c.question)) {
          ctx.addIssue({
            code: "custom",
            path,
            message: `Condition refers to "${c.question}", which is not an earlier question`,
          });
        } else if (c.row !== undefined && (target.type !== "matrix" || !target.rows.some((r) => r.value === c.row))) {
          ctx.addIssue({ code: "custom", path, message: `"${c.row}" is not a row of matrix question "${c.question}"` });
        }
      }
    };

    const elementIds = new Set<string>();
    let pageIndex = -1;
    walkElements(survey, (el, at) => {
      if (at.pageIndex !== pageIndex) {
        pageIndex = at.pageIndex;
        // A page condition can only use questions from earlier pages.
        const page = survey.pages[pageIndex]!;
        checkCondition(page.visibleIf, ["pages", pageIndex, "visibleIf"], new Set(seen.keys()));
      }
      const path = at.path;
      const earlier = new Set(seen.keys());
      checkCondition(el.visibleIf, [...path, "visibleIf"], earlier);
      if (elementIds.has(el.id)) {
        ctx.addIssue({ code: "custom", path: [...path, "id"], message: `Duplicate element id "${el.id}"` });
      }
      elementIds.add(el.id);
      if (el.type === "panel") return;
      const q = el;
      checkCondition(q.requiredIf, [...path, "requiredIf"], earlier);
      if ("choices" in q && !uniqueValues(q.choices)) {
        ctx.addIssue({ code: "custom", path: [...path, "choices"], message: "Choice values must be unique" });
      }
      if (q.type === "matrix") {
        if (!uniqueValues(q.rows)) ctx.addIssue({ code: "custom", path: [...path, "rows"], message: "Row values must be unique" });
        if (!uniqueValues(q.columns)) {
          ctx.addIssue({ code: "custom", path: [...path, "columns"], message: "Column values must be unique" });
        }
      }
      if (q.type === "rating" && q.min > q.max) {
        ctx.addIssue({ code: "custom", path: [...path, "max"], message: "max must be at least min" });
      }
      q.validators?.forEach((v, vi) => {
        const vpath = [...path, "validators", vi];
        const problem = validatorProblem(q, v);
        if (problem) ctx.addIssue({ code: "custom", path: vpath, message: problem });
        if ("min" in v && v.min !== undefined && v.max !== undefined && v.min > v.max) {
          ctx.addIssue({ code: "custom", path: [...vpath, "max"], message: "max must be at least min" });
        }
      });
      seen.set(q.id, q);
    });
    // Pages without elements still get their condition checked.
    survey.pages.forEach((page, pi) => {
      if (page.elements.length === 0) checkCondition(page.visibleIf, ["pages", pi, "visibleIf"], new Set(seen.keys()));
    });
  });

/** One uploaded file, as stored in an answer. */
export const FileAnswerSchema = z.object({
  name: z.string().min(1),
  /** MIME type, "" when unknown. */
  type: z.string(),
  /** Size in bytes. */
  size: z.number().int().nonnegative(),
  /** Where to fetch the file: a URL returned by the storage adapter, or a `data:` URL. */
  url: z.string().min(1),
});

/** A matrix answer: row value → column value (or values with `multiple`). */
export const MatrixAnswerSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

/**
 * A single answer value. Shape depends on the question type:
 * text/choice → string, rating → number, boolean → boolean,
 * multiple-choice/ranking → string[], file → FileAnswer[], matrix → object.
 */
export const AnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(FileAnswerSchema),
  MatrixAnswerSchema,
  z.null(),
]);

export const AnswersSchema = z.record(z.string(), AnswerValueSchema);

/** What a client sends when a respondent completes a survey. */
export const ResponseInputSchema = z.object({
  answers: AnswersSchema,
  meta: z.record(z.string(), z.unknown()).optional(),
});

/** A stored response. */
export const SurveyResponseSchema = ResponseInputSchema.extend({
  id: z.string(),
  surveyId: id,
  createdAt: z.string(),
});

export type Choice = z.infer<typeof ChoiceSchema>;
export type MatrixQuestion = z.infer<typeof MatrixQuestionSchema>;
export type RankingQuestion = z.infer<typeof RankingQuestionSchema>;
export type FileQuestion = z.infer<typeof FileQuestionSchema>;
export type FileAnswer = z.infer<typeof FileAnswerSchema>;
export type MatrixAnswer = z.infer<typeof MatrixAnswerSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionType = Question["type"];
export type Page = z.infer<typeof PageSchema>;
export type Survey = z.infer<typeof SurveySchema>;
/** Survey JSON as authored, before defaults are applied. */
export type SurveyInput = z.input<typeof SurveySchema>;
export type AnswerValue = z.infer<typeof AnswerValueSchema>;
export type Answers = z.infer<typeof AnswersSchema>;
export type ResponseInput = z.infer<typeof ResponseInputSchema>;
export type SurveyResponse = z.infer<typeof SurveyResponseSchema>;

export { z };
