// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { SurveySchema, createSurvey, migrateSurvey, parseMarkdown, renderSurvey, validateAnswers } from "../src/index.js";

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "content",
  title: "Content",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "intro", type: "content", markdown: "Welcome, **dear** *guest*.\n\n- one\n- [docs](https://example.com)\n\n1. first\n2. second" },
        { id: "name", type: "text", title: "Name" },
        { id: "hello", type: "content", markdown: "Hi {name}!", visibleIf: { question: "name", op: "notEmpty" } },
        { id: "logo", type: "image", src: "https://example.com/logo.png", alt: "Logo for {name}", width: 120 },
        { id: "raw", type: "content", markdown: "Fallback text", html: "<b>bold</b><img src=x onerror=alert(1)>" },
      ],
    },
  ],
});

const render = (options = {}) => {
  const target = document.createElement("div");
  const model = createSurvey({ survey });
  renderSurvey(target, model, options);
  return { target, model };
};

describe("parseMarkdown", () => {
  it("parses paragraphs, lists, emphasis and links", () => {
    expect(parseMarkdown("a **b** _c_ \\*d\\*\n\n- x\n- y\n\n1. z")).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "a " }, { type: "strong", children: [{ type: "text", text: "b" }] }, { type: "text", text: " " }, { type: "em", children: [{ type: "text", text: "c" }] }, { type: "text", text: " *d*" }] },
      { type: "list", ordered: false, items: [[{ type: "text", text: "x" }], [{ type: "text", text: "y" }]] },
      { type: "list", ordered: true, items: [[{ type: "text", text: "z" }]] },
    ]);
  });

  it("refuses unsafe link targets", () => {
    expect(parseMarkdown("[x](javascript:alert(1))")).toEqual([{ type: "paragraph", children: [{ type: "text", text: "[x](javascript:alert(1))" }] }]);
    expect(parseMarkdown("[x](JavaScript:alert(1))")[0]).toMatchObject({ children: [{ type: "text" }] });
    expect(parseMarkdown("[x](/relative)")[0]).toMatchObject({ children: [{ type: "link", href: "/relative" }] });
  });
});

describe("content blocks and images", () => {
  it("render Markdown as DOM, not HTML", () => {
    const { target } = render();
    const intro = target.querySelector('[data-block="intro"]')!;
    expect(intro.querySelector("strong")!.textContent).toBe("dear");
    expect(intro.querySelector("em")!.textContent).toBe("guest");
    expect(intro.querySelectorAll("ul li")).toHaveLength(2);
    expect(intro.querySelectorAll("ol li")).toHaveLength(2);
    const link = intro.querySelector("a")!;
    expect([link.getAttribute("href"), link.getAttribute("rel")]).toEqual(["https://example.com", "noopener noreferrer"]);
  });

  it("escape script and event-handler injection in text and piped answers", () => {
    const evil = '<script>alert(1)</script><img src=x onerror="alert(2)">';
    const target = document.createElement("div");
    const doc = migrateSurvey({
      schemaVersion: 1,
      id: "evil",
      title: "Evil",
      pages: [{ id: "p1", elements: [{ id: "name", type: "text", title: "Name" }, { id: "c", type: "content", markdown: `${evil} {name}` }] }],
    });
    const model = createSurvey({ survey: doc });
    renderSurvey(target, model);
    model.setValue("name", evil);
    const block = target.querySelector('[data-block="c"]')!;
    expect(block.querySelector("script, img")).toBeNull();
    expect(block.textContent).toBe(`${evil} ${evil}`);
  });

  it("ignore raw HTML unless the host sanitises it", () => {
    expect(render().target.querySelector('[data-block="raw"]')!.innerHTML).toBe("<p>Fallback text</p>");
    const sanitizeHtml = (html: string) => html.replace(/<img[^>]*>/g, "");
    expect(render({ sanitizeHtml }).target.querySelector('[data-block="raw"]')!.innerHTML).toBe("<b>bold</b>");
  });

  it("follow visibleIf and pipe answers, including image alt text", () => {
    const { target, model } = render();
    const hello = target.querySelector<HTMLElement>('[data-block="hello"]')!;
    expect(hello.hidden).toBe(true);
    model.setValue("name", "Ana");
    expect(hello.hidden).toBe(false);
    expect(hello.textContent).toBe("Hi Ana!");
    const img = target.querySelector<HTMLImageElement>('[data-block="logo"] img')!;
    expect([img.getAttribute("src"), img.alt, img.width]).toEqual(["https://example.com/logo.png", "Logo for Ana", 120]);
  });

  it("are never answered", () => {
    expect(validateAnswers(survey, { intro: "x" }).issues).toEqual([{ questionId: "intro", message: "Unknown question", path: ["intro"] }]);
    expect(createSurvey({ survey }).questions.map((q) => q.id)).toEqual(["name"]);
  });

  it("refuse unsafe image sources", () => {
    const parse = (src: string) =>
      SurveySchema.safeParse({ schemaVersion: 1, id: "s", title: "S", pages: [{ id: "p", elements: [{ id: "i", type: "image", src, alt: "" }] }] }).success;
    expect(["https://a.b/c.png", "/img/a.png", "img/a.png", "data:image/png;base64,AAAA"].map(parse)).toEqual([true, true, true, true]);
    expect(["javascript:alert(1)", "data:text/html,<script>", "vbscript:x"].map(parse)).toEqual([false, false, false]);
  });
});
