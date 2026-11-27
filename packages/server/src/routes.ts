import { createRoute, z } from "@hono/zod-openapi";
import {
  ErrorBody,
  FileAnswer,
  FileParams,
  FileUpload,
  ExportQuery,
  CreatedWebhook,
  DeliveryList,
  WebhookInput,
  WebhookList,
  WebhookParams,
  Pagination,
  ResponseInput,
  ResponseList,
  ResponseParams,
  ResponseUpdate,
  ResumeRequest,
  Survey,
  SurveyIdParam,
  SurveyList,
  SurveyResponse,
} from "./openapi-schemas.js";

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});
const error = (description: string) => json(ErrorBody, description);

/**
 * Marks an operation that needs an API key under the default `apiKeyAuth` policy.
 * Respondent operations (read a survey, submit, upload, download a file) stay public.
 */
const admin: { security: Record<string, string[]>[] } = { security: [{ bearerAuth: [] }] };
const refused = {
  401: error("Missing or invalid API key"),
  403: error("Not allowed"),
};

export const health = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Health check",
  responses: { 200: json(z.object({ status: z.literal("ok") }), "Service is up") },
});

export const listSurveys = createRoute({
  method: "get",
  path: "/surveys",
  ...admin,
  tags: ["Surveys"],
  summary: "List surveys",
  responses: {
    ...refused,
    200: json(SurveyList, "Survey summaries, most recently updated first") },
});

export const createSurvey = createRoute({
  method: "post",
  path: "/surveys",
  ...admin,
  tags: ["Surveys"],
  summary: "Create a survey",
  request: { body: { ...json(Survey, "Survey definition"), required: true } },
  responses: {
    ...refused,
    201: json(Survey, "Created"),
    400: error("Invalid survey JSON"),
    409: error("A survey with this id already exists"),
  },
});

export const getSurvey = createRoute({
  method: "get",
  path: "/surveys/{id}",
  tags: ["Surveys"],
  summary: "Get a survey definition",
  request: { params: SurveyIdParam },
  responses: { 200: json(Survey, "The survey"), 404: error("Not found") },
});

export const putSurvey = createRoute({
  method: "put",
  path: "/surveys/{id}",
  ...admin,
  tags: ["Surveys"],
  summary: "Create or replace a survey",
  request: { params: SurveyIdParam, body: { ...json(Survey, "Survey definition"), required: true } },
  responses: {
    ...refused,
    200: json(Survey, "Saved"),
    400: error("Invalid survey JSON, or the body id does not match the path"),
  },
});

export const deleteSurvey = createRoute({
  method: "delete",
  path: "/surveys/{id}",
  ...admin,
  tags: ["Surveys"],
  summary: "Delete a survey and its responses",
  request: { params: SurveyIdParam },
  responses: {
    ...refused, 204: { description: "Deleted" }, 404: error("Not found") },
});

export const submitResponse = createRoute({
  method: "post",
  path: "/surveys/{id}/responses",
  tags: ["Responses"],
  summary: "Submit a response",
  description:
    "Answers are validated against the survey's questions with the same rules the core runtime uses. " +
    'With `status: "partial"` the answers are saved as progress (nothing is required yet) and the reply carries a ' +
    "`resumeToken` to update, complete or resume them. The survey's availability settings are enforced: " +
    "`opensAt`/`closesAt` (403), `maxResponses` and `oneResponsePer` (409), `requireRespondent` (401); the error's " +
    "`reason` says which. For `oneResponsePer: \"browser\"` send `meta.browserId` (the runner does).",
  request: { params: SurveyIdParam, body: { ...json(ResponseInput, "Answers"), required: true } },
  responses: {
    201: json(SurveyResponse, "Stored response"),
    400: error("Answers do not match the survey"),
    401: error("The survey needs an identified respondent"),
    403: error("The survey is not open"),
    404: error("Survey not found"),
    409: error("The survey is full, this respondent answered already, or the same answers were just sent"),
    413: error("The response's files are over the response quota"),
    429: error("Too many requests (see Retry-After)"),
  },
});

export const updateResponse = createRoute({
  method: "patch",
  path: "/surveys/{id}/responses/{responseId}",
  tags: ["Responses"],
  summary: "Update or complete a partial response",
  description: "Needs the response's resume token. A completed response can't be changed.",
  request: { params: ResponseParams, body: { ...json(ResponseUpdate, "New answers and the resume token"), required: true } },
  responses: {
    200: json(SurveyResponse, "Updated response"),
    400: error("Answers do not match the survey"),
    401: error("The survey needs an identified respondent"),
    403: error("Wrong resume token, or the survey is not open"),
    404: error("Response not found"),
    409: error("The response is already complete, or the survey is full"),
    413: error("The response's files are over the response quota"),
    429: error("Too many requests (see Retry-After)"),
  },
});

export const releaseScore = createRoute({
  method: "post",
  path: "/surveys/{id}/responses/{responseId}/release",
  ...admin,
  tags: ["Responses"],
  summary: "Release a quiz score kept back for review",
  request: { params: ResponseParams },
  responses: {
    ...refused,
    200: json(SurveyResponse, "The response, with its score released"),
    404: error("Response not found"),
    409: error("Not a quiz response"),
  },
});

export const resumeResponse = createRoute({
  method: "post",
  path: "/surveys/{id}/responses/{responseId}/resume",
  tags: ["Responses"],
  summary: "Load a partial response to continue it",
  description: "The resume token goes in the body, never in the URL, so it doesn't end up in logs.",
  request: { params: ResponseParams, body: { ...json(ResumeRequest, "The resume token"), required: true } },
  responses: {
    200: json(SurveyResponse, "The partial response"),
    403: error("Wrong resume token"),
    404: error("Response not found"),
    409: error("The response is already complete"),
  },
});

export const listResponses = createRoute({
  method: "get",
  path: "/surveys/{id}/responses",
  ...admin,
  tags: ["Responses"],
  summary: "List responses",
  request: { params: SurveyIdParam, query: Pagination },
  responses: {
    ...refused,
    200: json(ResponseList, "Responses, newest first"),
    400: error("Invalid cursor"),
    404: error("Survey not found"),
  },
});

export const exportResponses = createRoute({
  method: "get",
  path: "/surveys/{id}/responses.csv",
  ...admin,
  tags: ["Responses"],
  summary: "Export responses as CSV",
  description:
    "Every matching response (same filters as the list), one column per answer part, then hidden fields. " +
    "Labels by default; `values=true` for choice values. Cells that would run as spreadsheet formulas are defused.",
  request: { params: SurveyIdParam, query: ExportQuery },
  responses: {
    ...refused,
    200: { content: { "text/csv": { schema: z.string() } }, description: "CSV (UTF-8 with a byte order mark)" },
    404: error("Survey not found"),
  },
});

export const createWebhook = createRoute({
  method: "post",
  path: "/surveys/{id}/webhooks",
  ...admin,
  tags: ["Webhooks"],
  summary: "Add a webhook",
  description:
    "Each event is POSTed as JSON with `Kvesto-Event`, `Kvesto-Delivery` and `Kvesto-Signature: t=…,v1=…` " +
    "(HMAC-SHA256 of `t.body` with the secret), and retried with growing delays. The URL must be public https.",
  request: { params: SurveyIdParam, body: { ...json(WebhookInput, "Where and what to send"), required: true } },
  responses: {
    ...refused,
    201: json(CreatedWebhook, "The webhook, with its secret (shown only this once)"),
    400: error("The URL can't be used"),
    404: error("Survey not found"),
  },
});

export const listWebhooks = createRoute({
  method: "get",
  path: "/surveys/{id}/webhooks",
  ...admin,
  tags: ["Webhooks"],
  summary: "List webhooks",
  request: { params: SurveyIdParam },
  responses: { ...refused, 200: json(WebhookList, "Webhooks (without secrets)"), 404: error("Survey not found") },
});

export const deleteWebhook = createRoute({
  method: "delete",
  path: "/surveys/{id}/webhooks/{webhookId}",
  ...admin,
  tags: ["Webhooks"],
  summary: "Remove a webhook",
  request: { params: WebhookParams },
  responses: { ...refused, 204: { description: "Removed" }, 404: error("Webhook not found") },
});

export const listDeliveries = createRoute({
  method: "get",
  path: "/surveys/{id}/webhooks/{webhookId}/deliveries",
  ...admin,
  tags: ["Webhooks"],
  summary: "A webhook's delivery log, newest first",
  request: { params: WebhookParams },
  responses: { ...refused, 200: json(DeliveryList, "Deliveries"), 404: error("Webhook not found") },
});

const text = (type: string, description: string) => ({ content: { [type]: { schema: z.string() } }, description });

export const hostedSurvey = createRoute({
  method: "get",
  path: "/s/{id}",
  tags: ["Hosted"],
  summary: "A page that shows the survey",
  description:
    "For links and iframes. Takes `?lang=`, `?layout=page|question`, `?theme=` and the survey's declared hidden fields as " +
    "query parameters. Served with a strict Content Security Policy and no inline script.",
  request: { params: SurveyIdParam },
  responses: { 200: text("text/html", "The survey page"), 404: text("text/html", "No such survey") },
});

export const embedScript = createRoute({
  method: "get",
  path: "/s/embed.js",
  tags: ["Hosted"],
  summary: "The embed script",
  description: "Turns `<div data-kvesto-survey=\"id\" data-mode=\"inline|popup|slide-in\">` into an embedded survey.",
  responses: { 200: text("text/javascript", "JavaScript") },
});

export const hostedAsset = createRoute({
  method: "get",
  path: "/s/assets/{file}",
  tags: ["Hosted"],
  summary: "Files the survey page loads",
  request: {
    params: z.object({
      file: z.enum(["kvesto.js", "kvesto.css", "page.css", "run.js"]).openapi({ param: { name: "file", in: "path" } }),
    }),
  },
  responses: { 200: text("text/plain", "The file") },
});

const TokenBody = z.object({ token: z.string().min(1).max(200) }).openapi("ResponseToken");

export const deleteResponse = createRoute({
  method: "delete",
  path: "/surveys/{id}/responses/{responseId}",
  tags: ["Responses"],
  summary: "Delete a response and its files",
  ...admin,
  request: { params: ResponseParams },
  responses: { 204: { description: "Deleted" }, 404: error("Response not found"), ...refused },
});

export const myResponse = createRoute({
  method: "post",
  path: "/surveys/{id}/responses/{responseId}/mine",
  tags: ["Responses"],
  summary: "A respondent downloads their own response",
  description: "With the token returned when the response was created (`resumeToken`), whether it is complete or not.",
  request: { params: ResponseParams, body: { ...json(TokenBody, "The response's token"), required: true } },
  responses: { 200: json(SurveyResponse, "The response"), 403: error("Wrong token"), 404: error("Response not found") },
});

export const forgetResponse = createRoute({
  method: "post",
  path: "/surveys/{id}/responses/{responseId}/forget",
  tags: ["Responses"],
  summary: "A respondent deletes their own response",
  description: "With the response's token. Deletes the response and its files.",
  request: { params: ResponseParams, body: { ...json(TokenBody, "The response's token"), required: true } },
  responses: { 204: { description: "Deleted" }, 403: error("Wrong token"), 404: error("Response not found") },
});

export const uploadFile = createRoute({
  method: "post",
  path: "/surveys/{id}/files",
  tags: ["Files"],
  summary: "Upload a file for a file question",
  description:
    "Checks the file against the question's `accept` and `maxSize` and the server's own size limit, stores it, " +
    "and returns the entry to put in the question's answer.",
  request: {
    params: SurveyIdParam,
    body: { content: { "multipart/form-data": { schema: FileUpload } }, required: true },
  },
  responses: {
    201: json(FileAnswer, "Stored file"),
    400: error("Not a file question, the file breaks the question's rules, or its content doesn't match its type"),
    404: error("Survey not found"),
    413: error("File larger than the server allows, or the survey's storage is full"),
    422: error("Refused by the file scanner"),
  },
});

export const getFile = createRoute({
  method: "get",
  path: "/surveys/{id}/files/{fileId}",
  tags: ["Files"],
  summary: "Download an uploaded file",
  description: "With signed file URLs on, `expires` and `signature` are required, and an expired link answers 403.",
  request: {
    params: FileParams,
    query: z.object({ expires: z.string().max(20).optional(), signature: z.string().max(100).optional() }),
  },
  responses: {
    200: {
      content: { "application/octet-stream": { schema: z.string().openapi({ type: "string", format: "binary" }) } },
      description: "The file's bytes, with its original content type",
    },
    403: error("The link has expired or isn't signed"),
    404: error("Not found"),
  },
});
