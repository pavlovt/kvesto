import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import {
  answerLimitIssues,
  checkQuestionTypes,
  collectHidden,
  surveyAvailability,
  surveyLimitIssues,
  type AnswerLimits,
  type SurveyLimits,
  textOf,
  type ClosedReason,
  responsesToCsv,
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
  type SurveyResponse,
  type Survey,
} from "@kvesto/core";
import { openAccess, type Authorize, type KvestoAction } from "./auth.js";
import type { RespondentRecord, SurveyRepository } from "./repository.js";
import * as routes from "./routes.js";
import { guardOutboundUrl } from "./outbound.js";
import { EMBED_JS, HOSTED_CSP, hostedAssets, hostedPage, PAGE_CSS, RUN_JS } from "./hosted.js";
import { createWebhookDispatcher, newWebhookSecret, type WebhookEvent, type WebhookOptions } from "./webhooks.js";

export interface CreateAppOptions {
  repository: SurveyRepository;
  /**
   * CORS origin(s) for the respondent routes (loading a survey, submitting and resuming responses, uploads, the
   * hosted page). Default "*" so surveys can be embedded on any site. Pass false for no CORS.
   */
  cors?: string | string[] | false;
  /**
   * CORS origin(s) for the admin routes (editing surveys, reading responses, exports, webhooks), such as your
   * editor's and dashboard's origins. Default none: only pages on the server's own origin can call them.
   */
  adminCors?: string | string[] | false;
  /**
   * Lower the size limits: survey documents (`SURVEY_LIMITS`), answers (`ANSWER_LIMITS`), and request bodies in
   * bytes (default 5 MB for surveys, 1 MB for responses and other JSON).
   */
  limits?: { survey?: Partial<SurveyLimits>; answers?: Partial<AnswerLimits>; surveyBytes?: number; jsonBytes?: number };
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
  /** How webhooks are sent (fetch, retry delays, allowed URLs). */
  webhooks?: WebhookOptions;
  /**
   * Called after a response is stored: "response.completed" when it is submitted, "response.updated" when a
   * partial one is saved. For in-process integrations; errors are logged, never shown to the respondent.
   */
  onResponse?: (event: WebhookEvent, response: SurveyResponse, survey: Survey) => void | Promise<void>;
  /**
   * Who is answering: a stable id from the host's session or token, or null for nobody. Kept with each response
   * (as `respondentId`, unless the survey is anonymous), and needed for `settings.requireRespondent` and
   * `settings.oneResponsePer: "respondent"`.
   */
  identifyRespondent?: (c: Context) => string | null | undefined | Promise<string | null | undefined>;
  /**
   * The key for the respondent and browser hashes that `oneResponsePer` compares. Set a long random secret so
   * nobody with the database can test guessed ids against the hashes. Default: a fixed key.
   */
  respondentSecret?: string;
}

const CLOSED: Record<ClosedReason, [401 | 403 | 409, string]> = {
  "not-open": [403, "This survey isn't open yet"],
  closed: [403, "This survey is closed"],
  full: [409, "This survey has all the responses it takes"],
  answered: [409, "This survey takes one response per person, and there is one already"],
  "sign-in": [401, "This survey needs a signed-in respondent"],
};
const BROWSER_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** The routes respondents use, which any site may call (`cors`). Everything else is an admin route (`adminCors`). */
const PUBLIC_ROUTES: [string, RegExp][] = [
  ["GET", /\/health$/],
  ["GET", /\/surveys\/[^/]+$/],
  ["POST", /\/surveys\/[^/]+\/responses$/],
  ["PATCH", /\/surveys\/[^/]+\/responses\/[^/]+$/],
  ["POST", /\/surveys\/[^/]+\/responses\/[^/]+\/resume$/],
  ["POST", /\/surveys\/[^/]+\/files$/],
  ["GET", /\/surveys\/[^/]+\/files\/[^/]+$/],
  ["GET", /\/s\/[^/]+(?:\/[^/]+)?$/],
];
export function isRespondentRoute(method: string, path: string): boolean {
  const m = method === "HEAD" ? "GET" : method;
  return PUBLIC_ROUTES.some(([pm, re]) => pm === m && re.test(path));
}
const originIn = (list: string | string[] | false, origin: string): string | null => {
  if (list === false) return null;
  const all = Array.isArray(list) ? list : [list];
  return all.includes("*") ? "*" : all.includes(origin) ? origin : null;
};

/** The response's meta without `browserId`, which is only used for the hash. */
function withoutBrowserId<T extends { meta?: Record<string, unknown> }>(input: T): T {
  if (!input.meta || !("browserId" in input.meta)) return input;
  const { browserId: _b, ...meta } = input.meta;
  return { ...input, meta: Object.keys(meta).length ? meta : undefined };
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
  const dispatcher = createWebhookDispatcher(repo, options.webhooks);
  /** Tell webhooks and `onResponse` about a stored response, without delaying the reply. */
  const notify = (survey: Survey, response: SurveyResponse) => {
    const event: WebhookEvent = response.status === "partial" ? "response.updated" : "response.completed";
    void (async () => {
      try {
        await options.onResponse?.(event, response, survey);
      } catch (e) {
        console.error("[kvesto] onResponse failed", e);
      }
      try {
        await dispatcher.emit(survey, event, response);
      } catch (e) {
        console.error("[kvesto] queuing webhooks failed", e);
      }
    })();
  };
  for (const type of options.questionTypes ?? []) registerQuestionType(type);

  /**
   * Whether the survey takes this response now (its availability settings), and who it is from. `creating` for a
   * new response, `completing` when it is submitted.
   */
  const admit = async (
    c: Context,
    survey: Survey,
    meta: Record<string, unknown> | undefined,
    { creating, completing }: { creating: boolean; completing: boolean },
  ): Promise<{ respondent: RespondentRecord } | { status: 400 | 401 | 403 | 409; body: { error: string; reason?: ClosedReason } }> => {
    const s = survey.settings ?? {};
    const given = options.identifyRespondent ? await options.identifyRespondent(c) : null;
    const id = typeof given === "string" && given.length > 0 && given.length <= 200 ? given : null;
    const hash = (kind: string, value: string) =>
      createHmac("sha256", options.respondentSecret ?? "kvesto-respondent").update(`${survey.id}\0${kind}\0${value}`).digest("hex");
    let key: string | null = null;
    if (creating && s.oneResponsePer === "respondent" && id) key = hash("respondent", id);
    if (creating && s.oneResponsePer === "browser") {
      const browser = meta?.browserId;
      if (typeof browser !== "string" || !BROWSER_ID.test(browser)) {
        return { status: 400, body: { error: "This survey takes one response per browser: send meta.browserId (the runner does)" } };
      }
      key = hash("browser", browser);
    }
    const counted = s.maxResponses !== undefined && (creating || completing);
    const available = surveyAvailability(survey, {
      ...(counted ? { completeResponses: await repo.countResponses(survey.id) } : {}),
      answered: key ? await repo.hasRespondent(survey.id, key) : false,
      identified: id !== null,
    });
    if (!available.open) {
      const [status, error] = CLOSED[available.reason];
      return { status, body: { error, reason: available.reason } };
    }
    return { respondent: { id: s.anonymous ? null : id, key } };
  };
  /** A second response with the same respondent key, stored at the same moment, fails the unique index. */
  const duplicate = (e: unknown) => /UNIQUE constraint failed/i.test(String((e as { message?: unknown })?.message ?? e));
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

  // Every response carries a request id, and errors are logged under it instead of being shown.
  app.use("*", requestId());
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    const id = c.get("requestId");
    console.error(`[kvesto] request ${id} failed:`, err);
    return c.json({ error: "Internal server error", requestId: id }, 500);
  });

  // Secure headers on everything. The hosted page may be framed by any site (its CSP says so); nothing else may.
  app.use("*", secureHeaders({ xFrameOptions: false, crossOriginResourcePolicy: false, strictTransportSecurity: false, referrerPolicy: "strict-origin-when-cross-origin" }));
  app.use("*", async (c, next) => {
    await next();
    const h = c.res.headers;
    const path = c.req.path;
    h.set("Cross-Origin-Resource-Policy", isRespondentRoute(c.req.method, path) ? "cross-origin" : "same-origin");
    if (!/\/s\/[^/]+(?:\/[^/]+)?$/.test(path)) h.set("X-Frame-Options", "DENY");
    // The API reference page loads its UI from a CDN, so it keeps its own defaults.
    if (!h.has("content-security-policy") && !/\/docs$/.test(path)) h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    const https = new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https";
    if (https) h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  });

  // CORS by route: respondent routes for any site, admin routes only for the origins you list.
  const publicCors = options.cors ?? "*";
  const adminCors = options.adminCors ?? false;
  if (adminCors !== false && originIn(adminCors, "") === "*") {
    console.warn(
      "[kvesto] adminCors allows any origin: any website can call the admin API from a browser that has a key. " +
        "List your editor's and dashboard's origins instead.",
    );
  }
  if (publicCors !== false || adminCors !== false) {
    app.use(
      "*",
      cors({
        origin: (origin, c) => {
          // A preflight asks for the method it is about to use.
          const method = c.req.method === "OPTIONS" ? (c.req.header("access-control-request-method") ?? "GET") : c.req.method;
          return originIn(isRespondentRoute(method, c.req.path) ? publicCors : adminCors, origin);
        },
      }),
    );
  }

  // Request body sizes, and document limits checked on the raw JSON before it is parsed (so hostile nesting
  // can't exhaust the stack in validation).
  const tooLarge = (bytes: number) =>
    bodyLimit({ maxSize: bytes, onError: (c) => c.json({ error: `Request bodies are limited to ${formatBytes(bytes)}` }, 413) });
  const surveyBytes = options.limits?.surveyBytes ?? 5 * 1024 * 1024;
  const jsonBytes = options.limits?.jsonBytes ?? 1024 * 1024;
  const checkSurveyLimits = async (c: Context, next: () => Promise<void>) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const issues = body === undefined ? [] : surveyLimitIssues(body, options.limits?.survey);
    if (issues.length) return c.json({ error: "The survey is too large", issues }, 400);
    await next();
  };
  const checkAnswerLimits = async (c: Context, next: () => Promise<void>) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const answers = body && typeof body === "object" ? (body as { answers?: unknown }).answers : undefined;
    const issues = answers === undefined ? [] : answerLimitIssues(answers, options.limits?.answers).map((i) => ({ ...i, path: ["answers", ...i.path] }));
    if (issues.length) return c.json({ error: "The answers are too large", issues }, 400);
    await next();
  };
  app.on("POST", "/surveys", tooLarge(surveyBytes), checkSurveyLimits);
  app.on("PUT", "/surveys/:id", tooLarge(surveyBytes), checkSurveyLimits);
  app.on("POST", "/surveys/:id/responses", tooLarge(jsonBytes), checkAnswerLimits);
  app.on("PATCH", "/surveys/:id/responses/:responseId", tooLarge(jsonBytes), checkAnswerLimits);
  app.on("POST", ["/surveys/:id/responses/:responseId/resume", "/surveys/:id/responses/:responseId/release", "/surveys/:id/webhooks"], tooLarge(jsonBytes));

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
  guard("GET", "/surveys/:id/responses.csv", "response:read");
  guard("GET", "/s/:id", "survey:read");
  guard("POST", "/surveys/:id/webhooks", "webhook:manage");
  guard("GET", "/surveys/:id/webhooks", "webhook:manage");
  guard("DELETE", "/surveys/:id/webhooks/:webhookId", "webhook:manage");
  guard("GET", "/surveys/:id/webhooks/:webhookId/deliveries", "webhook:manage");
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
    const admitted = await admit(c, survey, input.meta, { creating: true, completing: !partial });
    if (!("respondent" in admitted)) return c.json(admitted.body, admitted.status);
    const { respondent } = admitted;
    const hidden = hiddenOf(survey, input.meta);
    const checked = check(survey, input.answers, partial || timedOut(survey, input.meta), c.req.header("accept-language"), hidden);
    if ("bad" in checked) return c.json(checked.bad, 400);
    // Answers to questions hidden by conditional logic are dropped, as the core runtime does.
    const { status: _status, ...given } = withoutBrowserId(input);
    const rest = withQuiz(survey, withHidden(given, hidden), checked.answers, hidden, partial);
    try {
      if (!partial) {
        const saved = await repo.saveResponse(id, { ...rest, answers: checked.answers }, { respondent });
        notify(survey, saved);
        return c.json(saved, 201);
      }
      const secret = randomBytes(32).toString("base64url");
      const saved = await repo.savePartialResponse(id, { ...rest, answers: checked.answers }, hashSecret(secret), respondent);
      notify(survey, saved);
      return c.json({ ...saved, resumeToken: `${saved.id}.${secret}` }, 201);
    } catch (e) {
      if (!duplicate(e)) throw e;
      const [status, error] = CLOSED.answered;
      return c.json({ error, reason: "answered" as const }, status);
    }
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
    const admitted = await admit(c, survey, input.meta, { creating: false, completing: !partial });
    if (!("respondent" in admitted)) return c.json(admitted.body, admitted.status);
    const meta = withoutBrowserId({ meta: input.meta ?? found.response!.meta }).meta;
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
    notify(survey, updated);
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

  /** The list and export filters from a request's query. */
  const filterOf = (c: { req: { queries: (k: string) => string[] | undefined } }, q: { status: "complete" | "partial" | "all"; from?: string; to?: string }) => {
    const hidden = pairs(c.req.queries("hidden"));
    const answers = pairs(c.req.queries("answer"));
    // A bare date for `to` means the whole of that day.
    const until = q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? `${q.to}T23:59:59.999Z` : q.to;
    return {
      status: q.status,
      ...(Object.keys(hidden).length ? { hidden } : {}),
      ...(Object.keys(answers).length ? { answers } : {}),
      ...(q.from ? { from: q.from } : {}),
      ...(until ? { to: until } : {}),
    };
  };

  app.openapi(routes.exportResponses, async (c) => {
    const { id } = c.req.valid("param");
    const query = c.req.valid("query");
    const survey = await repo.loadSurvey(id);
    if (!survey) return c.json({ error: "Survey not found" }, 404);
    const filter = filterOf(c, query);
    const all = [];
    // A page at a time, so a large survey is never one huge query.
    for (let after: { createdAt: string; id: string } | undefined; ; ) {
      const page = await repo.listResponsesPage(id, { limit: 500, offset: 0, ...filter, ...(after ? { after } : {}) });
      all.push(...page);
      if (page.length < 500) break;
      after = page.at(-1)!;
    }
    const csv = responsesToCsv(survey, all, { values: query.values === "true", locale: preferredLocale(c.req.header("accept-language"), survey) });
    return c.body(csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${survey.id}-responses.csv"`,
      "x-content-type-options": "nosniff",
    });
  });

  app.openapi(routes.createWebhook, async (c) => {
    const { id } = c.req.valid("param");
    const { url, events } = c.req.valid("json");
    if (!(await repo.surveyExists(id))) return c.json({ error: "Survey not found" }, 404);
    try {
      await guardOutboundUrl(url, options.webhooks?.outbound);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return c.json({ error: "The URL can't be used", issues: [{ path: ["url"], message }] }, 400);
    }
    const { secret, ...hook } = await repo.createWebhook({ surveyId: id, url, events, secret: newWebhookSecret() });
    return c.json({ id: hook.id, url: hook.url, events: hook.events, createdAt: hook.createdAt, secret }, 201);
  });

  app.openapi(routes.listWebhooks, async (c) => {
    const { id } = c.req.valid("param");
    if (!(await repo.surveyExists(id))) return c.json({ error: "Survey not found" }, 404);
    const items = (await repo.listWebhooks(id)).map(({ secret: _s, surveyId: _id, ...h }) => h);
    return c.json({ items }, 200);
  });

  app.openapi(routes.deleteWebhook, async (c) => {
    const { id, webhookId } = c.req.valid("param");
    return (await repo.deleteWebhook(id, webhookId)) ? c.body(null, 204) : c.json({ error: "Webhook not found" }, 404);
  });

  app.openapi(routes.listDeliveries, async (c) => {
    const { id, webhookId } = c.req.valid("param");
    if (!(await repo.listWebhooks(id)).some((h) => h.id === webhookId)) return c.json({ error: "Webhook not found" }, 404);
    const items = (await repo.listDeliveries(webhookId, 100)).map(({ payload: _p, webhookId: _w, ...d }) => d);
    return c.json({ items }, 200);
  });

  // ── The hosted page and the embed script ──
  const hostedHeaders = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
  // Registered before /s/{id}, so "embed.js" is never read as a survey id.
  app.openapi(routes.embedScript, (c) =>
    c.body(EMBED_JS, 200, { ...hostedHeaders, "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" }),
  );
  app.openapi(routes.hostedAsset, (c) => {
    const { file } = c.req.valid("param");
    const { js, css } = hostedAssets();
    const [body, type] =
      file === "kvesto.js" ? [js, "text/javascript"] : file === "run.js" ? [RUN_JS, "text/javascript"] : file === "kvesto.css" ? [css, "text/css"] : [PAGE_CSS, "text/css"];
    return c.body(body, 200, { ...hostedHeaders, "content-type": `${type}; charset=utf-8`, "cache-control": "public, max-age=300" });
  });
  app.openapi(routes.hostedSurvey, async (c) => {
    const { id } = c.req.valid("param");
    const survey = await repo.loadSurvey(id);
    const page = survey ? hostedPage(id, textOf(survey.title, survey.defaultLocale, survey.defaultLocale)) : "<!doctype html><title>Not found</title><p>This survey doesn't exist.</p>";
    return c.body(page, survey ? 200 : 404, {
      ...hostedHeaders,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": HOSTED_CSP,
      "cache-control": "no-store",
    });
  });

  app.openapi(routes.listResponses, async (c) => {
    const { id } = c.req.valid("param");
    const { limit, offset, status } = c.req.valid("query");
    if (!(await repo.surveyExists(id))) return c.json({ error: "Survey not found" }, 404);
    const { cursor } = c.req.valid("query");
    // `?hidden=name:value` and `?answer=question:value` (repeatable), dates and status.
    const filter = filterOf(c, c.req.valid("query"));
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

  // `app.webhooks.flush()` sends what is due now (tests, graceful shutdown); `stop()` ends the retry timers.
  return Object.assign(app, { webhooks: dispatcher });
}

export type KvestoApp = ReturnType<typeof createApp>;
