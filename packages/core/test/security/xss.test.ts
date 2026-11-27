// @vitest-environment happy-dom
/**
 * An XSS corpus run through every place the renderer puts survey text or answers: titles, descriptions, choice
 * labels, matrix rows, content blocks (Markdown and HTML without a sanitizer), images, answer piping, variables,
 * the completed and closed messages, quiz feedback and validation messages. Nothing in it may become markup.
 */
import { describe, expect, it } from "vitest";
import { createSurvey, mountSurvey, renderSurvey, type SurveyInput } from "../../src/index.js";

const CORPUS = [
  "<script>window.__xss=1</script>",
  "<img src=x onerror=window.__xss=1>",
  "<svg onload=window.__xss=1>",
  '"><iframe src="javascript:window.__xss=1"></iframe>',
  "javascript:window.__xss=1",
  "[click](javascript:window.__xss=1)",
  "[click](JaVaScRiPt:alert(1))",
  "![x](javascript:alert(1))",
  "<a href=\"data:text/html,<script>alert(1)</script>\">x</a>",
  "{{constructor.constructor('window.__xss=1')()}}",
  "${window.__xss=1}",
  "<style>@import 'javascript:alert(1)'</style>",
  "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  "<script>alert(1)</script>",
  "<details open ontoggle=window.__xss=1>",
  "<body onload=alert(1)>",
  "<input autofocus onfocus=alert(1)>",
];

/** Markup that must never come out of survey text. */
function assertInert(root: Element, where: string) {
  expect(root.querySelectorAll("script, iframe, object, embed, style, svg, math, base, meta, link, details, body").length, where).toBe(0);
  for (const el of root.querySelectorAll("*")) {
    for (const attr of el.getAttributeNames()) {
      expect(attr.startsWith("on"), `${where}: <${el.tagName.toLowerCase()} ${attr}>`).toBe(false);
      const v = el.getAttribute(attr) ?? "";
      if (["href", "src", "action", "formaction", "xlink:href"].includes(attr)) {
        expect(/^\s*(javascript|vbscript|data:text\/html)/i.test(v), `${where}: ${attr}=${v}`).toBe(false);
      }
    }
  }
  expect((globalThis as { __xss?: number }).__xss, where).toBeUndefined();
}

const survey = (p: string): SurveyInput => ({
  schemaVersion: 1,
  id: "xss",
  title: p,
  description: p,
  completedText: `Thanks {name} ${p}`,
  variables: [{ name: "shout", expr: "{name} + '!'" }],
  settings: { quiz: { showCorrect: true } },
  pages: [
    {
      id: "p1",
      title: p,
      elements: [
        { id: "name", type: "text", title: p, description: p, validators: [{ type: "length", max: 3, message: p }] },
        { id: "piped", type: "text", title: `Hello {name} and {shout}` },
        { id: "pick", type: "single-choice", title: p, choices: [{ value: "a", label: p }], correctAnswer: "a", feedback: { wrong: p, correct: p } },
        { id: "grid", type: "matrix", title: p, rows: [{ value: "r", label: p }], columns: [{ value: "c", label: p }] },
        { id: "md", type: "content", markdown: `# ${p}\n\n${p} **${p}** [link](${p}) ${p}` },
        { id: "raw", type: "content", markdown: "x", html: p },
        { id: "pic", type: "image", src: "https://example.com/a.png", alt: p },
      ],
    },
  ],
});

describe("XSS corpus", () => {
  it.each(CORPUS)("renders %s as text everywhere", async (payload) => {
    const target = document.createElement("div");
    document.body.append(target);
    const { model, destroy } = mountSurvey(target, { survey: survey(payload) });
    assertInert(target, "first render");
    // Piping an answer into titles, and the variable built from it.
    model.setValue("name", payload);
    assertInert(target, "piped answer");
    expect(target.textContent).toContain("Hello");
    // A validation message from the survey, after a failed submit.
    target.querySelector("form")!.requestSubmit();
    assertInert(target, "validation messages");
    model.setValue("name", "ok");
    model.setValue("pick", "a");
    await model.complete();
    assertInert(target, "completed and quiz feedback");
    destroy();
    // The closed message.
    const closed = document.createElement("div");
    mountSurvey(closed, { survey: { ...survey(payload), settings: { closesAt: "2000-01-01T00:00:00Z", closedMessage: payload } } });
    assertInert(closed, "closed message");
    expect(closed.querySelector(".kv-closed")?.textContent?.length).toBeGreaterThan(0);
  });

  it("keeps HTML blocks out without a sanitizer, and passes them through the host's sanitizer", () => {
    const target = document.createElement("div");
    const input: SurveyInput = { schemaVersion: 1, id: "h", title: "H", pages: [{ id: "p", elements: [{ id: "raw", type: "content", markdown: "Fallback", html: "<b>bold</b><script>window.__xss=1</script>" }] }] };
    renderSurvey(target, createSurvey({ survey: input }));
    assertInert(target, "no sanitizer");
    expect(target.textContent).toContain("Fallback");
    const sanitized = document.createElement("div");
    renderSurvey(sanitized, createSurvey({ survey: input }), { sanitizeHtml: (html) => html.replace(/<script[\s\S]*?<\/script>/g, "") });
    assertInert(sanitized, "with sanitizer");
    expect(sanitized.querySelector("b")?.textContent).toBe("bold");
  });
});
