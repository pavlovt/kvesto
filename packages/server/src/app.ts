import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import {
  checkQuestionTypes,
  collectHidden,
  resolveLogic,
  scoreSurvey,
  fileRules,
  findElement,
  registerQuestionType,
  formatBytes,
  unknownFunctions,
  validateAnswers,
  validateFile,
  type CustomValidators,
  type ExpressionFunctions,
  type QuestionTypeDefinition,
  type Answers,
  type Survey,
} from "@kvesto/core";
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
  /** Functions surveys' expressions may call, by name: the same ones the runner uses. */
  functions?: ExpressionFunctions;
  /**
   * Custom question types (`x-…`), registered with `registerQuestionType`: the same ones the runner uses, so
   * surveys using them can be saved and their answers are validated with the type's `validate`.
   */
  questionTypes?: QuestionTypeDefinition[];
}

/** The declared hidden fields' values in a response's `meta.hidden`: strings only, cut to 500 characters. */
function hiddenOf(survey: Survey, meta: Record<string, unknown> | undefined): Record<string, string> {
  const given = meta?.hidden;
  if (!given || typeof given !== "object") return {};
  const strings = Object.fromEntries(Object.entries(given).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  return collectHidden(survey, strings);
}

/** The response with only the declared hidden fields kept in `meta.hidden`. */
function withHidden<T extends { meta?: Record<string, unknown> }>(input: T, hidden: Record<string, string>): T {
  if (!input.meta?.hidden) return input;
  const { hidden: _given, ...meta } = input.meta;
  const next = { ...meta, ...(Object.keys(hidden).length ? { hidden } : {}) };
  return { ...input, ...(Object.keys(next).length ? { meta: next } : { meta: undefined }) };
}

/** `name:value` query values as an object; names must be ids (letters, digits, - and _). */
function pairs(values: string[] | undefined): Record<string, string> {
  return Object.fromEntries(
    (values ?? [])
      .filter((v) => v.includes(":"))
      .map((v) => [v.slice(0, v.indexOf(":")), v.slice(v.indexOf(":") + 1)] as const)
      .filter(([k]) => /^[A-Za-z0-9_-]+$/.test(k)),
  );
}

const encodeCursor = (r: { createdAt: string; id: string }) => Buffer.from(`${r.createdAt}|${r.id}`).toString("base64url");
function decodeCursor(cursor: string): { createdAt: string; id: string } | undefined {
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  return createdAt && id && /^\d{4}-\d{2}-\d{2}T/.test(createdAt) ? { createdAt, id } : undefined;
}

/** A submission after a time limit ran out: accepted unchecked only when the survey has a time limit. */
function timedOut(survey: Survey, meta: Record<string, unknown> | undefined): boolean {
  const claimed = Boolean((meta?.quiz as { timedOut?: unknown } | undefined)?.timedOut ?? meta?.timedOut);
  return claimed && Boolean(survey.settings?.quiz?.timeLimit || survey.pages.some((p) => p.timeLimit));
}

/** The response with its quiz score worked out here, never taken from the client. */
function withQuiz<T extends { meta?: Record<string, unknown> }>(
  survey: Survey,
  input: T,
  answers: Answers,
  hidden: Record<string, string>,
  partial: boolean,
): T {
  const quiz = survey.settings?.quiz;
  const { quiz: _given, ...meta } = input.meta ?? {};
  if (!quiz || partial) return input.meta?.quiz ? { ...input, meta } : input;
  const logic = resolveLogic(survey, answers, Object.keys(hidden).length ? { hidden } : {});
  const s = scoreSurvey(survey, logic.answers, logic.visibleQuestions);
  return {
    ...input,
    meta: {
      ...meta,
      quiz: {
        score: s.score,
        max: s.max,
        ...(s.passed !== undefined ? { passed: s.passed } : {}),
        ...(timedOut(survey, input.meta) ? { timedOut: true } : {}),
        released: quiz.releaseScores !== "manual",
      },
    },
  };
}

/** The stored form of a resume token's secret. */
const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** The first Accept-Language tag the survey is translated into, else its default locale. */
function preferredLocale(header: string | undefined, survey: Survey): string | undefined {
  const offered = new Set([survey.defaultLocale ?? "en", ...(survey.locales ?? [])]);
  const tags = (header ?? "")
    .split(",")
    .map((part) => part.split(";")[0]!.trim())
    .filter(Boolean);
  for (const tag of tags) {
    if (offered.has(tag)) return tag;
    const lang = tag.split("-")[0]!;
    if (offered.has(lang)) return lang;
  }
  return survey.defaultLocale;
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
  for (const type of options.questionTypes ?? []) registerQuestionType(type);
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
  // Respondent actions too: the resume token in the body is what allows them.
  app.on("PATCH", "/surveys/:id/responses/:responseId", async (c, next) => {
    const verdict = await authorize(c, { action: "response:create", surveyId: c.req.param("id") });
    if (verdict instanceof Response) return verdict;
    if (verdict !== true) return c.json({ error: "Forbidden" }, 403);
    await next();
  });
  guard("POST", "/surveys/:id/responses/:responseId/resume", "response:create");
  guard("POST", "/surveys/:id/responses/:responseId/release", "survey:write");
  guard("GET", "/surveys/:id/responses", "response:read");
  guard("POST", "/surveys/:id/files", "file:upload");
  guard("GET", "/surveys/:id/files/:fileId", "file:read");

  app.openapi(routes.health, (c) => c.json({ status: "ok" as const }, 200));

  app.openapi(routes.listSurveys, async (c) => c.json({ items: await repo.listSurveys() }, 200));

  /** A 400 body when the survey calls expression functions this server doesn't have, so they can't silently fail later. */
  const missingFunctions = (survey: Survey) => {
    const messages = [
      ...unknownFunctions(survey, options.functions).map((name) => `Unknown expression function "${name}"`),
      ...checkQuestionTypes(survey),
    ];
    return messages.length
      ? { error: "Invalid survey JSON", issues: messages.map((message) => ({ path: [] as (string | number)[], message })) }
      : null;
  };

  /** Validate answers (partial ones need nothing yet), in the respondent's language when the survey has it. */
  const check = (
    survey: Survey,
    answers: Answers,
    partial: boolean,
    acceptLanguage: string | undefined,
    hidden: Record<string, string> = {},
  ) => {
    const result = validateAnswers(survey, answers, {
      hidden,
      validators: options.validators,
      functions: options.functions,
      locale: preferredLocale(acceptLanguage, survey),
      partial,
    });
    if (!result.issues.length) return { answers: result.answers };
    return {
      bad: {
        error: "Answers do not match the survey",
        issues: result.issues.map((i) => ({ path: ["answers", ...i.path], message: i.message })),
      },
    };
  };

  app.openapi(routes.createSurvey, async (c) => {
    const survey = c.req.valid("json");
    const bad = missingFunctions(survey);
    if (bad) return c.json(bad, 400);
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
    const bad = missingFunctions(survey);
    if (bad) return c.json(bad, 400);
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
    const partial = input.status === "partial";
    const hidden = hiddenOf(survey, input.meta);
    const checked = check(survey, input.answers, partial || timedOut(survey, input.meta), c.req.header("accept-language"), hidden);
    if ("bad" in checked) return c.json(checked.bad, 400);
    // Answers to questions hidden by conditional logic are dropped, as the core runtime does.
    const { status: _status, ...given } = input;
    const rest = withQuiz(survey, withHidden(given, hidden), checked.answers, hidden, partial);
    if (!partial) return c.json(await repo.saveResponse(id, { ...rest, answers: checked.answers }), 201);
    const secret = randomBytes(32).toString("base64url");
    const saved = await repo.savePartialResponse(id, { ...rest, answers: checked.answers }, hashSecret(secret));
    return c.json({ ...saved, resumeToken: `${saved.id}.${secret}` }, 201);
  });

  /** A partial response, if `token` is its resume token. */
  const partialFor = async (surveyId: string, responseId: string, token: string) => {
    const found = await repo.loadResponse(surveyId, responseId);
    if (!found) return { status: 404 as const, error: "Response not found" };
    const [rid, secret = ""] = token.split(".");
    const expected = Buffer.from(found.tokenHash ?? "", "hex");
    const given = Buffer.from(hashSecret(secret), "hex");
    if (rid !== responseId || !found.tokenHash || expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return { status: 403 as const, error: "Wrong resume token" };
    }
    if (found.response.status !== "partial") return { status: 409 as const, error: "The response is already complete" };
    return { response: found.response };
  };

  app.openapi(routes.updateResponse, async (c) => {
    const { id, responseId } = c.req.valid("param");
    const { token, ...input } = c.req.valid("json");
    const survey = await repo.loadSurvey(id);
    if (!survey) return c.json({ error: "Survey not found" }, 404);
    const found = await partialFor(id, responseId, token);
    if (!("response" in found)) return c.json({ error: found.error }, found.status);
    const partial = input.status === "partial";
    const meta = input.meta ?? found.response!.meta;
    const hidden = hiddenOf(survey, meta);
    const checked = check(survey, input.answers, partial || timedOut(survey, meta), c.req.header("accept-language"), hidden);
    if ("bad" in checked) return c.json(checked.bad, 400);
    const updated = await repo.updateResponse(
      id,
      responseId,
      withQuiz(
        survey,
        withHidden({ ...input, meta, answers: checked.answers, status: partial ? "partial" : "complete" }, hidden),
        checked.answers,
        hidden,
        partial,
      ),
    );
    return c.json(updated, 200);
  });

  app.openapi(routes.releaseScore, async (c) => {
    const { id, responseId } = c.req.valid("param");
    const found = await repo.loadResponse(id, responseId);
    if (!found) return c.json({ error: "Response not found" }, 404);
    const quiz = (found.response.meta?.quiz ?? null) as Record<string, unknown> | null;
    if (!quiz) return c.json({ error: "Not a quiz response" }, 409);
    const { id: _id, surveyId: _s, createdAt: _c, updatedAt: _u, ...input } = found.response;
    return c.json(await repo.updateResponse(id, responseId, { ...input, meta: { ...input.meta, quiz: { ...quiz, released: true } } }), 200);
  });

  app.openapi(routes.resumeResponse, async (c) => {
    const { id, responseId } = c.req.valid("param");
    const found = await partialFor(id, responseId, c.req.valid("json").token);
    if (!("response" in found)) return c.json({ error: found.error }, found.status);
    return c.json(found.response, 200);
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
    if (!question || (question.type !== "file" && question.type !== "signature")) {
      return c.json({ error: "Not a file question", issues: [{ path: ["questionId"], message: `No file question "${questionId}"` }] }, 400);
    }
    if (file.size > maxFileSize) return c.json({ error: `Files are limited to ${formatBytes(maxFileSize)}` }, 413);
    const message = validateFile(fileRules(question), file);
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
    const { limit, offset, status } = c.req.valid("query");
    if (!(await repo.surveyExists(id))) return c.json({ error: "Survey not found" }, 404);
    // `?hidden=source:newsletter` (repeatable) keeps responses whose hidden field has that value.
    const hidden = pairs(c.req.queries("hidden"));
    const answers = pairs(c.req.queries("answer"));
    const { from, to, cursor } = c.req.valid("query");
    // A bare date for `to` means the whole of that day.
    const until = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to;
    const filter = {
      status,
      ...(Object.keys(hidden).length ? { hidden } : {}),
      ...(Object.keys(answers).length ? { answers } : {}),
      ...(from ? { from } : {}),
      ...(until ? { to: until } : {}),
    };
    const after = cursor ? decodeCursor(cursor) : undefined;
    if (cursor && !after) return c.json({ error: "Invalid cursor", issues: [{ path: ["cursor"], message: "Not a cursor from this API" }] }, 400);
    const [items, total] = await Promise.all([repo.listResponsesPage(id, { limit, offset, ...filter, ...(after ? { after } : {}) }), repo.countResponses(id, filter)]);
    const last = items.at(-1);
    const more = items.length === limit && last;
    return c.json({ items, total, limit, offset, ...(more ? { nextCursor: encodeCursor(last) } : {}) }, 200);
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
