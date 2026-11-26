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

const questionBase = {
  id,
  title: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
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

export const QuestionSchema = z.discriminatedUnion("type", [
  TextQuestionSchema,
  CommentQuestionSchema,
  SingleChoiceQuestionSchema,
  MultipleChoiceQuestionSchema,
  DropdownQuestionSchema,
  RatingQuestionSchema,
  BooleanQuestionSchema,
]);

export const PageSchema = z.object({
  id,
  title: z.string().optional(),
  elements: z.array(QuestionSchema),
});

export const SurveySchema = z
  .object({
    schemaVersion: z.literal(SURVEY_SCHEMA_VERSION),
    id,
    title: z.string().min(1),
    description: z.string().optional(),
    pages: z.array(PageSchema).min(1),
  })
  .superRefine((survey, ctx) => {
    const seen = new Set<string>();
    for (const page of survey.pages) {
      for (const q of page.elements) {
        if (seen.has(q.id)) {
          ctx.addIssue({ code: "custom", message: `Duplicate question id "${q.id}"` });
        }
        seen.add(q.id);
      }
    }
  });

/** A single answer value. Shape depends on the question type. */
export const AnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
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
