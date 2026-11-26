import { z } from "@hono/zod-openapi";
import { FileAnswerSchema, ResponseInputSchema, SurveyResponseSchema, SurveySchema } from "@kvesto/schema";

// The same Zod schemas the core uses, registered as named OpenAPI components.
export const Survey = SurveySchema.openapi("Survey", {
  description: "A survey definition in the Kvesto survey JSON format.",
});
export const ResponseInput = ResponseInputSchema.openapi("ResponseInput", {
  description: "Answers submitted by a respondent, keyed by question id.",
});
export const SurveyResponse = SurveyResponseSchema.openapi("SurveyResponse");
export const FileAnswer = FileAnswerSchema.openapi("FileAnswer", {
  description: "An uploaded file as it appears in an answer. Put it in the file question's answer array.",
});

export const FileUpload = z
  .object({
    questionId: z.string().min(1).openapi({ description: "Id of the file question", example: "attachment" }),
    file: z
      .custom<File>((v) => typeof File !== "undefined" && v instanceof File, { message: "Expected a file" })
      .openapi({ type: "string", format: "binary", description: "The file" }),
  })
  .openapi("FileUpload");

export const FileParams = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "customer-feedback" }),
  fileId: z.string().openapi({ param: { name: "fileId", in: "path" } }),
});

export const SurveySummary = z
  .object({
    id: z.string(),
    title: z.string(),
    updatedAt: z.string().optional(),
    responseCount: z.number().int().optional(),
  })
  .openapi("SurveySummary");

export const SurveyList = z.object({ items: z.array(SurveySummary) }).openapi("SurveyList");

export const ResponseList = z
  .object({
    items: z.array(SurveyResponse),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi("ResponseList");

export const ErrorBody = z
  .object({
    error: z.string(),
    issues: z
      .array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }))
      .optional(),
  })
  .openapi("Error");

export const SurveyIdParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "customer-feedback" }),
});

export const Pagination = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50).openapi({ param: { name: "limit", in: "query" } }),
  offset: z.coerce.number().int().min(0).default(0).openapi({ param: { name: "offset", in: "query" } }),
});
