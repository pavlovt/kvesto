import { describe, expect, it } from "vitest";
import { allQuestions, findElement, pageQuestions, walkElements } from "../src/index.js";

const survey = {
  pages: [
    { elements: [{ id: "a" }, { id: "b" }] },
    { elements: [] },
    { elements: [{ id: "c" }] },
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

  it("finds an element by id", () => {
    expect(findElement(survey, "c")).toEqual({
      element: { id: "c" },
      location: { pageIndex: 2, index: 0, path: ["pages", 2, "elements", 0] },
    });
    expect(findElement(survey, "zzz")).toBeUndefined();
  });

  it("does not let callers mutate the page through pageQuestions", () => {
    const list = pageQuestions(survey.pages[0]!);
    list.pop();
    expect(survey.pages[0]!.elements).toHaveLength(2);
  });
});
