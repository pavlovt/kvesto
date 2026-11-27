import { z } from "@hono/zod-openapi";
import { FileAnswerSchema, ResponseInputSchema, ResponseUpdateSchema, SurveyResponseSchema, SurveySchema } from "@kvesto/schema";

// Zod 4 copies methods onto each schema when it is created, so schemas that @kvesto/schema built before
// @hono/zod-openapi patched Zod (for example when an app imports `kvesto` before `@kvesto/server`) have no
// `.openapi` method of their own. Call the patched prototype method directly so import order never matters.
type OpenApiArgs = Parameters<z.ZodType["openapi"]>;
function named<T extends z.ZodType>(schema: T, ...args: OpenApiArgs): T {
  return (z.ZodType.prototype.openapi as (this: T, ...a: OpenApiArgs) => T).apply(schema, args);
}

// The same Zod schemas the core uses, registered as named OpenAPI components.
export const Survey = named(SurveySchema, "Survey", {
  description: "A survey definition in the Kvesto survey JSON format.",
});
export const ResponseInput = named(ResponseInputSchema, "ResponseInput", {
  description: "Answers submitted by a respondent, keyed by question id.",
});
export const SurveyResponse = named(SurveyResponseSchema, "SurveyResponse");
export const ResponseUpdate = named(ResponseUpdateSchema, "ResponseUpdate", {
  description: "More answers for a partial response, or its submission (status complete), with its resume token.",
});
export const ResumeRequest = z.object({ token: z.string().min(1).max(200) }).openapi("ResumeRequest");
export const FileAnswer = named(FileAnswerSchema, "FileAnswer", {
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
    /** Pass as `cursor` for the next page; absent on the last page. */
    nextCursor: z.string().optional(),
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
  /** Which responses: completed ones (default), partial ones, or all. */
  status: z.enum(["complete", "partial", "all"]).default("complete").openapi({ param: { name: "status", in: "query" } }),
  /** `name:value`, repeatable: keep responses whose hidden field has that value. */
  hidden: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .openapi({ param: { name: "hidden", in: "query", description: "name:value, repeatable" } }),
  /** `questionId:value`, repeatable: keep responses whose answer is exactly that value (top-level questions). */
  answer: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .openapi({ param: { name: "answer", in: "query", description: "questionId:value, repeatable" } }),
  /** Created on or after this date or date-time (ISO 8601). */
  from: z.string().max(40).optional().openapi({ param: { name: "from", in: "query" } }),
  /** Created on or before this date (the whole day) or date-time. */
  to: z.string().max(40).optional().openapi({ param: { name: "to", in: "query" } }),
  /** The `nextCursor` of the previous page: faster than `offset` for large surveys. */
  cursor: z.string().max(200).optional().openapi({ param: { name: "cursor", in: "query" } }),
});

/** The list filters, plus how to write choices. */
export const ExportQuery = Pagination.omit({ limit: true, offset: true, cursor: true }).extend({
  values: z
    .enum(["true", "false"])
    .default("false")
    .openapi({ param: { name: "values", in: "query", description: "true for choice values instead of labels" } }),
});

export const WebhookInput = z
  .object({
    url: z.string().url().max(2000).openapi({ example: "https://example.com/hooks/kvesto" }),
    events: z.array(z.enum(["response.completed", "response.updated"])).min(1).default(["response.completed"]),
  })
  .openapi("WebhookInput");

export const Webhook = z
  .object({ id: z.string(), url: z.string(), events: z.array(z.string()), createdAt: z.string() })
  .openapi("Webhook");

export const CreatedWebhook = Webhook.extend({
  /** The signing secret. Shown only now: store it where the receiver can check signatures. */
  secret: z.string(),
}).openapi("CreatedWebhook");

export const WebhookList = z.object({ items: z.array(Webhook) }).openapi("WebhookList");

export const Delivery = z
  .object({
    id: z.string(),
    event: z.string(),
    status: z.enum(["pending", "succeeded", "failed"]),
    attempts: z.number().int(),
    lastStatusCode: z.number().int().nullable(),
    lastError: z.string().nullable(),
    nextAttemptAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("WebhookDelivery");

export const DeliveryList = z.object({ items: z.array(Delivery) }).openapi("WebhookDeliveryList");

export const WebhookParams = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
  webhookId: z.string().openapi({ param: { name: "webhookId", in: "path" } }),
});

export const ResponseParams = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "customer-feedback" }),
  responseId: z.string().openapi({ param: { name: "responseId", in: "path" } }),
});
