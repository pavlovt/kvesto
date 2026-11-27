import type { FileAnswer, Survey, SurveyResponse } from "@kvesto/schema";
import type { SurveyStorage, SurveySummary } from "../storage.js";

export interface HttpStorageOptions {
  /** Base URL of a Kvesto-compatible REST API, e.g. "https://example.com/api". */
  baseUrl: string;
  /** Custom fetch (for SSR, auth wrappers or tests). Default `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Extra headers on every request, e.g. an Authorization header. */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
}

export class HttpStorageError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Kvesto API request failed with status ${status}`);
    this.name = "HttpStorageError";
  }
}

/** Talks to the Kvesto REST API (see packages/server and its OpenAPI spec). */
export function httpStorage(options: HttpStorageOptions): Required<SurveyStorage> {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function request<T>(method: string, path: string, body?: unknown, allow404 = false): Promise<T | null> {
    const extra = typeof options.headers === "function" ? await options.headers() : (options.headers ?? {});
    // FormData sets its own multipart content type (with the boundary).
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) {
      let detail: unknown;
      try {
        detail = await res.json();
      } catch {
        detail = undefined;
      }
      throw new HttpStorageError(res.status, detail);
    }
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }

  const enc = encodeURIComponent;
  // The server's signed "loaded at" token for each survey (for `antiSpam.minSeconds`), sent back with the response.
  const started = new Map<string, string>();
  const withStart = <T extends { meta?: Record<string, unknown> }>(surveyId: string, body: T): T => {
    const start = started.get(surveyId);
    return start ? { ...body, meta: { ...body.meta, start } } : body;
  };
  /** The response a resume token belongs to: the token is `responseId.secret`. */
  const progressPath = (surveyId: string, token: string) => `/surveys/${enc(surveyId)}/responses/${enc(token.split(".")[0]!)}`;

  return {
    loadSurvey: async (id) => {
      const extra = typeof options.headers === "function" ? await options.headers() : (options.headers ?? {});
      const res = await doFetch(`${base}/surveys/${enc(id)}`, { method: "GET", headers: { accept: "application/json", ...extra } });
      if (res.status === 404) return null;
      if (!res.ok) throw new HttpStorageError(res.status, await res.json().catch(() => undefined));
      const start = res.headers.get("x-kvesto-start");
      if (start) started.set(id, start);
      return (await res.json()) as Survey;
    },
    saveSurvey: async (survey) => (await request<Survey>("PUT", `/surveys/${enc(survey.id)}`, survey))!,
    deleteSurvey: async (id) => {
      await request("DELETE", `/surveys/${enc(id)}`);
    },
    listSurveys: async () => (await request<{ items: SurveySummary[] }>("GET", "/surveys"))!.items,
    saveResponse: async (surveyId, response, opts) =>
      opts?.resumeToken
        ? (await request<SurveyResponse>("PATCH", progressPath(surveyId, opts.resumeToken), {
            ...response,
            status: "complete",
            token: opts.resumeToken,
          }))!
        : (await request<SurveyResponse>("POST", `/surveys/${enc(surveyId)}/responses`, withStart(surveyId, response)))!,
    // A partial response on the server; the token is `responseId.secret`, and the secret never goes in a URL.
    saveProgress: async (surveyId, draft) => {
      const body = { answers: draft.answers, status: "partial", meta: { ...draft.meta, progress: { pageIndex: draft.pageIndex, stepId: draft.stepId ?? null } } };
      if (draft.token) {
        await request<SurveyResponse>("PATCH", progressPath(surveyId, draft.token), { ...body, token: draft.token });
        return { token: draft.token };
      }
      const created = (await request<SurveyResponse>("POST", `/surveys/${enc(surveyId)}/responses`, withStart(surveyId, body)))!;
      return { token: created.resumeToken! };
    },
    loadProgress: async (surveyId, token) => {
      try {
        const r = (await request<SurveyResponse>("POST", `${progressPath(surveyId, token)}/resume`, { token }))!;
        const p = (r.meta?.progress ?? {}) as { pageIndex?: number; stepId?: string | null };
        return { answers: r.answers, pageIndex: p.pageIndex ?? 0, stepId: p.stepId ?? null, token };
      } catch (e) {
        if (e instanceof HttpStorageError && (e.status === 403 || e.status === 404 || e.status === 409)) return null;
        throw e;
      }
    },
    // Every response, partial ones included, a page at a time.
    listResponses: async (surveyId) => {
      const all: SurveyResponse[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = (await request<{ items: SurveyResponse[]; total: number }>(
          "GET",
          `/surveys/${enc(surveyId)}/responses?status=all&limit=500&offset=${offset}`,
        ))!;
        all.push(...page.items);
        if (page.items.length < 500 || all.length >= page.total) return all;
      }
    },
    uploadFile: async (surveyId, questionId, file) => {
      const form = new FormData();
      form.set("questionId", questionId);
      form.set("file", file, file.name);
      return (await request<FileAnswer>("POST", `/surveys/${enc(surveyId)}/files`, form))!;
    },
  };
}
