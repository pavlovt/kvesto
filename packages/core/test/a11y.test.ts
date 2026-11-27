// @vitest-environment happy-dom
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { createSurvey, migrateSurvey, renderSurvey } from "../src/index.js";

const abc = [{ value: "a", label: "Apple" }, { value: "b", label: "Banana" }];
/** Every question type, a panel, a repeat, a content block and an image. */
export const everyType = migrateSurvey({
  schemaVersion: 1,
  id: "every",
  title: "Every question type",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "intro", type: "content", markdown: "Hello, **welcome**. [Privacy](https://example.com)" },
        { id: "logo", type: "image", src: "https://example.com/logo.png", alt: "Example logo" },
        { id: "name", type: "text", title: "Name", required: true, autocomplete: "name" },
        { id: "email", type: "text", inputType: "email", title: "Email" },
        { id: "bio", type: "comment", title: "About you" },
        { id: "fruit", type: "single-choice", title: "Fruit", choices: abc },
        { id: "fruits", type: "multiple-choice", title: "Fruits", choices: abc },
        { id: "pick", type: "dropdown", title: "Pick", choices: abc },
        { id: "find", type: "dropdown", title: "Find", choices: abc, searchable: true },
        { id: "stars", type: "rating", title: "Rating", min: 1, max: 5 },
        { id: "ok", type: "boolean", title: "OK?" },
        { id: "m", type: "matrix", title: "Matrix", rows: [{ value: "r", label: "Speed" }], columns: abc },
        { id: "g", type: "grid", title: "Grid", rows: [{ value: "r", label: "Row" }], columns: [{ value: "n", label: "Count", cellType: "number" }, { value: "d", label: "Kind", cellType: "dropdown", choices: abc }, { value: "b", label: "Yes", cellType: "boolean" }] },
        { id: "rank", type: "ranking", title: "Rank", choices: abc },
        { id: "file", type: "file", title: "File" },
        { id: "multi", type: "multi-text", title: "Contact", items: [{ value: "first", label: "First name" }] },
        { id: "vol", type: "slider", title: "Volume", min: 0, max: 10 },
        { id: "tags", type: "tags", title: "Tags", choices: abc },
        { id: "pic", type: "image-choice", title: "Picture", choices: [{ value: "a", label: "Apple", imageUrl: "/a.png" }] },
        { id: "sig", type: "signature", title: "Sign" },
        { id: "sum", type: "computed", title: "Total", expr: "1 + 1" },
        { id: "box", type: "panel", title: "A panel", elements: [{ id: "inner", type: "text", title: "Inside" }] },
        { id: "kids", type: "panel", title: "Children", repeat: { min: 1 }, elements: [{ id: "kid", type: "text", title: "Child name" }] },
      ],
    },
  ],
});

async function violations(root: Element) {
  const result = await axe.run(root, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

describe("accessibility", () => {
  it("has no axe violations on a survey with every question type", async () => {
    const target = document.createElement("main");
    document.body.append(target);
    renderSurvey(target, createSurvey({ survey: everyType }));
    expect(await violations(target)).toEqual([]);
    target.remove();
  });

  it("has no axe violations with errors shown, and lists them in a summary that links to each field", async () => {
    const target = document.createElement("main");
    document.body.append(target);
    const model = createSurvey({ survey: everyType });
    renderSurvey(target, model);
    target.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    const summary = target.querySelector<HTMLElement>(".kv-error-summary")!;
    expect(summary.hidden).toBe(false);
    const link = summary.querySelector<HTMLAnchorElement>("a")!;
    expect(link.textContent).toContain("Name");
    link.click();
    expect(document.activeElement).toBe(target.querySelector('[data-question="name"] input'));
    const input = target.querySelector('[data-question="name"] input')!;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("error");
    expect(await violations(target)).toEqual([]);
    target.remove();
  });

  it("sets autocomplete on personal data inputs", () => {
    const target = document.createElement("div");
    renderSurvey(target, createSurvey({ survey: everyType }));
    expect(target.querySelector('[data-question="name"] input')!.getAttribute("autocomplete")).toBe("name");
    expect(target.querySelector('[data-question="email"] input')!.getAttribute("autocomplete")).toBe("email");
  });

  it("lets a signature be typed instead of drawn", () => {
    const target = document.createElement("div");
    renderSurvey(target, createSurvey({ survey: everyType }));
    const typed = target.querySelector<HTMLInputElement>('[data-question="sig"] .kv-signature-typed input');
    expect(typed).not.toBeNull();
    expect(typed!.getAttribute("aria-label")).toBe("Type your full name to sign");
  });

  it("announces where a ranking item moved", () => {
    const target = document.createElement("div");
    document.body.append(target);
    renderSurvey(target, createSurvey({ survey: everyType }));
    target.querySelector<HTMLButtonElement>('[data-question="rank"] .kv-ranking-down')!.click();
    expect(target.querySelector('[data-question="rank"] .kv-sr-only')!.textContent).toBe("Apple: position 2 of 2");
    target.remove();
  });
});
