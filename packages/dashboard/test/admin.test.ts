import { flushSync, mount, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import { memoryStorage } from "@kvesto/core";
import { ApiTokens, AuditLog, SurveyResults, mountDashboard } from "../src/lib/index.js";

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
};

/** A fake Kvesto server: answers by "METHOD path" (without the query) and records every call. */
function fakeServer(routes: Record<string, (url: URL, body: unknown) => Response | unknown>) {
  const calls: { method: string; url: URL; body: unknown; headers: Record<string, string> }[] = [];
  const fetch = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body, headers: init.headers as Record<string, string> });
    const route = routes[`${method} ${url.pathname.replace(/^\/api/, "")}`];
    if (!route) return new Response(JSON.stringify({ error: "nope" }), { status: 404 });
    const out = route(url, body);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { calls, api: { baseUrl: "http://kv.test/api/", fetch } };
}

const button = (root: Element, text: string) => [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
const input = (root: Element, label: string) =>
  [...root.querySelectorAll("label")].find((l) => l.textContent?.trim().startsWith(label))!.querySelector<HTMLInputElement>("input, select")!;
const enter = (el: HTMLInputElement, value: string, event = "input") => {
  el.value = value;
  el.dispatchEvent(new Event(event, { bubbles: true }));
  flushSync();
};
const submit = (root: Element) => root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

describe("admin sections", () => {
  it("shows tokens and the audit log only with an API", async () => {
    const plain = document.createElement("div");
    const first = mountDashboard(plain, { storage: memoryStorage() });
    await settle();
    expect(plain.querySelector(".kv-dash-sections")).toBeNull();
    first.destroy();

    const { api } = fakeServer({ "GET /tokens": () => ({ items: [] }), "GET /audit": () => ({ items: [] }) });
    const target = document.createElement("div");
    const dash = mountDashboard(target, { storage: memoryStorage(), api });
    await settle();
    button(target, "API tokens").click();
    await settle();
    expect(target.querySelector("h1")?.textContent).toBe("API tokens");
    button(target, "Audit log").click();
    await settle();
    expect(target.querySelector("h1")?.textContent).toBe("Audit log");
    button(target, "Surveys").click();
    await settle();
    expect(target.querySelector("h1")?.textContent).toBe("Surveys");
    dash.destroy();
  });
});

describe("API tokens", () => {
  it("creates a token and shows it once, lists tokens and revokes one after a second press", async () => {
    const items = [
      { id: "t1", name: "CI", actions: ["survey:read"], surveyIds: null as string[] | null, expiresAt: null as string | null, createdAt: "2026-01-01T00:00:00Z", lastUsedAt: null, revokedAt: null as string | null },
    ];
    const server = fakeServer({
      "GET /tokens": () => ({ items }),
      "POST /tokens": (_u, body) => {
        const b = body as { name: string; surveyIds?: string[] };
        const t = { id: "t2", name: b.name, actions: ["response:read"], surveyIds: b.surveyIds ?? null, expiresAt: "2099-01-01T00:00:00Z", createdAt: "", lastUsedAt: null, revokedAt: null };
        items.unshift(t);
        return new Response(JSON.stringify({ ...t, token: "kv_secret" }), { status: 201 });
      },
      "DELETE /tokens/t1": () => {
        items.find((t) => t.id === "t1")!.revokedAt = "2026-02-01T00:00:00Z";
        return new Response(null, { status: 204 });
      },
    });
    const target = document.createElement("div");
    const view = mount(ApiTokens, { target, props: { api: server.api } });
    await settle();
    expect(target.querySelector("tbody")!.textContent).toContain("CI");

    enter(input(target, "Name"), "Reports");
    enter(input(target, "Role"), "analyst", "change");
    enter(input(target, "Surveys"), "a, b");
    enter(input(target, "Expires after"), "30");
    submit(target);
    await settle();
    expect(server.calls.find((c) => c.method === "POST")!.body).toEqual({ name: "Reports", role: "analyst", surveyIds: ["a", "b"], expiresInDays: 30 });
    expect(target.querySelector<HTMLInputElement>(".kv-dash-token-value")!.value).toBe("kv_secret");
    expect(target.querySelector("tbody")!.textContent).toContain("Reports");
    button(target, "Done").click();
    flushSync();
    expect(target.querySelector(".kv-dash-token-value")).toBeNull();

    const revoke = target.querySelector<HTMLButtonElement>('[aria-label="Revoke CI"]')!;
    revoke.click();
    flushSync();
    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(revoke.textContent).toBe("Really revoke?");
    revoke.click();
    await settle();
    expect(server.calls.filter((c) => c.method === "DELETE").map((c) => c.url.pathname)).toEqual(["/api/tokens/t1"]);
    expect(target.querySelector('[aria-label="Revoke CI"]')).toBeNull();
    expect(target.querySelector("tbody")!.textContent).toContain("Revoked");
    unmount(view);
  });

  it("shows the server's refusal", async () => {
    const server = fakeServer({ "GET /tokens": () => new Response(JSON.stringify({ error: "Needs token:manage" }), { status: 403 }) });
    const target = document.createElement("div");
    const view = mount(ApiTokens, { target, props: { api: server.api } });
    await settle();
    expect(target.querySelector(".kv-dash-error")!.textContent).toBe("Not allowed (403): Needs token:manage.");
    unmount(view);
  });
});

describe("audit log", () => {
  const entry = (seq: number) => ({
    seq,
    at: `2026-03-0${seq}T10:00:00.000Z`,
    actor: "key:admin",
    action: "survey:write",
    method: "PUT",
    path: "/surveys/s",
    surveyId: "s",
    status: 200,
    ip: "1.2.3.4",
    requestId: `r${seq}`,
    hash: "h",
  });

  it("filters, pages with `after` and links the CSV with the same filters", async () => {
    const server = fakeServer({
      "GET /audit": (url) => (url.searchParams.get("after") ? { items: [entry(3)] } : { items: [entry(1), entry(2)], nextAfter: 2 }),
      "GET /audit.csv": () => new Response("seq,at\n1,x\n", { status: 200, headers: { "content-type": "text/csv" } }),
    });
    const api = { ...server.api, headers: { authorization: "Bearer k" } };
    const target = document.createElement("div");
    const view = mount(AuditLog, { target, props: { api, pageSize: 2 } });
    await settle();
    expect(target.querySelectorAll("tbody tr")).toHaveLength(2);

    enter(input(target, "Actor"), "key:admin");
    enter(input(target, "Survey"), "s");
    enter(input(target, "From"), "2026-03-01", "change");
    enter(input(target, "To"), "2026-03-31", "change");
    // Typing doesn't reload; searching does.
    expect(server.calls).toHaveLength(1);
    submit(target);
    await settle();
    const last = () => server.calls.at(-1)!;
    expect(Object.fromEntries(last().url.searchParams)).toEqual({ actor: "key:admin", surveyId: "s", from: "2026-03-01", to: "2026-03-31T23:59:59.999Z", limit: "2" });
    expect(last().headers.authorization).toBe("Bearer k");

    button(target, "Load more").click();
    await settle();
    expect(last().url.searchParams.get("after")).toBe("2");
    expect([...target.querySelectorAll("tbody tr td:first-child")].map((td) => td.textContent)).toEqual(["1", "2", "3"]);
    expect(button(target, "Load more")).toBeUndefined();

    const link = target.querySelector<HTMLAnchorElement>(".kv-dash-csv")!;
    expect(link.getAttribute("href")).toBe("http://kv.test/api/audit.csv?actor=key%3Aadmin&surveyId=s&from=2026-03-01&to=2026-03-31T23%3A59%3A59.999Z");
    // With a bearer key the link can't send it, so the file is fetched with the headers.
    const created: Blob[] = [];
    URL.createObjectURL = ((b: Blob) => (created.push(b), "blob:x")) as typeof URL.createObjectURL;
    URL.revokeObjectURL = () => {};
    link.click();
    await settle();
    expect(last().url.pathname).toBe("/api/audit.csv");
    expect(last().headers.authorization).toBe("Bearer k");
    expect(await created[0]!.text()).toContain("seq,at");
    unmount(view);
  });
});

describe("response detail", () => {
  const survey = {
    schemaVersion: 1,
    id: "pii",
    title: "P",
    pages: [{ id: "p", elements: [{ id: "email", type: "text", title: "Email", pii: true }, { id: "ok", type: "text", title: "Comment" }] }],
  };
  const responses = [
    { id: "r1", surveyId: "pii", createdAt: "2026-01-05T10:00:00.000Z", answers: { email: "[redacted]", ok: "fine" } },
    { id: "r2", surveyId: "pii", createdAt: "2026-01-06T10:00:00.000Z", answers: { email: "[redacted]", ok: "good" } },
  ];
  const openTable = (target: Element) => {
    button(target, "Table").click();
    flushSync();
  };

  it("marks masked answers and deletes a response after a second press", async () => {
    const server = fakeServer({ "DELETE /surveys/pii/responses/r2": () => new Response(null, { status: 204 }) });
    const target = document.createElement("div");
    const view = mount(SurveyResults, { target, props: { survey: survey as never, responses: responses as never, api: server.api } });
    flushSync();
    openTable(target);
    expect(target.querySelectorAll(".kv-dash-table .kv-dash-redacted")).toHaveLength(2);
    expect(target.querySelector(".kv-dash-table tbody")!.textContent).not.toContain("[redacted]");

    target.querySelector<HTMLButtonElement>('[aria-label="Open response r2"]')!.click();
    flushSync();
    expect(target.querySelector(".kv-dash-detail dd .kv-dash-redacted")!.textContent).toBe("redacted");
    const del = target.querySelector<HTMLButtonElement>(".kv-dash-delete")!;
    del.click();
    flushSync();
    expect(server.calls).toHaveLength(0);
    expect(del.textContent).toBe("Really delete?");
    del.click();
    await settle();
    expect(server.calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual(["DELETE /api/surveys/pii/responses/r2"]);
    expect(target.querySelector(".kv-dash-detail")).toBeNull();
    expect(target.textContent).toContain("1 responses");
    unmount(view);
  });

  it("keeps the response and shows why when the server refuses", async () => {
    const server = fakeServer({ "DELETE /surveys/pii/responses/r2": () => new Response(JSON.stringify({ error: "Needs response:delete" }), { status: 403 }) });
    const target = document.createElement("div");
    const view = mount(SurveyResults, { target, props: { survey: survey as never, responses: responses as never, api: server.api } });
    flushSync();
    openTable(target);
    target.querySelector<HTMLButtonElement>('[aria-label="Open response r2"]')!.click();
    flushSync();
    target.querySelector<HTMLButtonElement>(".kv-dash-delete")!.click();
    flushSync();
    target.querySelector<HTMLButtonElement>(".kv-dash-delete")!.click();
    await settle();
    expect(target.querySelector(".kv-dash-detail .kv-dash-error")!.textContent).toBe("Could not delete: Not allowed (403): Needs response:delete.");
    expect(target.textContent).toContain("2 responses");
    unmount(view);
  });

  it("has no Delete button without an API", () => {
    const target = document.createElement("div");
    const view = mount(SurveyResults, { target, props: { survey: survey as never, responses: responses as never } });
    flushSync();
    openTable(target);
    target.querySelector<HTMLButtonElement>(".kv-dash-open")!.click();
    flushSync();
    expect(target.querySelector(".kv-dash-detail")).not.toBeNull();
    expect(target.querySelector(".kv-dash-delete")).toBeNull();
    unmount(view);
  });
});
