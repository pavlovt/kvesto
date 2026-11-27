// Pointer drag and drop in a real browser. Run with `pnpm test:e2e` after `pnpm build`
// (it loads the prebuilt standalone bundle). Needs Playwright's Chromium.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";

const bundle = new URL("../../dist/standalone/index.js", import.meta.url);

const survey = {
  schemaVersion: 1,
  id: "s",
  title: "S",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "name", type: "text", title: "Name" },
        { id: "email", type: "text", title: "Email" },
        { id: "box", type: "panel", title: "Box", elements: [{ id: "inner", type: "boolean", title: "Inner" }] },
      ],
    },
  ],
};

const html = `<!doctype html><meta charset="utf-8"><body><div id="app"></div>
<script type="module">
  import { mountEditor } from "/editor.js";
  window.changes = [];
  mountEditor(document.getElementById("app"), {
    survey: ${JSON.stringify(survey)},
    preview: false,
    onchange: (s) => window.changes.push(s),
  });
</script>`;

let server;
let browser;
let base;

before(async () => {
  const js = await readFile(bundle);
  server = createServer((req, res) => {
    if (req.url === "/editor.js") res.writeHead(200, { "content-type": "text/javascript" }).end(js);
    else res.writeHead(200, { "content-type": "text/html" }).end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function open() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(base);
  await page.waitForSelector(".kv-outline");
  return page;
}

const box = async (locator) => {
  const b = await locator.boundingBox();
  assert.ok(b, "element is visible");
  return b;
};

/** Press at the centre of `from`, then move in steps to a point inside `to` (fraction of its height). */
async function drag(page, from, to, fy = 0.5) {
  const a = await box(from);
  const b = await box(to);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * fy, { steps: 8 });
}

const last = (page) => page.evaluate(() => window.changes.at(-1));
const row = (page, id) => page.locator(`[data-outline="${id}"] > .kv-outline-row`);
const handle = (page, id) => page.locator(`[data-outline="${id}"] > .kv-outline-row .kv-outline-handle`);

test("drags a question into a panel, then undoes it", async () => {
  const page = await open();
  // The lower half of a panel's row means "inside the panel, first".
  await drag(page, handle(page, "name"), row(page, "box"), 0.8);
  assert.equal(await page.locator(".kv-editor-ghost").textContent(), "Name");
  assert.ok(await page.locator('[data-outline="inner"].kv-drop-before').count());
  await page.mouse.up();

  let s = await last(page);
  assert.deepEqual(s.pages[0].elements.map((e) => e.id), ["email", "box"]);
  assert.deepEqual(s.pages[0].elements[1].elements.map((e) => e.id), ["name", "inner"]);
  assert.equal(await page.locator(".kv-editor-ghost").count(), 0);

  await page.click(".kv-editor-undo");
  s = await last(page);
  assert.deepEqual(s.pages[0].elements.map((e) => e.id), ["name", "email", "box"]);
  await page.close();
});

test("reorders within a list, and Escape cancels a drag", async () => {
  const page = await open();
  // The upper half of a row means "before it".
  await drag(page, row(page, "email"), row(page, "name"), 0.2);
  await page.mouse.up();
  assert.deepEqual((await last(page)).pages[0].elements.map((e) => e.id), ["email", "name", "box"]);

  const count = await page.evaluate(() => window.changes.length);
  await drag(page, handle(page, "box"), row(page, "email"), 0.2);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.changes.length), count);
  // A panel can't be dropped into itself.
  await drag(page, handle(page, "box"), row(page, "inner"), 0.2);
  assert.equal(await page.locator(".kv-drop-before, .kv-drop-after, .kv-drop-into").count(), 0);
  await page.mouse.up();
  assert.equal(await page.evaluate(() => window.changes.length), count);
  await page.close();
});

test("drags a new question from the palette into a panel; a click still adds", async () => {
  const page = await open();
  const rating = page.locator(".kv-editor-palette button", { hasText: /^rating$/ });
  await drag(page, rating, row(page, "inner"), 0.8);
  await page.mouse.up();
  let s = await last(page);
  assert.deepEqual(s.pages[0].elements[2].elements.map((e) => e.type), ["boolean", "rating"]);

  await page.click('[data-outline="name"] .kv-outline-select');
  const count = await page.evaluate(() => window.changes.length);
  await rating.click();
  await page.waitForFunction((n) => window.changes.length > n, count);
  s = await last(page);
  assert.deepEqual(s.pages[0].elements.map((e) => e.type), ["text", "rating", "text", "panel"]);
  await page.close();
});
