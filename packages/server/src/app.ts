import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { findElement, formatBytes, validateAnswers, validateFile, type CustomValidators } from "@kvesto/core";
import { openAccess, type Authorize, type KvestoAction } from "./auth.js";
import type { SurveyRepository } from "./repository.js";
import * as routes from "./routes.js";

export interface CreateAppOptions {
  repository: SurveyRepository;
  /** CORS origin(s). Default "*" so the core's httpStorage works from any site. Pass false to disable. */
  cors?: string | string[] | false;
  /** Serve /openapi.json and the /docs UI. Default true. */
  docs?: boolean;
  /** Largest accepted upload in bytes, whatever a question allows. Default 10 MB. */
  maxFileSize?: number;
  /**
   * Who may do what. Called before every API action (not for /health or the docs).
   * Use `apiKeyAuth({ keys })`, or your own check. Without it every request is
   * allowed and a warning is logged; pass `openAccess` to allow everything quietly.
   */
  authorize?: Authorize;
  /** Functions for surveys' `custom` validators, by name: the same ones the runner uses. */
  validators?: CustomValidators;
}

/** Types a browser may show inline. Anything else is served as a download, so an uploaded page can't run as this origin. */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain"]);

/**
 * Build the Kvesto REST API as a Hono app. Mount it anywhere:
 * `parent.route("/api/kvesto", createApp({ repository }))`, or serve it
 * standalone (see serve.ts). Runs on Node, Bun, Deno and edge runtimes
 * given a compatible repository.
 */
export function createApp(options: CreateAppOptions) {
  const repo = options.repository;
  const maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024;
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

  if (!options.authorize) {
    console.warn(
      "[kvesto] createApp() has no `authorize` option: anyone can edit surveys and read responses. " +
        "Use apiKeyAuth({ keys }) or your own check before exposing this server.",
    );
  }
  const authorize = options.authorize ?? openAccess;
  const guard = (method: "GET" | "POST" | "PUT" | "DELETE", path: string, action: KvestoAction) =>
    app.on(method, path, async (c, next) => {
      const verdict = await authorize(c, { action, ...(c.req.param("id") ? { surveyId: c.req.param("id") } : {}) });
      if (verdict instanceof Response) return verdict;
      if (verdict !== true) return c.json({ error: "Forbidden" }, 403);
      await next();
    });
  // Registered before the routes (and before the upload body limit), so refused requests stop here.
  guard("GET", "/surveys", "survey:list");
  guard("POST", "/surveys", "survey:write");
  guard("GET", "/surveys/:id", "survey:read");
  guard("PUT", "/surveys/:id", "survey:write");
  guard("DELETE", "/surveys/:id", "survey:write");
  guard("POST", "/surveys/:id/responses", "response:create");
  guard("GET", "/surveys/:id/responses", "response:read");
  guard("POST", "/surveys/:id/files", "file:upload");
  guard("GET", "/surveys/:id/files/:fileId", "file:read");

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
    const { issues, answers } = validateAnswers(survey, input.answers, { validators: options.validators });
    if (issues.length) {
      return c.json(
        {
          error: "Answers do not match the survey",
          issues: issues.map((i) => ({ path: ["answers", i.questionId], message: i.message })),
        },
        400,
      );
    }
    // Answers to questions hidden by conditional logic are dropped, as the core runtime does.
    return c.json(await repo.saveResponse(id, { ...input, answers }), 201);
  });

  app.use(
    "/surveys/:id/files",
    bodyLimit({
      // Room for the multipart envelope around the file.
      maxSize: maxFileSize + 64 * 1024,
      onError: (c) => c.json({ error: `Files are limited to ${formatBytes(maxFileSize)}` }, 413),
    }),
  );

  app.openapi(routes.uploadFile, async (c) => {
    const { id } = c.req.valid("param");
    const { questionId, file } = c.req.valid("form");
    const survey = await repo.loadSurvey(id);
    if (!survey) return c.json({ error: "Survey not found" }, 404);
    const question = findElement(survey, questionId)?.element;
    if (!question || question.type !== "file") {
      return c.json({ error: "Not a file question", issues: [{ path: ["questionId"], message: `No file question "${questionId}"` }] }, 400);
    }
    if (file.size > maxFileSize) return c.json({ error: `Files are limited to ${formatBytes(maxFileSize)}` }, 413);
    const message = validateFile(question, file);
    if (message) return c.json({ error: message, issues: [{ path: ["file"], message }] }, 400);

    const stored = await repo.saveFile(
      { surveyId: id, questionId, name: file.name || "file", type: file.type, size: file.size },
      new Uint8Array(await file.arrayBuffer()),
    );
    const base = c.req.url.split("?")[0]!.replace(/\/+$/, "");
    return c.json({ name: stored.name, type: stored.type, size: stored.size, url: `${base}/${stored.id}` }, 201);
  });

  app.openapi(routes.getFile, async (c) => {
    const { id, fileId } = c.req.valid("param");
    const found = await repo.loadFile(id, fileId);
    if (!found) return c.json({ error: "File not found" }, 404);
    const { file, data } = found;
    const type = file.type || "application/octet-stream";
    const disposition = INLINE_TYPES.has(type) ? "inline" : "attachment";
    return c.body(data as Uint8Array<ArrayBuffer>, 200, {
      "content-type": type,
      "content-length": String(data.byteLength),
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=3600",
    });
  });

  app.openapi(routes.listResponses, async (c) => {
    const { id } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    if (!(await repo.surveyExists(id))) return c.json({ error: "Survey not found" }, 404);
    const [items, total] = await Promise.all([repo.listResponsesPage(id, { limit, offset }), repo.countResponses(id)]);
    return c.json({ items, total, limit, offset }, 200);
  });

  if (options.docs !== false) {
    app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
      type: "http",
      scheme: "bearer",
      description: "An API key, when the server uses apiKeyAuth. Operations marked with it need the key by default.",
    });
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
