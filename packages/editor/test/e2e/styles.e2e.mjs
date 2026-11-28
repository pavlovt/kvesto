// The editor's Tailwind CSS in a real browser: it must stay inside the editor, and a host page's own
// reset (Tailwind's Preflight, or plain element rules) must not override it. Run with `pnpm test:e2e`
// after `pnpm build` (it loads the prebuilt standalone bundle). Needs Playwright's Chromium.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { chromium } from "playwright";

const bundle = new URL("../../dist/standalone/index.js", import.meta.url);
const preflight = createRequire(import.meta.url).resolve("tailwindcss/preflight.css");

// Host markup outside the editor, with class names the editor also uses.
const host = `<h1>Host</h1><p class="kv-editor-muted">Text <a href="#">link</a></p>
<button class="kv-editor-primary">Host button</button><input value="x"><select><option>a</option></select>
<ul class="kv-outline-list"><li>One</li></ul><table><tr><td class="kv-translations-key">Cell</td></tr></table>
<h2>Heading</h2><textarea>t</textarea>`;

const page = (head) => `<!doctype html><meta charset="utf-8"><head>${head}</head>
<body><div id="host">${host}</div><div id="app"></div></body>`;

const pages = {
  "/plain": page(""),
  "/preflight": page(`<style id="preflight"></style>`),
  "/reset": page(`<style>button, input, select, textarea, h2 { padding: 0; margin: 0; border: 0; background: red; font: 10px serif; }</style>`),
};

let server;
let browser;
let base;

before(async () => {
  const js = await readFile(bundle);
  const reset = await readFile(preflight, "utf8");
  server = createServer((req, res) => {
    if (req.url === "/editor.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(js);
    const html = pages[req.url] ?? "";
    // Preflight the way a Tailwind site has it: in the base layer.
    res.writeHead(200, { "content-type": "text/html" }).end(html.replace('<style id="preflight"></style>', `<style>@layer base { ${reset} }</style>`));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

const mount = () =>
  `import("/editor.js").then(({ mountEditor }) => mountEditor(document.getElementById("app"), { storage: { saveSurvey: async (s) => s } }))`;

// Computed styles (not layout) of every element in a subtree.
const styles = (selector) =>
  `[...document.querySelector(${JSON.stringify(selector)}).querySelectorAll("*")].map((e) => {
    const cs = getComputedStyle(e);
    return e.tagName + " " + ["display", "color", "background-color", "font-family", "font-size", "font-weight", "line-height",
      "margin", "padding", "border", "border-radius", "list-style-type", "text-decoration", "cursor", "color-scheme"]
      .map((p) => p + "=" + cs.getPropertyValue(p)).join(";");
  })`;

test("the editor's CSS changes nothing outside the editor", async () => {
  const tab = await browser.newPage();
  await tab.goto(`${base}/plain`);
  const before = await tab.evaluate(styles("#host"));
  await tab.evaluate(mount());
  await tab.waitForSelector(".kv-editor");
  assert.equal(await tab.evaluate(() => document.querySelectorAll("#kv-editor-styles").length), 1);
  assert.deepEqual(await tab.evaluate(styles("#host")), before);
  await tab.close();
});

test("the standalone bundle carries the editor's Tailwind styles", async () => {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.goto(`${base}/plain`);
  await tab.evaluate(mount());
  await tab.waitForSelector(".kv-editor");
  const s = await tab.evaluate(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(".kv-editor").parentElement.querySelector(sel));
    return { root: cs(".kv-editor").display, pane: cs(".kv-editor-pane").borderRadius, save: cs(".kv-editor-primary").backgroundColor };
  });
  assert.deepEqual(s, { root: "grid", pane: "8px", save: "rgb(37, 99, 235)" });
  await tab.close();
});

// Properties the editor's utilities set on some of its elements. (Elements left to the browser's defaults,
// such as the palette buttons' border, follow the host's reset, as they did before Tailwind.)
const owned = {
  ".kv-editor-pane": ["padding", "border", "background-color", "border-radius"],
  ".kv-editor-primary": ["padding", "border-style", "background-color", "color", "font-size"],
  ".kv-editor-tabs button": ["padding", "border", "background-color"],
  ".kv-editor-palette button": ["padding", "font-size", "cursor"],
  ".kv-editor-pane h2": ["margin", "font-size"],
  ".kv-outline-select": ["padding", "border", "background-color"],
  ".kv-outline-list": ["padding", "margin", "list-style-type"],
  ".kv-props input:not([type=checkbox])": ["padding", "font-size"],
  ".kv-props label": ["display", "font-size"],
};

for (const reset of ["/preflight", "/reset"]) {
  test(`a host reset (${reset.slice(1)}) doesn't override the editor's utilities`, async () => {
    const read = async (path) => {
      const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await tab.goto(base + path);
      await tab.evaluate(mount());
      await tab.waitForSelector(".kv-editor");
      const out = await tab.evaluate((owned) =>
        Object.entries(owned).map(([sel, props]) => {
          const cs = getComputedStyle(document.querySelector(".kv-editor").querySelector(sel));
          return `${sel}: ${props.map((p) => p + "=" + cs.getPropertyValue(p)).join("; ")}`;
        }),
      owned);
      await tab.close();
      return out;
    };
    assert.deepEqual(await read(reset), await read("/plain"));
  });
}
