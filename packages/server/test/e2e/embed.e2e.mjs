// A survey embedded with the embed script in a page on another origin, completed in a real browser.
// Run with `pnpm test:e2e` after `pnpm build` (it uses the built server). Needs Playwright's Chromium.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { serve } from "@hono/node-server";
import { chromium } from "playwright";
import { createApp, createSqliteDb, drizzleRepository, openAccess } from "../../dist/index.js";

const survey = {
  schemaVersion: 1,
  id: "embedded",
  title: "Embedded",
  hiddenFields: ["source"],
  pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Your name", required: true }] }],
};

let api;
let host;
let browser;
let apiBase;
let hostBase;
let app;

before(async () => {
  app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: openAccess });
  await app.request("/surveys", { method: "POST", body: JSON.stringify(survey), headers: { "content-type": "application/json" } });
  api = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(s));
  });
  apiBase = `http://127.0.0.1:${api.address().port}`;
  // The embedding page lives on another origin (another port).
  const page = `<!doctype html><meta charset="utf-8"><body><h1>Host page</h1>
<div data-kvesto-survey="embedded" data-title="Feedback"></div>
<script src="${apiBase}/s/embed.js"></script>`;
  const popup = `<!doctype html><meta charset="utf-8"><body><div data-kvesto-survey="embedded" data-mode="popup" data-label="Give feedback"></div>
<script src="${apiBase}/s/embed.js"></script>`;
  host = createServer((req, res) => res.writeHead(200, { "content-type": "text/html" }).end(req.url === "/popup" ? popup : page));
  await new Promise((resolve) => host.listen(0, "127.0.0.1", resolve));
  hostBase = `http://127.0.0.1:${host.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  host?.close();
  api?.close();
});

test("an embedded survey sizes itself, completes and stores the response", async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(hostBase);
  await page.evaluate(() => {
    window.completed = [];
    document.addEventListener("kvesto-complete", (e) => window.completed.push(e.detail.surveyId));
  });
  const frame = page.frameLocator('iframe[title="Feedback"]');
  await frame.getByLabel("Your name").waitFor();
  // The frame told the host page its height.
  await page.waitForFunction(() => document.querySelector("iframe").style.height !== "480px");
  await frame.getByRole("button", { name: "Submit" }).click();
  await frame.getByText("This question is required.").first().waitFor();
  await frame.getByLabel("Your name").fill("Ana");
  await frame.getByRole("button", { name: "Submit" }).click();
  await frame.getByText("Thank you!").waitFor();
  await page.waitForFunction(() => window.completed.length === 1);
  const list = await (await app.request("/surveys/embedded/responses")).json();
  assert.equal(list.total, 1);
  assert.deepEqual(list.items[0].answers, { name: "Ana" });
  assert.deepEqual(errors, []);
  await page.close();
});

test("the popup mode opens the survey in a dialog that Escape closes", async () => {
  const page = await browser.newPage();
  await page.goto(`${hostBase}popup`);
  await page.getByRole("button", { name: "Give feedback" }).click();
  await page.getByRole("dialog").waitFor();
  await page.frameLocator("iframe").getByLabel("Your name").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.close();
});
