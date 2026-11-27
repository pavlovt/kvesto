import { describe, expect, it, vi } from "vitest";
import { createApp, createSqliteDb, drizzleRepository, isRespondentRoute, openAccess, tokenAuth, verifyAuditChain } from "../src/index.js";

const survey = { schemaVersion: 1, id: "aud", title: "Audit", pages: [{ id: "p", elements: [{ id: "q", type: "text", title: "Q" }] }] };

function setup(extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const db = createSqliteDb(":memory:");
  const repository = drizzleRepository(db);
  const app = createApp({ repository, authorize: openAccess, ...extra });
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(`http://kvesto.test${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers: { "content-type": "application/json", ...headers } });
  return { app, db, repository, send };
}

describe("audit log", () => {
  it("writes exactly one entry for every admin route, and none for respondent routes", async () => {
    const { app, send, repository } = setup();
    await send("POST", "/surveys", survey);
    const doc = await (await app.request("/openapi.json")).json();
    const fill = (path: string) =>
      path.replace("{id}", "aud").replace("{responseId}", "r1").replace("{fileId}", "f1").replace("{webhookId}", "w1").replace("{tokenId}", "t1").replace("{file}", "page.css");
    const admin: [string, string][] = [];
    for (const [path, ops] of Object.entries(doc.paths as Record<string, Record<string, unknown>>)) {
      for (const method of Object.keys(ops)) {
        const real = fill(path);
        if (!isRespondentRoute(method.toUpperCase(), real)) admin.push([method.toUpperCase(), real]);
      }
    }
    // Every admin route in the OpenAPI document, including the audit routes themselves.
    expect(admin.length).toBeGreaterThan(15);
    const before = (await repository.listAudit({ limit: 1000 })).length;
    for (const [method, path] of admin) {
      await send(method, path, method === "GET" || method === "DELETE" ? undefined : {});
      await app.audit.flush();
      const entries = await repository.listAudit({ after: 0, limit: 1000 });
      const mine = entries.slice(before).filter((e) => e.method === method && e.path === path);
      expect([method, path, mine.length]).toEqual([method, path, 1]);
    }
    const total = (await repository.listAudit({ limit: 1000 })).length;
    expect(total - before).toBe(admin.length);
    // Respondent routes write nothing.
    await send("GET", "/surveys/aud");
    await send("POST", "/surveys/aud/responses", { answers: { q: "x" } });
    await app.audit.flush();
    expect((await repository.listAudit({ limit: 1000 })).length).toBe(total);
    expect(await app.audit.verify()).toEqual({ ok: true });
  });

  it("records the actor, survey, status, address and request id, and calls onAudit", async () => {
    const onAudit = vi.fn();
    const repository = drizzleRepository(createSqliteDb(":memory:"));
    const app = createApp({ repository, authorize: tokenAuth({ store: repository, adminKeys: ["root"] }), audit: { onAudit } });
    await app.request("http://kvesto.test/surveys", { method: "POST", body: JSON.stringify(survey), headers: { "content-type": "application/json", authorization: "Bearer root" } });
    await app.request("http://kvesto.test/surveys/aud/responses", { headers: { authorization: "Bearer nope", "x-request-id": "req-42" } });
    await app.audit.flush();
    const [created, refused] = await repository.listAudit({ limit: 10 });
    expect(created).toMatchObject({ seq: 1, actor: "admin-key", action: "survey:write", surveyId: null, status: 201 });
    expect(refused).toMatchObject({ seq: 2, actor: "unknown", action: "response:read", surveyId: "aud", status: 401, requestId: "req-42" });
    expect(onAudit).toHaveBeenCalledTimes(2);
    expect(onAudit.mock.calls[1]![0]).toMatchObject({ action: "response:read", hash: refused!.hash });
  });

  it("filters, pages and exports", async () => {
    const { app, send } = setup();
    await send("POST", "/surveys", survey);
    await send("GET", "/surveys");
    await send("GET", "/surveys/aud/responses");
    await app.audit.flush();
    const byAction = await (await send("GET", "/audit?action=survey:list")).json();
    expect(byAction.items.map((e: { action: string }) => e.action)).toEqual(["survey:list"]);
    const page = await (await send("GET", "/audit?limit=1")).json();
    expect(page.nextAfter).toBe(1);
    const next = await (await send("GET", `/audit?limit=1&after=${page.nextAfter}`)).json();
    expect(next.items[0].seq).toBe(2);
    const csv = await (await send("GET", "/audit.csv?surveyId=aud")).text();
    expect(csv.split("\r\n")[0]).toBe("seq,at,actor,action,method,path,surveyId,status,ip,requestId,hash");
    expect(csv).toContain("response:read");
    expect(csv).not.toContain("survey:list");
  });

  it("detects a changed or deleted entry", async () => {
    const { app, db, send } = setup();
    await send("POST", "/surveys", survey);
    await send("GET", "/surveys");
    await send("GET", "/surveys/aud/responses");
    await app.audit.flush();
    expect(await app.audit.verify()).toEqual({ ok: true });
    db.$client.prepare("update audit_log set actor = 'someone-else' where seq = 2").run();
    expect(await app.audit.verify()).toEqual({ ok: false, seq: 2 });
    db.$client.prepare("update audit_log set actor = 'unknown' where seq = 2").run();
    expect(await app.audit.verify()).toEqual({ ok: true });
    db.$client.prepare("delete from audit_log where seq = 2").run();
    expect(await app.audit.verify()).toEqual({ ok: false, seq: 3 });
    expect(verifyAuditChain([])).toEqual({ ok: true });
  });

  it("can be turned off", async () => {
    const { app, send, repository } = setup({ audit: false });
    await send("GET", "/surveys");
    await app.audit.flush();
    expect(await repository.listAudit({ limit: 10 })).toEqual([]);
  });
});
