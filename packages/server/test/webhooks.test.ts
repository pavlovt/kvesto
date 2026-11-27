import { describe, expect, it, vi } from "vitest";
import { createApp, createSqliteDb, drizzleRepository, guardOutboundUrl, isPrivateAddress, openAccess, signWebhook, verifyWebhook } from "../src/index.js";

const survey = {
  schemaVersion: 1,
  id: "hooked",
  title: "Hooked",
  pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Name" }] }],
};

/** A public-looking host for tests: the resolver says where it points. */
function setup(addresses: Record<string, string[]>, respond: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return respond(String(url));
  });
  const onResponse = vi.fn();
  const app = createApp({
    repository: drizzleRepository(createSqliteDb(":memory:")),
    authorize: openAccess,
    onResponse,
    webhooks: { fetch: fetch as unknown as typeof globalThis.fetch, retryDelays: [0, 0], outbound: { resolve: async (h) => addresses[h] ?? [] } },
  });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
  return { app, send, calls, onResponse };
}

describe("outbound URL guard", () => {
  it.each([
    ["10.1.2.3", true],
    ["172.16.0.1", true],
    ["172.32.0.1", false],
    ["192.168.1.1", true],
    ["127.0.0.1", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["0.0.0.0", true],
    ["8.8.8.8", false],
    ["::1", true],
    ["fd00::1", true],
    ["fe80::1", true],
    ["::ffff:10.0.0.1", true],
    ["2606:4700::1111", false],
  ])("%s private: %s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });

  it("refuses http, credentials, local names and names that resolve to private addresses", async () => {
    const resolve = async (h: string) => ({ "good.test": ["93.184.216.34"], "mixed.test": ["93.184.216.34", "10.0.0.5"], "evil.test": ["127.0.0.1"] })[h] ?? [];
    await expect(guardOutboundUrl("http://good.test/x", { resolve })).rejects.toThrow("Only https URLs are allowed");
    await expect(guardOutboundUrl("https://u:p@good.test/x", { resolve })).rejects.toThrow("credentials");
    await expect(guardOutboundUrl("https://localhost/x", { resolve })).rejects.toThrow("not reachable");
    await expect(guardOutboundUrl("https://evil.test/x", { resolve })).rejects.toThrow("private network");
    await expect(guardOutboundUrl("https://mixed.test/x", { resolve })).rejects.toThrow("private network");
    await expect(guardOutboundUrl("https://[::1]/x", { resolve })).rejects.toThrow("private network");
    await expect(guardOutboundUrl("https://nowhere.test/x", { resolve })).rejects.toThrow("Could not resolve");
    expect((await guardOutboundUrl("https://good.test/x", { resolve })).hostname).toBe("good.test");
    expect((await guardOutboundUrl("http://127.0.0.1:9/x", { allowHttp: true, allowPrivate: true })).port).toBe("9");
  });
});

describe("webhooks", () => {
  it("refuses a webhook to a private address, and shows the secret only once", async () => {
    const { send } = setup({ "hooks.test": ["93.184.216.34"], "inside.test": ["10.0.0.1"] }, () => new Response("ok"));
    await send("POST", "/surveys", survey);
    const bad = await send("POST", "/surveys/hooked/webhooks", { url: "https://inside.test/h" });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).toContain("private network");
    const created = await send("POST", "/surveys/hooked/webhooks", { url: "https://hooks.test/h" });
    expect(created.status).toBe(201);
    const hook = await created.json();
    expect(hook.secret).toMatch(/^whsec_/);
    expect(hook.events).toEqual(["response.completed"]);
    const list = await (await send("GET", "/surveys/hooked/webhooks")).json();
    expect(list.items).toEqual([{ id: hook.id, url: "https://hooks.test/h", events: ["response.completed"], createdAt: hook.createdAt }]);
  });

  it("delivers a signed event on completion, logs it, and calls onResponse", async () => {
    const { app, send, calls, onResponse } = setup({ "hooks.test": ["93.184.216.34"] }, () => new Response("ok"));
    await send("POST", "/surveys", survey);
    const hook = await (await send("POST", "/surveys/hooked/webhooks", { url: "https://hooks.test/h", events: ["response.completed", "response.updated"] })).json();
    await send("POST", "/surveys/hooked/responses", { answers: { name: "Ana" } });
    await new Promise((r) => setTimeout(r, 10));
    await app.webhooks.flush();
    expect(calls).toHaveLength(1);
    const { init } = calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["kvesto-event"]).toBe("response.completed");
    expect(init.redirect).toBe("manual");
    const body = init.body as string;
    expect(JSON.parse(body)).toMatchObject({ event: "response.completed", surveyId: "hooked", response: { answers: { name: "Ana" } } });
    expect(verifyWebhook(hook.secret, headers["kvesto-signature"], body)).toBe(true);
    expect(verifyWebhook(hook.secret, headers["kvesto-signature"], body + " ")).toBe(false);
    expect(verifyWebhook("whsec_other", headers["kvesto-signature"], body)).toBe(false);
    expect(onResponse).toHaveBeenCalledWith("response.completed", expect.objectContaining({ answers: { name: "Ana" } }), expect.objectContaining({ id: "hooked" }));
    const log = await (await send("GET", `/surveys/hooked/webhooks/${hook.id}/deliveries`)).json();
    expect(log.items[0]).toMatchObject({ event: "response.completed", status: "succeeded", attempts: 1, lastStatusCode: 200 });
    expect(log.items[0].payload).toBeUndefined();
  });

  it("retries failures with backoff, then gives up", async () => {
    const { app, send, calls } = setup({ "hooks.test": ["93.184.216.34"] }, () => new Response("down", { status: 503 }));
    await send("POST", "/surveys", survey);
    const hook = await (await send("POST", "/surveys/hooked/webhooks", { url: "https://hooks.test/h" })).json();
    await send("POST", "/surveys/hooked/responses", { answers: {} });
    await new Promise((r) => setTimeout(r, 10));
    for (let i = 0; i < 5; i++) {
      await app.webhooks.flush();
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(calls).toHaveLength(3);
    const log = await (await send("GET", `/surveys/hooked/webhooks/${hook.id}/deliveries`)).json();
    expect(log.items[0]).toMatchObject({ status: "failed", attempts: 3, lastStatusCode: 503, lastError: "HTTP 503" });
    app.webhooks.stop();
  });

  it("does not deliver when the host has started resolving to a private address", async () => {
    const addresses: Record<string, string[]> = { "hooks.test": ["93.184.216.34"] };
    const { app, send, calls } = setup(addresses, () => new Response("ok"));
    await send("POST", "/surveys", survey);
    const hook = await (await send("POST", "/surveys/hooked/webhooks", { url: "https://hooks.test/h" })).json();
    addresses["hooks.test"] = ["169.254.169.254"];
    await send("POST", "/surveys/hooked/responses", { answers: {} });
    await new Promise((r) => setTimeout(r, 10));
    await app.webhooks.flush();
    expect(calls).toHaveLength(0);
    const log = await (await send("GET", `/surveys/hooked/webhooks/${hook.id}/deliveries`)).json();
    expect(log.items[0]).toMatchObject({ status: "failed", attempts: 1, lastError: "That address is inside a private network" });
  });

  it("can be removed, and needs the webhook:manage action", async () => {
    const { send } = setup({ "hooks.test": ["93.184.216.34"] }, () => new Response("ok"));
    await send("POST", "/surveys", survey);
    const hook = await (await send("POST", "/surveys/hooked/webhooks", { url: "https://hooks.test/h" })).json();
    expect((await send("DELETE", `/surveys/hooked/webhooks/${hook.id}`)).status).toBe(204);
    expect((await send("DELETE", `/surveys/hooked/webhooks/${hook.id}`)).status).toBe(404);
    const seen: string[] = [];
    const locked = createApp({
      repository: drizzleRepository(createSqliteDb(":memory:")),
      authorize: (_c, r) => (seen.push(r.action), r.action !== "webhook:manage"),
    });
    expect((await locked.request("/surveys/hooked/webhooks")).status).toBe(403);
    expect(seen).toContain("webhook:manage");
  });

  it("signs with a timestamp that receivers can check for replays", () => {
    const header = signWebhook("s", "{}", 1_000);
    expect(verifyWebhook("s", header, "{}", 300, 1_000_000)).toBe(true);
    expect(verifyWebhook("s", header, "{}", 300, 2_000_000)).toBe(false);
  });
});
