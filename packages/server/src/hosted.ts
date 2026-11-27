/**
 * The hosted survey page (`/s/{id}`) and the embed script (`/s/embed.js`).
 * The page runs the `kvesto` browser bundle with no inline script, under a
 * strict Content Security Policy, and tells the page around it (when it is in
 * an iframe) its height and when the survey is done.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let assets: { js: string; css: string } | null = null;
/** The browser bundle and stylesheet, read once from the `kvesto` package. */
export function hostedAssets(): { js: string; css: string } {
  assets ??= {
    js: readFileSync(require.resolve("kvesto/browser"), "utf8"),
    css: readFileSync(require.resolve("kvesto/styles.css"), "utf8"),
  };
  return assets;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** No inline script and no other origins: only this server's own files, and images from https. */
export const HOSTED_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; " +
  "connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors *";

/** The page for one survey. `id` is a validated survey id, so it is safe in an attribute. */
export function hostedPage(id: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<link rel="stylesheet" href="assets/kvesto.css">
<link rel="stylesheet" href="assets/page.css">
</head>
<body data-survey="${id}">
<main id="kvesto"></main>
<script src="assets/kvesto.js"></script>
<script src="assets/run.js"></script>
</body>
</html>
`;
}

export const PAGE_CSS = `body { margin: 0; padding: 1rem; font: 16px/1.5 system-ui, sans-serif; }
.kv-survey { margin: 0 auto; }
`;

/**
 * Starts the survey on the hosted page: loads it from this API, takes the
 * locale (?lang=), layout (?layout=), theme (?theme=) and declared hidden
 * fields from the URL, and talks to the embedding page.
 */
export const RUN_JS = `(function () {
  var K = window.Kvesto;
  var id = document.body.dataset.survey;
  var base = new URL("..", location.href).href.replace(/\\/$/, "");
  var params = new URLSearchParams(location.search);
  var storage = K.httpStorage({ baseUrl: base });
  var post = function (message) { if (window.parent !== window) window.parent.postMessage(message, "*"); };
  storage.loadSurvey(id).then(function (survey) {
    if (!survey) return;
    document.title = typeof survey.title === "string" ? survey.title : document.title;
    var layout = params.get("layout");
    var theme = params.get("theme");
    K.mountSurvey(document.getElementById("kvesto"), {
      survey: survey,
      storage: storage,
      locale: K.detectLocale(survey, { url: location.href, languages: navigator.languages }),
      hiddenFromUrl: location.href,
      layout: layout === "question" || layout === "page" ? layout : undefined,
      theme: theme || undefined,
      onComplete: function () { post({ type: "kvesto:complete", surveyId: id }); }
    });
    document.documentElement.lang = K.detectLocale(survey, { url: location.href, languages: navigator.languages });
    // Only the height and the survey id ever leave the frame, never answers.
    var last = 0;
    new ResizeObserver(function () {
      // The content's height, not the frame's: scrollHeight never drops below the viewport.
      var h = Math.ceil(document.body.getBoundingClientRect().height);
      if (h !== last) { last = h; post({ type: "kvesto:resize", surveyId: id, height: h }); }
    }).observe(document.body);
  });
})();
`;

/**
 * The embed script. Put \`<div data-kvesto-survey="feedback"></div>\` and
 * \`<script src="https://your-server/api/s/embed.js" async></script>\` on any page;
 * \`data-mode\` is "inline" (default), "popup" (a button that opens it) or
 * "slide-in" (a panel in the corner). \`window.KvestoEmbed\` does the same from script.
 */
export const EMBED_JS = `(function () {
  var script = document.currentScript;
  var base = new URL("..", script.src).href.replace(/\\/$/, "");
  var origin = new URL(base).origin;
  var frames = [];

  function frame(id, opts) {
    var f = document.createElement("iframe");
    var q = new URLSearchParams();
    ["lang", "layout", "theme"].forEach(function (k) { if (opts[k]) q.set(k, opts[k]); });
    Object.keys(opts.hidden || {}).forEach(function (k) { q.set(k, opts.hidden[k]); });
    f.src = base + "/s/" + encodeURIComponent(id) + (q.toString() ? "?" + q : "");
    f.title = opts.title || "Survey";
    if (opts.lazy) f.loading = "lazy";
    f.style.cssText = "width:100%;border:0;height:" + (opts.height || 480) + "px;display:block";
    frames.push({ el: f, id: id, opts: opts });
    return f;
  }

  // Messages are trusted only from a frame this script made, on the server's origin.
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || typeof e.data.type !== "string") return;
    frames.forEach(function (fr) {
      if (e.source !== fr.el.contentWindow) return;
      if (e.data.type === "kvesto:resize" && typeof e.data.height === "number" && !fr.opts.height) {
        fr.el.style.height = Math.min(Math.max(e.data.height, 120), 10000) + "px";
      }
      if (e.data.type === "kvesto:complete") {
        fr.el.dispatchEvent(new CustomEvent("kvesto-complete", { bubbles: true, detail: { surveyId: fr.id } }));
        if (fr.opts.onComplete) fr.opts.onComplete(fr.id);
      }
    });
  });

  function inline(el, id, opts) {
    opts = Object.assign({ lazy: true }, opts || {});
    var f = frame(id, opts);
    el.replaceChildren(f);
    return f;
  }

  function overlay(id, opts, slide) {
    opts = opts || {};
    var box = document.createElement("div");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", slide ? "false" : "true");
    box.setAttribute("aria-label", opts.title || "Survey");
    box.style.cssText = slide
      ? "position:fixed;right:1rem;bottom:1rem;width:min(26rem,calc(100vw - 2rem));max-height:80vh;overflow:auto;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.25);border-radius:.75rem;z-index:2147483000"
      : "position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;z-index:2147483000";
    var panel = slide ? box : document.createElement("div");
    if (!slide) {
      panel.style.cssText = "background:#fff;border-radius:.75rem;width:min(40rem,calc(100vw - 2rem));max-height:90vh;overflow:auto";
      box.appendChild(panel);
      box.addEventListener("click", function (e) { if (e.target === box) close(); });
    }
    var shut = document.createElement("button");
    shut.type = "button";
    shut.textContent = "×";
    shut.setAttribute("aria-label", opts.closeLabel || "Close");
    shut.style.cssText = "float:right;font-size:1.5rem;line-height:1;background:none;border:0;cursor:pointer;padding:.25rem .6rem";
    function close() { box.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    shut.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    panel.appendChild(shut);
    panel.appendChild(frame(id, opts));
    document.body.appendChild(box);
    shut.focus();
    return { close: close };
  }

  function popupButton(el, id, opts) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = (opts && opts.label) || el.textContent.trim() || "Take the survey";
    b.addEventListener("click", function () { overlay(id, opts, false); });
    el.replaceChildren(b);
  }

  window.KvestoEmbed = {
    inline: inline,
    popup: function (id, opts) { return overlay(id, opts, false); },
    slideIn: function (id, opts) { return overlay(id, opts, true); }
  };

  document.querySelectorAll("[data-kvesto-survey]").forEach(function (el) {
    var id = el.getAttribute("data-kvesto-survey");
    var d = el.dataset;
    var opts = { lang: d.lang, layout: d.layout, theme: d.theme, title: d.title, label: d.label, height: d.height ? Number(d.height) : undefined };
    if (d.mode === "popup") popupButton(el, id, opts);
    else if (d.mode === "slide-in") window.KvestoEmbed.slideIn(id, opts);
    else inline(el, id, opts);
  });
})();
`;
