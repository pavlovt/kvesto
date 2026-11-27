import { describe, expect, it } from "vitest";
import { allQuestions, findElement, findQuestion, pageQuestions, panelQuestions, walkElements } from "../src/index.js";

const survey = {
  pages: [
    { elements: [{ id: "a", type: "text" }, { id: "b", type: "text" }] },
    { elements: [] },
    { elements: [{ id: "c", type: "text" }] },
  ],
};

const nested = {
  pages: [
    {
      elements: [
        { id: "a", type: "text" },
        {
          id: "g",
          type: "panel",
          elements: [
            { id: "b", type: "text" },
            { id: "g2", type: "panel", elements: [{ id: "c", type: "text" }] },
          ],
        },
        { id: "d", type: "text" },
      ],
    },
  ],
};

describe("element helpers", () => {
  it("lists every question in document order", () => {
    expect(allQuestions(survey).map((q) => q.id)).toEqual(["a", "b", "c"]);
    expect(pageQuestions(survey.pages[0]!).map((q) => q.id)).toEqual(["a", "b"]);
  });

  it("walks elements with their location and can stop early", () => {
    const seen: string[] = [];
    const finished = walkElements(survey, (q, at) => {
      seen.push(`${q.id}@${at.path.join(".")}`);
      if (q.id === "b") return false;
    });
    expect(finished).toBe(false);
    expect(seen).toEqual(["a@pages.0.elements.0", "b@pages.0.elements.1"]);
  });

  it("goes into panels, depth first, and can skip a panel's contents", () => {
    const seen: string[] = [];
    walkElements(nested, (el, at) => {
      seen.push(`${el.id}[${at.panels.join("/")}]`);
    });
    expect(seen).toEqual(["a[]", "g[]", "b[g]", "g2[g]", "c[g/g2]", "d[]"]);
    const skipped: string[] = [];
    walkElements(nested, (el) => {
      skipped.push(el.id);
      if (el.id === "g2") return "skip";
    });
    expect(skipped).toEqual(["a", "g", "b", "g2", "d"]);
    expect(allQuestions(nested).map((q) => q.id)).toEqual(["a", "b", "c", "d"]);
    expect(panelQuestions(nested.pages[0]!.elements[1]!).map((q) => q.id)).toEqual(["b", "c"]);
    expect(findElement(nested, "c")?.location.path).toEqual(["pages", 0, "elements", 1, "elements", 1, "elements", 0]);
    expect(findQuestion(nested, "g")).toBeUndefined();
    expect(findQuestion(nested, "c")?.id).toBe("c");
  });

  it("finds an element by id", () => {
    expect(findElement(survey, "c")).toEqual({
      element: { id: "c", type: "text" },
      location: { pageIndex: 2, index: 0, panels: [], path: ["pages", 2, "elements", 0] },
    });
    expect(findElement(survey, "zzz")).toBeUndefined();
  });

  it("does not let callers mutate the page through pageQuestions", () => {
    const list = pageQuestions(survey.pages[0]!);
    list.pop();
    expect(survey.pages[0]!.elements).toHaveLength(2);
  });
});
