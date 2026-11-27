import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, createSqliteDb, drizzleRepository, openAccess, type Authorize } from "../src/index.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

const survey = (settings: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: "gdpr",
  title: "Privacy",
  settings,
  hiddenFields: ["campaign", "email"],
  pages: [
    {
      id: "p",
      elements: [
        { id: "name", type: "text", title: "Name", pii: true },
        { id: "rating", type: "rating", title: "Rating", min: 1, max: 5 },
        { id: "photo", type: "file", title: "Photo", accept: ["image/*"] },
        { id: "agree", type: "boolean", title: "I agree to the privacy policy", consent: true },
      ],
    },
  ],
});

function setup(settings: Record<string, unknown> = {}, authorize: Authorize = openAccess, extra: Record<string, unknown> = {}) {
  const db = createSqliteDb(":memory:");
  const fetch = vi.fn(async () => new Response("ok"));
  const app = createApp({
    repository: drizzleRepository(db),
    authorize,
    webhooks: { fetch: fetch as unknown as typeof globalThis.fetch, retryDelays: [0], outbound: { resolve: async () => ["93.184.216.34"] } },
    ...extra,
  });
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(`http://kvesto.test${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers: { "content-type": "application/json", ...headers } });
  const answer = (answers: Record<string, unknown>, meta?: Record<string, unknown>) => send("POST", "/surveys/gdpr/responses", { answers, ...(meta ? { meta } : {}) });
  const upload = async () => {
    const form = new FormData();
    form.set("questionId", "photo");
    form.set("file", new File([PNG], "me.png", { type: "image/png" }));
    return (await app.request("http://kvesto.test/surveys/gdpr/files", { method: "POST", body: form })).json();
  };
  return { app, db, fetch, send, answer, upload, ready: send("POST", "/surveys", survey(settings)) };
}

/** Everything allowed except reading `pii` answers. */
const noPii: Authorize = (_c, r) => r.action !== "response:read-pii";

afterEach(() => vi.useRealTimers());

describe("consent", () => {
  it("refuses a response until the consent box is ticked, then records the text and the time", async () => {
    const { answer, ready } = setup();
    await ready;
    const no = await answer({ name: "Ana", agree: false });
    expect(no.status).toBe(400);
    expect(JSON.stringify(await no.json())).toContain("Please agree to continue.");
    expect((await answer({ name: "Ana" })).status).toBe(400);
    const yes = await answer({ name: "Ana", agree: true }, { consent: { agree: { text: "forged", at: "1999-01-01" } } });
    expect(yes.status).toBe(201);
    const { meta } = await yes.json();
    expect(meta.consent.agree.text).toBe("I agree to the privacy policy");
    expect(Date.now() - Date.parse(meta.consent.agree.at)).toBeLessThan(5_000);
  });
});

describe("anonymous surveys", () => {
  it("store no respondent id, identifying hidden fields or client meta", async () => {
    const { app, db, ready, send } = createAppForAnonymous();
    await ready;
    const res = await send(
      "POST",
      "/surveys/gdpr/responses",
      { answers: { rating: 4, agree: true }, meta: { hidden: { campaign: "spring", email: "ana@example.com" }, userAgent: "Firefox", ip: "1.2.3.4" } },
      { "user-agent": "Firefox/140", "x-forwarded-for": "1.2.3.4", "x-user": "ana@example.com" },
    );
    expect(res.status).toBe(201);
    const rows = db.$client.prepare("select * from responses").all();
    const raw = JSON.stringify(rows);
    for (const secret of ["ana@example.com", "Firefox", "1.2.3.4"]) expect(raw).not.toContain(secret);
    expect(raw).toContain("spring");
    void app;
  });

  function createAppForAnonymous() {
    const s = setup({ anonymous: true, anonymousHidden: ["campaign"] }, openAccess, { identifyRespondent: (c: { req: { header: (n: string) => string | undefined } }) => c.req.header("x-user") ?? null });
    return s;
  }
});

describe("masking pii answers", () => {
  it("masks them in lists, exports and webhooks without response:read-pii", async () => {
    const { app, fetch, send, answer, ready } = setup({}, noPii);
    await ready;
    await send("POST", "/surveys/gdpr/webhooks", { url: "https://hooks.test/h" });
    await answer({ name: "Ana Petrova", rating: 5, agree: true });
    const list = await (await send("GET", "/surveys/gdpr/responses")).json();
    expect(list.items[0].answers).toMatchObject({ name: "[redacted]", rating: 5 });
    const csv = await (await send("GET", "/surveys/gdpr/responses.csv")).text();
    expect(csv).not.toContain("Ana Petrova");
    expect(csv).toContain("[redacted]");
    await new Promise((r) => setTimeout(r, 10));
    await app.webhooks.flush();
    const body = String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(body).not.toContain("Ana Petrova");
    expect(body).toContain("[redacted]");
    app.webhooks.stop();
  });

  it("shows them to a caller that may read them", async () => {
    const { send, answer, ready } = setup();
    await ready;
    await answer({ name: "Ana Petrova", agree: true });
    const list = await (await send("GET", "/surveys/gdpr/responses")).json();
    expect(list.items[0].answers.name).toBe("Ana Petrova");
  });
});

describe("deleting responses", () => {
  it("deletes a response and its files (response:delete)", async () => {
    const seen: string[] = [];
    const { app, send, answer, upload, ready } = setup({}, (_c, r) => (seen.push(r.action), true));
    await ready;
    const file = await upload();
    const saved = await (await answer({ name: "Ana", agree: true, photo: [file] })).json();
    expect((await app.request(file.url)).status).toBe(200);
    expect((await send("DELETE", `/surveys/gdpr/responses/${saved.id}`)).status).toBe(204);
    expect(seen).toContain("response:delete");
    expect((await app.request(file.url)).status).toBe(404);
    expect((await send("DELETE", `/surveys/gdpr/responses/${saved.id}`)).status).toBe(404);
  });

  it("lets the respondent download and delete their own response with its token", async () => {
    const { send, answer, ready } = setup();
    await ready;
    const saved = await (await answer({ name: "Ana", agree: true })).json();
    expect(saved.resumeToken).toMatch(new RegExp(`^${saved.id}\\.`));
    expect((await send("POST", `/surveys/gdpr/responses/${saved.id}/mine`, { token: `${saved.id}.wrong` })).status).toBe(403);
    const mine = await send("POST", `/surveys/gdpr/responses/${saved.id}/mine`, { token: saved.resumeToken });
    expect(mine.status).toBe(200);
    expect((await mine.json()).answers.name).toBe("Ana");
    expect((await send("POST", `/surveys/gdpr/responses/${saved.id}/forget`, { token: saved.resumeToken })).status).toBe(204);
    expect((await send("POST", `/surveys/gdpr/responses/${saved.id}/mine`, { token: saved.resumeToken })).status).toBe(404);
  });

  it("purges responses older than retentionDays, with their files", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { app, send, answer, upload, ready } = setup({ retentionDays: 30 });
    await ready;
    const file = await upload();
    await answer({ name: "Old", agree: true, photo: [file] });
    vi.setSystemTime(Date.now() + 20 * 86_400_000);
    await answer({ name: "Newer", agree: true });
    vi.setSystemTime(Date.now() + 15 * 86_400_000);
    expect(await app.privacy.purge()).toBe(1);
    const list = await (await send("GET", "/surveys/gdpr/responses")).json();
    expect(list.items.map((r: { answers: { name: string } }) => r.answers.name)).toEqual(["Newer"]);
    expect((await app.request(file.url)).status).toBe(404);
  });
});
