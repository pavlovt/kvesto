import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { validateAnswer } from "@kvesto/core";
import type { Answers, Survey } from "@kvesto/schema";
import type { SurveyRepository } from "./repository.js";
import * as routes from "./routes.js";

export interface CreateAppOptions {
  repository: SurveyRepository;
  /** CORS origin(s). Default "*" so the core's httpStorage works from any site. Pass false to disable. */
  cors?: string | string[] | false;
  /** Serve /openapi.json and the /docs UI. Default true. */
  docs?: boolean;
}

type Issue = { path: (string | number)[]; message: string };

function answerIssues(survey: Survey, answers: Answers): Issue[] {
  const questions = survey.pages.flatMap((p) => p.elements);
  const known = new Set(questions.map((q) => q.id));
  const issues: Issue[] = Object.keys(answers)
    .filter((k) => !known.has(k))
    .map((k) => ({ path: ["answers", k], message: "Unknown question" }));
  for (const q of questions) {
    const msg = validateAnswer(q, answers[q.id]);
    if (msg) issues.push({ path: ["answers", q.id], message: msg });
  }
  return issues;
}

/**
 * Build the Kvesto REST API as a Hono app. Mount it anywhere:
 * `parent.route("/api/kvesto", createApp({ repository }))`, or serve it
 * standalone (see serve.ts). Runs on Node, Bun, Deno and edge runtimes
 * given a compatible repository.
 */
export function createApp(options: CreateAppOptions) {
  const repo = options.repository;
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issues = result.error.issues.map((i) => ({
          path: i.path.filter((p): p is string | number => typeof p !== "symbol"),
          message: i.message,
        }));
        return c.json({ error: "Validation failed", issues }, 400);
      }
    },
  });

  if (options.cors !== false) app.use("*", cors({ origin: options.cors ?? "*" }));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.openapi(routes.health, (c) => c.json({ status: "ok" as const }, 200));

  app.openapi(routes.listSurveys, async (c) => c.json({ items: await repo.listSurveys() }, 200));

  app.openapi(routes.createSurvey, async (c) => {
    const survey = c.req.valid("json");
    if (await repo.surveyExists(survey.id)) {
      return c.json({ error: `Survey "${survey.id}" already exists` }, 409);
    }
    return c.json(await repo.createSurvey(survey), 201);
  });

  app.openapi(routes.getSurvey, async (c) => {
    const survey = await repo.loadSurvey(c.req.valid("param").id);
    return survey ? c.json(survey, 200) : c.json({ error: "Survey not found" }, 404);
  });

  app.openapi(routes.putSurvey, async (c) => {
    const { id } = c.req.valid("param");
    const survey = c.req.valid("json");
    if (survey.id !== id) {
      return c.json({ error: "Body id must match the path", issues: [{ path: ["id"], message: `Expected "${id}"` }] }, 400);
    }
    return c.json(await repo.saveSurvey(survey), 200);
  });

  app.openapi(routes.deleteSurvey, async (c) => {
    const { id } = c.req.valid("param");
    if (!(await repo.surveyExists(id))) return c.json({ error: "Survey not found" }, 404);
    await repo.deleteSurvey(id);
    return c.body(null, 204);
  });

  app.openapi(routes.submitResponse, async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const survey = await repo.loadSurvey(id);
    if (!survey) return c.json({ error: "Survey not found" }, 404);
    const issues = answerIssues(survey, input.answers);
    if (issues.length) return c.json({ error: "Answers do not match the survey", issues }, 400);
    return c.json(await repo.saveResponse(id, input), 201);
  });

  app.openapi(routes.listResponses, async (c) => {
    const { id } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    if (!(await repo.surveyExists(id))) return c.json({ error: "Survey not found" }, 404);
    const [items, total] = await Promise.all([repo.listResponsesPage(id, { limit, offset }), repo.countResponses(id)]);
    return c.json({ items, total, limit, offset }, 200);
  });

  if (options.docs !== false) {
    app.doc31("/openapi.json", {
      openapi: "3.1.0",
      info: {
        title: "Kvesto API",
        version: "0.0.1",
        description: "REST API for storing Kvesto surveys and responses.",
        license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
      },
    });
    app.get("/docs", Scalar({ url: "openapi.json", pageTitle: "Kvesto API" }));
  }

  return app;
}

export type KvestoApp = ReturnType<typeof createApp>;
