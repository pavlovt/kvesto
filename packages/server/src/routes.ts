import { createRoute, z } from "@hono/zod-openapi";
import {
  ErrorBody,
  Pagination,
  ResponseInput,
  ResponseList,
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
  tags: ["Surveys"],
  summary: "List surveys",
  responses: { 200: json(SurveyList, "Survey summaries, most recently updated first") },
});

export const createSurvey = createRoute({
  method: "post",
  path: "/surveys",
  tags: ["Surveys"],
  summary: "Create a survey",
  request: { body: { ...json(Survey, "Survey definition"), required: true } },
  responses: {
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
  tags: ["Surveys"],
  summary: "Create or replace a survey",
  request: { params: SurveyIdParam, body: { ...json(Survey, "Survey definition"), required: true } },
  responses: {
    200: json(Survey, "Saved"),
    400: error("Invalid survey JSON, or the body id does not match the path"),
  },
});

export const deleteSurvey = createRoute({
  method: "delete",
  path: "/surveys/{id}",
  tags: ["Surveys"],
  summary: "Delete a survey and its responses",
  request: { params: SurveyIdParam },
  responses: { 204: { description: "Deleted" }, 404: error("Not found") },
});

export const submitResponse = createRoute({
  method: "post",
  path: "/surveys/{id}/responses",
  tags: ["Responses"],
  summary: "Submit a response",
  description: "Answers are validated against the survey's questions with the same rules the core runtime uses.",
  request: { params: SurveyIdParam, body: { ...json(ResponseInput, "Answers"), required: true } },
  responses: {
    201: json(SurveyResponse, "Stored response"),
    400: error("Answers do not match the survey"),
    404: error("Survey not found"),
  },
});

export const listResponses = createRoute({
  method: "get",
  path: "/surveys/{id}/responses",
  tags: ["Responses"],
  summary: "List responses",
  request: { params: SurveyIdParam, query: Pagination },
  responses: { 200: json(ResponseList, "Responses, newest first"), 404: error("Survey not found") },
});
