// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  SurveySchema,
  createSurvey,
  mountSurvey,
  resolveLogic,
  summarizeResponses,
  validateAnswers,
  type SurveyInput,
} from "../src/index.js";
import { repeatSurvey } from "./fixtures.js";

const survey = SurveySchema.parse(repeatSurvey);

describe("repeating panels in the schema", () => {
  const issues = (mutate: (s: { pages: { elements: Record<string, unknown>[] }[] }) => void) => {
    const doc = structuredClone(repeatSurvey) as unknown as { pages: { elements: Record<string, unknown>[] }[] };
    mutate(doc);
    const r = SurveySchema.safeParse(doc);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };
  const inner = (s: { pages: { elements: Record<string, unknown>[] }[] }) =>
    (s.pages[0]!.elements[1] as { elements: Record<string, unknown>[] }).elements;

  it("accepts the fixture", () => expect(issues(() => {})).toEqual([]));

  it("needs scope item to compare within an item, and forbids it elsewhere", () => {
    expect(issues((s) => void delete (inner(s)[2]!.visibleIf as Record<string, unknown>).scope)[0]).toMatch(/add "scope": "item"/);
    expect(issues((s) => void (s.pages[0]!.elements[2]!.visibleIf = { question: "age", op: "empty" }))[0]).toMatch(
      /inside a repeating panel/,
    );
    expect(issues((s) => void (s.pages[0]!.elements[2]!.visibleIf = { question: "hasKids", op: "empty", scope: "item" }))[0]).toMatch(
      /only be used inside a repeating panel/,
    );
    expect(issues((s) => void (inner(s)[0]!.visibleIf = { question: "hasKids", op: "eq", value: true }))).toEqual([]);
  });

  it("rejects nested repeats, file questions inside repeats and min > max", () => {
    expect(issues((s) => void inner(s).push({ id: "deep", type: "panel", repeat: {}, elements: [] }))[0]).toMatch(/cannot be nested/);
    expect(issues((s) => void inner(s).push({ id: "doc", type: "file", title: "Doc" }))[0]).toMatch(/File questions/);
    expect(issues((s) => void ((s.pages[0]!.elements[1] as { repeat: unknown }).repeat = { min: 3, max: 2 }))[0]).toMatch(/max must be/);
  });
});

describe("repeating panels in the logic", () => {
  it("works out visibility per item and keeps item answers in the effective answers", () => {
    const logic = resolveLogic(survey, {
      hasKids: true,
      children: [{ name: "Ana", age: 7, school: "public" }, { name: "Ivo", age: 4, school: "private" }],
    });
    expect([...logic.visibleQuestions]).toEqual(["hasKids", "notes"]);
    expect(logic.items.children!.map((i) => [...i.visibleQuestions])).toEqual([
      ["name", "age", "school"],
      ["name", "age"],
    ]);
    // The hidden "school" of the second item is dropped.
    expect(logic.answers.children).toEqual([{ name: "Ana", age: 7, school: "public" }, { name: "Ivo", age: 4 }]);
  });

  it("drops the whole list when the panel is hidden", () => {
    const logic = resolveLogic(survey, { hasKids: false, children: [{ name: "Ana" }] });
    expect(logic.answers).toEqual({ hasKids: false });
    expect(logic.items).toEqual({});
  });
});

describe("repeating panels in validation", () => {
  it("checks the number of items and each item's questions", () => {
    expect(validateAnswers(survey, { hasKids: true }).issues).toEqual([
      { questionId: "children", message: "Add at least 1 item.", path: ["children"] },
    ]);
    expect(validateAnswers(survey, { hasKids: true, children: [{ age: 3 }, { name: "B" }] }).issues).toEqual([
      { questionId: "children.0.name", message: "This question is required.", path: ["children", 0, "name"] },
    ]);
    const four = Array.from({ length: 4 }, (_, i) => ({ name: `k${i}` }));
    expect(validateAnswers(survey, { hasKids: true, children: four }).issues[0]?.message).toBe("Add at most 3 items.");
  });

  it("rejects malformed lists, unknown item keys and stray top-level answers", () => {
    expect(validateAnswers(survey, { hasKids: true, children: "x" }).issues[0]?.message).toBe("Expected a list of items.");
    expect(validateAnswers(survey, { hasKids: true, children: [{ name: "A", bogus: 1 }] }).issues).toEqual([
      { questionId: "children.0.bogus", message: "Unknown question", path: ["children", 0, "bogus"] },
    ]);
    expect(validateAnswers(survey, { hasKids: false, name: "A" }).issues).toEqual([
      { questionId: "name", message: "Unknown question", path: ["name"] },
    ]);
  });
});

describe("repeating panels in the model", () => {
  it("starts with min items, adds and removes within limits, and completes", async () => {
    const model = createSurvey({ survey: repeatSurvey, initialAnswers: { hasKids: true } });
    expect(model.getItems("children")).toEqual([{}]);
    expect(model.removeItem("children", 0)).toBe(false);
    expect(await model.complete()).toBeNull();
    expect(model.snapshot.errors).toEqual({ "children.0.name": "This question is required." });

    model.setItemValue("children", 0, "name", "Ana");
    expect(model.snapshot.errors).toEqual({});
    expect(model.addItem("children")).toBe(true);
    expect(model.addItem("children")).toBe(true);
    expect(model.addItem("children")).toBe(false);
    expect(model.removeItem("children", 2)).toBe(true);
    model.setItemValue("children", 1, "name", "Ivo");
    model.setItemValue("children", 1, "age", 9);
    model.setItemValue("children", 1, "school", "public");
    const done = await model.complete();
    expect(done?.response.answers).toEqual({
      hasKids: true,
      children: [{ name: "Ana" }, { name: "Ivo", age: 9, school: "public" }],
    });
  });

  it("refuses setValue on an inner question and setItemValue on the wrong panel", () => {
    const model = createSurvey({ survey: repeatSurvey });
    expect(() => model.setValue("name", "x")).toThrow(/setItemValue/);
    expect(() => model.setItemValue("children", 0, "notes", "x")).toThrow(/not a question of/);
    expect(() => model.setItemValue("children", 5, "name", "x")).toThrow(/no item 5/);
  });
});

describe("repeating panels in the renderer", () => {
  it("renders items with add and remove buttons and per-item logic", () => {
    const target = document.createElement("div");
    const { model, destroy } = mountSurvey(target, { survey: repeatSurvey, initialAnswers: { hasKids: true } });
    const panel = target.querySelector<HTMLElement>('[data-panel="children"]')!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelectorAll(".kv-repeat-item")).toHaveLength(1);
    expect(panel.querySelector(".kv-repeat-item-title")?.textContent).toBe("Child 1");
    expect(panel.querySelector<HTMLElement>(".kv-repeat-remove")!.hidden).toBe(true);

    const name = panel.querySelector<HTMLInputElement>('[data-key="children.0.name"] input')!;
    name.value = "Ana";
    name.dispatchEvent(new Event("input"));
    expect(model.getItems("children")).toEqual([{ name: "Ana" }]);
    // Typing does not rebuild the item.
    expect(panel.querySelector('[data-key="children.0.name"] input')).toBe(name);

    const school = () => panel.querySelector<HTMLElement>('[data-key="children.0.school"]')!;
    expect(school().hidden).toBe(true);
    model.setItemValue("children", 0, "age", 8);
    expect(school().hidden).toBe(false);

    const add = panel.querySelector<HTMLButtonElement>(".kv-repeat-add")!;
    expect(add.textContent).toBe("Add a child");
    add.click();
    add.click();
    expect(panel.querySelectorAll(".kv-repeat-item")).toHaveLength(3);
    expect(add.hidden).toBe(true);
    panel.querySelectorAll<HTMLButtonElement>(".kv-repeat-remove")[1]!.click();
    expect(panel.querySelectorAll(".kv-repeat-item")).toHaveLength(2);
    expect(panel.querySelector<HTMLInputElement>('[data-key="children.0.name"] input')!.value).toBe("Ana");

    target.querySelector("form")!.requestSubmit();
    expect(panel.querySelector<HTMLElement>('[data-key="children.1.name"] .kv-error')!.hidden).toBe(false);
    destroy();
  });
});

describe("repeating panels in summaries", () => {
  it("summarises inner questions over every item", () => {
    const responses = [
      { id: "1", surveyId: "family", createdAt: "", answers: { hasKids: true, children: [{ name: "A", age: 7, school: "public" }, { name: "B", age: 7 }] } },
      { id: "2", surveyId: "family", createdAt: "", answers: { hasKids: true, children: [{ name: "C", age: 10, school: "public" }] } },
    ];
    const summary = summarizeResponses(survey, responses);
    const age = summary.find((s) => s.question.id === "age")!;
    expect(age.repeat).toBe("children");
    expect(age.answered).toBe(3);
    expect(age.average).toBe(8);
    expect(summary.find((s) => s.question.id === "school")!.counts?.find((c) => c.value === "public")?.count).toBe(2);
  });
});

it("types: SurveyInput accepts repeat", () => {
  const s: SurveyInput = repeatSurvey;
  expect(s.id).toBe("family");
});
