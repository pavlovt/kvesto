import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, createSqliteDb, drizzleRepository, isRespondentRoute, openAccess, type SurveyRepository } from "../src/index.js";

const survey = {
  schemaVersion: 1,
  id: "hard",
  title: "Hard",
  pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Name" }, { id: "tags", type: "tags", title: "Tags", allowCustom: true, choices: [{ value: "a", label: "A" }] }] }],
};

function setup(options: Partial<Parameters<typeof createApp>[0]> = {}) {
  const app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: openAccess, ...options });
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method,
      ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
      headers: { "content-type": "application/json", ...headers },
    });
  return { app, send };
}

afterEach(() => vi.restoreAllMocks());

describe("secure headers", () => {
  it("are on every response, and only the hosted page may be framed", async () => {
    const { send } = setup();
    await send("POST", "/surveys", survey);
    const api = await send("GET", "/surveys/hard");
    expect(api.headers.get("x-content-type-options")).toBe("nosniff");
    expect(api.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(api.headers.get("x-frame-options")).toBe("DENY");
    expect(api.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(api.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(api.headers.get("strict-transport-security")).toBeNull();
    const admin = await send("GET", "/surveys");
    expect(admin.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    const page = await send("GET", "/s/hard");
    expect(page.headers.get("x-frame-options")).toBeNull();
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors *");
    const embed = await send("GET", "/s/embed.js");
    expect(embed.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
  });

  it("send HSTS over HTTPS, also behind a proxy", async () => {
    const { app } = setup();
    expect((await app.request("https://kvesto.test/health")).headers.get("strict-transport-security")).toContain("max-age=");
    expect((await app.request("/health", { headers: { "x-forwarded-proto": "https" } })).headers.get("strict-transport-security")).toContain("max-age=");
  });
});

describe("CORS by route", () => {
  const preflight = (send: ReturnType<typeof setup>["send"], path: string, method: string, origin = "https://shop.test") =>
    send("OPTIONS", path, undefined, { origin, "access-control-request-method": method });

  it("lets any site use the respondent routes, and no site the admin routes by default", async () => {
    const { send } = setup();
    await send("POST", "/surveys", survey);
    expect((await send("GET", "/surveys/hard", undefined, { origin: "https://shop.test" })).headers.get("access-control-allow-origin")).toBe("*");
    expect((await preflight(send, "/surveys/hard/responses", "POST")).headers.get("access-control-allow-origin")).toBe("*");
    expect((await preflight(send, "/surveys/hard/responses", "GET")).headers.get("access-control-allow-origin")).toBeNull();
    expect((await preflight(send, "/surveys/hard", "PUT")).headers.get("access-control-allow-origin")).toBeNull();
    expect((await send("GET", "/surveys", undefined, { origin: "https://shop.test" })).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("lets the listed origins use the admin routes", async () => {
    const { send } = setup({ adminCors: ["https://admin.test"] });
    expect((await preflight(send, "/surveys/hard", "PUT", "https://admin.test")).headers.get("access-control-allow-origin")).toBe("https://admin.test");
    expect((await preflight(send, "/surveys/hard", "PUT", "https://evil.test")).headers.get("access-control-allow-origin")).toBeNull();
  });

  it("warns when the admin routes are open to any origin", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setup({ adminCors: "*" });
    expect(warn.mock.calls.some(([m]) => String(m).includes("adminCors allows any origin"))).toBe(true);
  });

  it("classifies the routes", () => {
    expect(isRespondentRoute("GET", "/api/surveys/x")).toBe(true);
    expect(isRespondentRoute("GET", "/surveys")).toBe(false);
    expect(isRespondentRoute("GET", "/surveys/x/responses")).toBe(false);
    expect(isRespondentRoute("GET", "/surveys/x/responses.csv")).toBe(false);
    expect(isRespondentRoute("PATCH", "/surveys/x/responses/r")).toBe(true);
    expect(isRespondentRoute("DELETE", "/surveys/x")).toBe(false);
    expect(isRespondentRoute("GET", "/s/assets/kvesto.js")).toBe(true);
  });
});

describe("document limits", () => {
  it("refuses a survey over each limit, before validating it", async () => {
    const { send } = setup({ limits: { survey: { pages: 2, elements: 3, choices: 2, stringLength: 50, panelDepth: 1, conditionDepth: 2 } } });
    const refused = async (doc: unknown, message: string) => {
      const res = await send("POST", "/surveys", doc);
      expect(res.status).toBe(400);
      expect((await res.json()).issues.map((i: { message: string }) => i.message)).toContain(message);
    };
    const page = (i: number) => ({ id: `p${i}`, elements: [] });
    await refused({ ...survey, pages: [page(1), page(2), page(3)] }, "More than 2 pages");
    const q = (id: string, extra = {}) => ({ id, type: "text", title: id, ...extra });
    await refused({ ...survey, pages: [{ id: "p", elements: [q("a"), q("b"), q("c"), q("d")] }] }, "More than 3 elements");
    await refused(
      { ...survey, pages: [{ id: "p", elements: [{ id: "c", type: "single-choice", title: "C", choices: ["a", "b", "c"].map((v) => ({ value: v, label: v })) }] }] },
      "More than 2 choices",
    );
    await refused({ ...survey, title: "x".repeat(51) }, "Longer than 50 characters");
    await refused({ ...survey, pages: [{ id: "p", elements: [{ id: "o", type: "panel", elements: [{ id: "i", type: "panel", elements: [] }] }] }] }, "Panels nested more than 1 levels deep");
    const deep = { not: { not: { question: "a", op: "eq", value: "x" } } };
    await refused({ ...survey, pages: [{ id: "p", elements: [q("a"), q("b", { visibleIf: deep })] }] }, "Conditions nested more than 2 levels deep");
  });

  it("refuses hostile nesting with a 400, not a crash", async () => {
    const { send } = setup();
    const deep = "[".repeat(50_000) + "]".repeat(50_000);
    const res = await send("POST", "/surveys", `{"schemaVersion":1,"id":"x","title":"x","pages":${deep}}`);
    expect(res.status).toBe(400);
    expect((await res.json()).issues[0].message).toBe("Nested more than 64 levels deep");
  });

  it("refuses answers over the limits", async () => {
    const { send } = setup({ limits: { answers: { stringLength: 10, arrayLength: 2 } } });
    await send("POST", "/surveys", survey);
    const long = await send("POST", "/surveys/hard/responses", { answers: { name: "x".repeat(11) } });
    expect(long.status).toBe(400);
    expect((await long.json()).issues).toEqual([{ path: ["answers", "name"], message: "Longer than 10 characters" }]);
    const many = await send("POST", "/surveys/hard/responses", { answers: { tags: ["a", "b", "c"] } });
    expect(many.status).toBe(400);
    expect((await send("POST", "/surveys/hard/responses", { answers: { name: "Ana" } })).status).toBe(201);
  });

  it("limits body sizes", async () => {
    const { send } = setup({ limits: { jsonBytes: 1000, surveyBytes: 2000 } });
    await send("POST", "/surveys", survey);
    const big = await send("POST", "/surveys/hard/responses", { answers: { name: "x".repeat(2000) } });
    expect(big.status).toBe(413);
    const bigSurvey = await send("PUT", "/surveys/hard", { ...survey, description: "x".repeat(3000) });
    expect(bigSurvey.status).toBe(413);
  });
});

describe("error hygiene", () => {
  it("answers a failure with a request id, never the error, and logs it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...drizzleRepository(createSqliteDb(":memory:")), listSurveys: async () => Promise.reject(new Error("SQLITE_CORRUPT: secret table details")) } as SurveyRepository;
    const app = createApp({ repository: broken, authorize: openAccess });
    const res = await app.request("/surveys");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Internal server error", requestId: res.headers.get("x-request-id") });
    expect(JSON.stringify(body)).not.toContain("SQLITE");
    expect(String(error.mock.calls[0]?.[0])).toContain(body.requestId);
  });

  it("keeps a request id the caller sent", async () => {
    const { app } = setup();
    expect((await app.request("/health", { headers: { "x-request-id": "abc-123" } })).headers.get("x-request-id")).toBe("abc-123");
  });
});
