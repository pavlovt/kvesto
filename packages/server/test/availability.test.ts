import { describe, expect, it } from "vitest";
import { createApp, createSqliteDb, drizzleRepository, openAccess } from "../src/index.js";

const survey = (settings: Record<string, unknown>) => ({
  schemaVersion: 1,
  id: "limited",
  title: "Limited",
  settings,
  pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Name" }] }],
});

/** An app whose respondent is whatever the `x-user` header says. */
function setup(settings: Record<string, unknown>) {
  const db = createSqliteDb(":memory:");
  const app = createApp({
    repository: drizzleRepository(db),
    authorize: openAccess,
    identifyRespondent: (c) => c.req.header("x-user") ?? null,
    respondentSecret: "test-secret",
  });
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
  const answer = (headers: Record<string, string> = {}, extra: Record<string, unknown> = {}) =>
    send("POST", "/surveys/limited/responses", { answers: { name: "Ana" }, ...extra }, headers);
  return { db, send, answer, ready: send("POST", "/surveys", survey(settings)) };
}

const hour = 3_600_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

describe("survey availability", () => {
  it("refuses responses before opensAt and after closesAt", async () => {
    const early = setup({ opensAt: at(hour) });
    await early.ready;
    const res = await early.answer();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ reason: "not-open" });

    const late = setup({ opensAt: at(-2 * hour), closesAt: at(-hour) });
    await late.ready;
    const closed = await late.answer();
    expect(closed.status).toBe(403);
    expect(await closed.json()).toMatchObject({ reason: "closed" });

    const open = setup({ opensAt: at(-hour), closesAt: at(hour) });
    await open.ready;
    expect((await open.answer()).status).toBe(201);
  });

  it("refuses a survey whose closesAt is before its opensAt", async () => {
    const { ready } = setup({ opensAt: at(hour), closesAt: at(-hour) });
    expect((await ready).status).toBe(400);
  });

  it("stops at maxResponses, counting only complete responses", async () => {
    const { answer } = setup({ maxResponses: 2 });
    expect((await answer({}, { status: "partial" })).status).toBe(201);
    expect((await answer()).status).toBe(201);
    expect((await answer()).status).toBe(201);
    const full = await answer();
    expect(full.status).toBe(409);
    expect(await full.json()).toMatchObject({ reason: "full" });
  });

  it("refuses a partial response's completion once the survey is full", async () => {
    const { answer, send } = setup({ maxResponses: 1 });
    const draft = await (await answer({}, { status: "partial" })).json();
    expect((await answer()).status).toBe(201);
    const res = await send("PATCH", `/surveys/limited/responses/${draft.id}`, { answers: { name: "B" }, token: draft.resumeToken });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "full" });
  });

  it("takes one response per respondent, and needs one to be identified", async () => {
    const { answer } = setup({ oneResponsePer: "respondent" });
    const anon = await answer();
    expect(anon.status).toBe(401);
    expect(await anon.json()).toMatchObject({ reason: "sign-in" });
    const first = await answer({ "x-user": "u1" });
    expect(first.status).toBe(201);
    expect((await first.json()).respondentId).toBe("u1");
    const again = await answer({ "x-user": "u1" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ reason: "answered" });
    expect((await answer({ "x-user": "u2" })).status).toBe(201);
  });

  it("requireRespondent takes only identified respondents, any number of times", async () => {
    const { answer } = setup({ requireRespondent: true });
    expect((await answer()).status).toBe(401);
    expect((await answer({ "x-user": "u1" })).status).toBe(201);
    expect((await answer({ "x-user": "u1" })).status).toBe(201);
  });

  it("takes one response per browser by its browserId, and doesn't store the id", async () => {
    const { answer, send } = setup({ oneResponsePer: "browser" });
    expect((await answer()).status).toBe(400);
    const browser = { meta: { browserId: "b".repeat(24) } };
    const first = await answer({}, browser);
    expect(first.status).toBe(201);
    expect((await first.json()).meta).toBeUndefined();
    expect((await answer({}, browser)).status).toBe(409);
    expect((await answer({}, { meta: { browserId: "c".repeat(24) } })).status).toBe(201);
    const list = await (await send("GET", "/surveys/limited/responses")).json();
    expect(JSON.stringify(list)).not.toContain("b".repeat(24));
  });

  it("keeps only the salted hash for an anonymous survey", async () => {
    const { answer, db } = setup({ oneResponsePer: "respondent", anonymous: true });
    const res = await answer({ "x-user": "alice@example.com" });
    expect(res.status).toBe(201);
    expect((await res.json()).respondentId).toBeUndefined();
    const rows = db.$client.prepare("select respondent_id, respondent_key from responses").all() as { respondent_id: string | null; respondent_key: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.respondent_id).toBeNull();
    expect(rows[0]!.respondent_key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain("alice");
    expect((await answer({ "x-user": "alice@example.com" })).status).toBe(409);
  });
});
