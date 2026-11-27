import { describe, expect, it, vi } from "vitest";
import { httpStorage, createSurvey } from "@kvesto/core";
import { clientAddress, createApp, createSqliteDb, drizzleRepository, memoryRateLimitStore, openAccess, turnstileChallenge } from "../src/index.js";

const survey = (settings: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: "spam",
  title: "Spam",
  settings,
  pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Name" }] }],
});

function setup(options: Partial<Parameters<typeof createApp>[0]> = {}, settings: Record<string, unknown> = {}) {
  const app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: openAccess, ...options });
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers: { "content-type": "application/json", ...headers } });
  const answer = (meta?: Record<string, unknown>, headers: Record<string, string> = {}, name = "Ana") =>
    send("POST", "/surveys/spam/responses", { answers: { name }, ...(meta ? { meta } : {}) }, headers);
  return { app, send, answer, ready: send("POST", "/surveys", survey(settings)) };
}

describe("rate limits", () => {
  it("answers 429 with Retry-After over a budget, per address and survey", async () => {
    const { answer, ready, send } = setup({
      rateLimit: { budgets: { "response:create": { limit: 2, windowSeconds: 60 } } },
      clientAddress: { trustProxy: 1 },
    });
    await ready;
    const from = (ip: string) => ({ "x-forwarded-for": ip });
    expect((await answer(undefined, from("1.1.1.1"))).status).toBe(201);
    expect((await answer(undefined, from("1.1.1.1"))).status).toBe(201);
    const limited = await answer(undefined, from("1.1.1.1"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(limited.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    // Another address has its own budget, and reading the survey isn't limited.
    expect((await answer(undefined, from("2.2.2.2"))).status).toBe(201);
    expect((await send("GET", "/surveys/spam", undefined, from("1.1.1.1"))).status).toBe(200);
  });

  it("limits the admin routes separately", async () => {
    const { send, ready, answer } = setup({ rateLimit: { budgets: { admin: { limit: 2, windowSeconds: 60 } } } });
    expect((await ready).status).toBe(201); // creating the survey is the first admin request
    expect((await send("GET", "/surveys")).status).toBe(200);
    expect((await send("GET", "/surveys")).status).toBe(429);
    expect((await answer()).status).toBe(201);
  });

  it("ignores X-Forwarded-For unless proxies are trusted, and takes the right hop", () => {
    const c = (xff: string) => ({ req: { header: (n: string) => (n === "x-forwarded-for" ? xff : undefined) }, env: { incoming: { socket: { remoteAddress: "10.0.0.1" } } } }) as never;
    expect(clientAddress(c("6.6.6.6"))).toBe("10.0.0.1");
    expect(clientAddress(c("6.6.6.6, 3.3.3.3"), { trustProxy: 1 })).toBe("3.3.3.3");
    expect(clientAddress(c("6.6.6.6, 3.3.3.3, 4.4.4.4"), { trustProxy: 2 })).toBe("3.3.3.3");
  });

  it("uses the store it is given", async () => {
    const store = memoryRateLimitStore();
    const hit = vi.spyOn(store, "hit");
    const { answer, ready } = setup({ rateLimit: { store } });
    await ready;
    await answer();
    expect(hit.mock.calls.some(([key]) => String(key).startsWith("response:create:"))).toBe(true);
  });
});

describe("bot friction", () => {
  it("refuses a filled-in honeypot, and doesn't store the field", async () => {
    const { answer, ready, send } = setup({}, { antiSpam: { honeypot: true } });
    await ready;
    const bot = await answer({ honeypot: "http://spam.test" });
    expect(bot.status).toBe(400);
    expect(await bot.json()).toMatchObject({ reason: "spam" });
    expect((await answer({ honeypot: "" })).status).toBe(201);
    const list = await (await send("GET", "/surveys/spam/responses")).json();
    expect(list.items[0].meta).toBeUndefined();
  });

  it("refuses a submission sooner than minSeconds after the survey was loaded", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { answer, ready, send } = setup({}, { antiSpam: { minSeconds: 5 } });
      await ready;
      expect((await answer()).status).toBe(400);
      const start = (await send("GET", "/surveys/spam")).headers.get("x-kvesto-start")!;
      expect(start).toMatch(/^\d+\./);
      const fast = await answer({ start });
      expect(fast.status).toBe(400);
      expect((await fast.json()).error).toBe("Submitted too fast");
      expect((await answer({ start: start.replace(/\d$/, "0") + "x" })).status).toBe(400);
      vi.setSystemTime(Date.now() + 6_000);
      expect((await answer({ start })).status).toBe(201);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends the start token from httpStorage, so the runner passes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { app, ready } = setup({}, { antiSpam: { minSeconds: 2 } });
      await ready;
      const storage = httpStorage({ baseUrl: "http://kvesto.test", fetch: ((url: string, init?: RequestInit) => app.request(url, init)) as typeof fetch });
      const loaded = await storage.loadSurvey("spam");
      const model = createSurvey({ survey: loaded!, storage });
      model.setValue("name", "Ana");
      vi.setSystemTime(Date.now() + 3_000);
      expect(await model.complete()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("checks the challenge token with verifyChallenge (a mocked Turnstile)", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const token = new URLSearchParams(String(init?.body)).get("response");
      return new Response(JSON.stringify({ success: token === "good" }));
    });
    const { answer, ready } = setup({ verifyChallenge: turnstileChallenge("secret", fetch as unknown as typeof globalThis.fetch) }, { antiSpam: { challenge: true } });
    await ready;
    expect((await answer()).status).toBe(400);
    expect((await answer({ challenge: "bad" })).status).toBe(400);
    expect((await answer({ challenge: "good" })).status).toBe(201);
    expect(fetch.mock.calls[0]![0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(new URLSearchParams(String(fetch.mock.calls[0]![1]!.body)).get("secret")).toBe("secret");
  });

  it("refuses the same answers from the same browser within the duplicate window", async () => {
    const { answer, ready } = setup({}, { antiSpam: { duplicateWindow: 60 } });
    await ready;
    const ua = { "user-agent": "Bot/1.0" };
    expect((await answer(undefined, ua)).status).toBe(201);
    const again = await answer(undefined, ua);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ reason: "duplicate" });
    expect((await answer(undefined, ua, "Bo")).status).toBe(201);
    expect((await answer(undefined, { "user-agent": "Other" })).status).toBe(201);
  });
});
