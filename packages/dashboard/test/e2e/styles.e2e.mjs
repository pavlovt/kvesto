// The dashboard's Tailwind CSS in a real browser: it must stay inside the dashboard, and a host page's own
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

// Host markup outside the dashboard, with class names the dashboard also uses.
const host = `<h1>Host</h1><p class="kv-dash-muted">Text <a href="#">link</a></p><button class="kv-dash-link">Host button</button>
<table class="kv-dash-list"><tr><th>Head</th><td class="kv-dash-num">1</td></tr></table><input value="x"><select><option>a</option></select>`;

const survey = {
  schemaVersion: 1, id: "s", title: "Feedback",
  pages: [{ id: "p", elements: [{ id: "role", type: "single-choice", title: "Role", choices: [{ value: "dev", label: "Developer" }, { value: "pm", label: "Manager" }] }] }],
};
const responses = [1, 2, 3].map((i) => ({ id: `r${i}`, surveyId: "s", createdAt: `2026-01-0${i}T10:00:00Z`, answers: { role: i % 2 ? "dev" : "pm" } }));

const page = (head) => `<!doctype html><meta charset="utf-8"><head>${head}</head>
<body><div id="host">${host}</div><div id="app"></div>
<script>
  window.mountIt = async () => {
    const { mountDashboard } = await import("/dashboard.js");
    const storage = {
      listSurveys: async () => [{ id: "s", title: "Feedback", responseCount: 3 }],
      loadSurvey: async () => (${JSON.stringify(survey)}),
      listResponses: async () => (${JSON.stringify(responses)}),
    };
    mountDashboard(document.getElementById("app"), { storage, surveyId: "s" });
  };
</script></body>`;

const pages = {
  "/plain": page(""),
  "/preflight": page(`<style id="preflight"></style>`),
  "/reset": page(`<style>button, input, select, h1, h2, table, th, td, p { padding: 0; margin: 0; border: 0; background: red; font: 10px serif; text-align: center; }</style>`),
};

let server;
let browser;
let base;

before(async () => {
  const js = await readFile(bundle);
  const reset = await readFile(preflight, "utf8");
  server = createServer((req, res) => {
    if (req.url === "/dashboard.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(js);
    // Preflight the way a Tailwind site has it: in the base layer.
    const html = (pages[req.url] ?? "").replace('<style id="preflight"></style>', `<style>@layer base { ${reset} }</style>`);
    res.writeHead(200, { "content-type": "text/html" }).end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function open(path) {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await tab.goto(base + path);
  return tab;
}
const mount = async (tab) => {
  await tab.evaluate(() => window.mountIt());
  await tab.waitForSelector(".kv-dash-card");
};

// Computed styles (not layout) of every element in a subtree.
const styles = (tab, selector) =>
  tab.evaluate((selector) => [...document.querySelector(selector).querySelectorAll("*")].map((e) => {
    const cs = getComputedStyle(e);
    return e.tagName + " " + ["display", "color", "background-color", "font-family", "font-size", "font-weight", "margin", "padding",
      "border", "border-collapse", "text-align", "text-decoration", "cursor", "min-width", "font-variant-numeric"]
      .map((p) => p + "=" + cs.getPropertyValue(p)).join(";");
  }), selector);

test("the dashboard's CSS changes nothing outside the dashboard", async () => {
  const tab = await open("/plain");
  const before = await styles(tab, "#host");
  await mount(tab);
  assert.equal(await tab.evaluate(() => document.querySelectorAll("#kv-dashboard-styles").length), 1);
  assert.deepEqual(await styles(tab, "#host"), before);
  await tab.close();
});

test("the standalone bundle carries the dashboard's Tailwind styles", async () => {
  const tab = await open("/plain");
  await mount(tab);
  const s = await tab.evaluate(() => {
    const root = document.querySelector(".kv-dashboard");
    const cs = (el) => getComputedStyle(el);
    return { root: cs(root).position, card: cs(root.querySelector(".kv-dash-card")).borderRadius, fill: cs(root.querySelector(".kv-dash-bar-fill")).backgroundColor };
  });
  assert.deepEqual(s, { root: "relative", card: "8px", fill: "rgb(37, 99, 235)" });
  await tab.close();
});

// Properties the dashboard's utilities set on some of its elements. (Elements left to the browser's defaults,
// such as the export buttons' border, follow the host's reset, as they did before Tailwind.)
const owned = {
  ".kv-dash-card": ["padding", "border", "background-color", "border-radius", "margin-bottom"],
  ".kv-dash-card h2": ["margin", "font-size"],
  ".kv-dash-results h1": ["margin", "font-size"],
  ".kv-dash-views button": ["padding", "border", "background-color", "font-size", "cursor"],
  ".kv-dash-filters": ["display", "margin", "font-size"],
  ".kv-dash-bar-row": ["display", "margin"],
  ".kv-dash-bar": ["height", "border-radius", "background-color"],
  ".kv-dash-num": ["text-align", "font-variant-numeric"],
  ".kv-dash-back": ["padding", "border-style", "background-color", "color", "cursor"],
};

for (const reset of ["/preflight", "/reset"]) {
  test(`a host reset (${reset.slice(1)}) doesn't override the dashboard's utilities`, async () => {
    const read = async (path) => {
      const tab = await open(path);
      await mount(tab);
      const out = await tab.evaluate((owned) => {
        const root = document.querySelector(".kv-dashboard");
        return Object.entries(owned).map(([sel, props]) => {
          const cs = getComputedStyle(root.querySelector(sel));
          return `${sel}: ${props.map((p) => p + "=" + cs.getPropertyValue(p)).join("; ")}`;
        });
      }, owned);
      await tab.close();
      return out;
    };
    assert.deepEqual(await read(reset), await read("/plain"));
  });
}
