/**
 * The Kvesto survey JSON format.
 *
 * Every survey document carries a `schemaVersion`. Bump `SURVEY_SCHEMA_VERSION`
 * when the format changes in a breaking way and add a migration in `migrate.ts`.
 */
import { z } from "zod";

export const SURVEY_SCHEMA_VERSION = 1 as const;

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

const questionBase = {
  id,
  title: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
  /** Show the question only while this condition holds. Hidden questions are not validated or submitted. */
  visibleIf: ConditionSchema.optional(),
  /** Make the question required while this condition holds (in addition to `required`). */
  requiredIf: ConditionSchema.optional(),
};

export const ChoiceSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const TextQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("text"),
  placeholder: z.string().optional(),
  inputType: z.enum(["text", "email", "number", "date", "url", "tel"]).optional(),
});

export const CommentQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("comment"),
  placeholder: z.string().optional(),
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
  labelTrue: z.string().optional(),
  labelFalse: z.string().optional(),
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

export const PageSchema = z.object({
  id,
  title: z.string().optional(),
  /** Show the page only while this condition holds. Hidden pages are skipped. */
  visibleIf: ConditionSchema.optional(),
  elements: z.array(QuestionSchema),
});

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
    schemaVersion: z.literal(SURVEY_SCHEMA_VERSION),
    id,
    title: z.string().min(1),
    description: z.string().optional(),
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

    survey.pages.forEach((page, pi) => {
      // A page condition can only use questions from earlier pages.
      checkCondition(page.visibleIf, ["pages", pi, "visibleIf"], new Set(seen.keys()));
      page.elements.forEach((q, qi) => {
        const path = ["pages", pi, "elements", qi];
        const earlier = new Set(seen.keys());
        checkCondition(q.visibleIf, [...path, "visibleIf"], earlier);
        checkCondition(q.requiredIf, [...path, "requiredIf"], earlier);
        if (seen.has(q.id)) {
          ctx.addIssue({ code: "custom", path: [...path, "id"], message: `Duplicate question id "${q.id}"` });
        }
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
        seen.set(q.id, q);
      });
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
