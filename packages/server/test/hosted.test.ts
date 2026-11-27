import { describe, expect, it } from "vitest";
import { createApp, createSqliteDb, drizzleRepository, openAccess } from "../src/index.js";

const survey = { schemaVersion: 1, id: "hosted", title: "Hosted <b>survey</b>", pages: [{ id: "p", elements: [{ id: "a", type: "text", title: "A" }] }] };

describe("hosted page and embed script", () => {
  const app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: openAccess });
  const ready = app.request("/surveys", { method: "POST", body: JSON.stringify(survey), headers: { "content-type": "application/json" } });

  it("serves the survey page with a strict CSP and no inline script", async () => {
    await ready;
    const res = await app.request("/s/hosted");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors *");
    expect(csp).not.toContain("unsafe-eval");
    const html = await res.text();
    expect(html).toContain("<title>Hosted &#60;b&#62;survey&#60;/b&#62;</title>");
    expect(html).toContain('<body data-survey="hosted">');
    expect(html.match(/<script(?![^>]*\bsrc=)[^>]*>/g)).toBeNull();
    expect((await app.request("/s/nope")).status).toBe(404);
  });

  it("serves the embed script and the page's files", async () => {
    const embed = await app.request("/s/embed.js");
    expect(embed.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await embed.text()).toContain("data-kvesto-survey");
    expect(await (await app.request("/s/assets/kvesto.js")).text()).toContain("mountSurvey");
    expect((await app.request("/s/assets/kvesto.css")).headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(await (await app.request("/s/assets/run.js")).text()).toContain("kvesto:resize");
    expect((await app.request("/s/assets/secret.txt")).status).toBe(400);
  });
});
