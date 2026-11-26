import { describe, expect, it } from "vitest";
import { evaluateCondition, resolveLogic, SurveySchema, validateAnswer, validateAnswers, type Condition } from "../src/index.js";
import { advancedSurvey } from "./fixtures.js";

const survey = SurveySchema.parse(advancedSurvey);

describe("evaluateCondition", () => {
  const answers = { role: "dev", score: 7, tags: ["a", "b"], note: "hello world", date: "2026-05-01", grid: { speed: "good" } };
  const cases: [Condition, boolean][] = [
    [{ question: "role", op: "eq", value: "dev" }, true],
    [{ question: "role", op: "neq", value: "dev" }, false],
    [{ question: "missing", op: "neq", value: "dev" }, true],
    [{ question: "missing", op: "eq", value: "dev" }, false],
    [{ question: "score", op: "gte", value: 7 }, true],
    [{ question: "score", op: "gt", value: 7 }, false],
    [{ question: "score", op: "lt", value: "8" }, false],
    [{ question: "date", op: "lt", value: "2026-06-01" }, true],
    [{ question: "tags", op: "contains", value: "a" }, true],
    [{ question: "tags", op: "contains", value: ["a", "c"] }, false],
    [{ question: "tags", op: "notContains", value: "c" }, true],
    [{ question: "tags", op: "eq", value: ["b", "a"] }, true],
    [{ question: "note", op: "contains", value: "world" }, true],
    [{ question: "role", op: "in", value: ["pm", "dev"] }, true],
    [{ question: "tags", op: "in", value: ["z", "b"] }, true],
    [{ question: "role", op: "notIn", value: ["pm"] }, true],
    [{ question: "missing", op: "empty" }, true],
    [{ question: "tags", op: "notEmpty" }, true],
    [{ question: "grid", row: "speed", op: "eq", value: "good" }, true],
    [{ question: "grid", row: "price", op: "empty" }, true],
    [{ all: [{ question: "role", op: "eq", value: "dev" }, { question: "score", op: "lt", value: 5 }] }, false],
    [{ any: [{ question: "role", op: "eq", value: "pm" }, { question: "score", op: "lt", value: 10 }] }, true],
    [{ not: { question: "role", op: "eq", value: "pm" } }, true],
  ];
  it.each(cases)("%j → %s", (condition, expected) => {
    expect(evaluateCondition(condition, answers)).toBe(expected);
  });
});

describe("resolveLogic", () => {
  it("hides questions and pages and treats hidden answers as empty", () => {
    const pm = resolveLogic(survey, { role: "pm", stack: "svelte", priorities: ["docs", "speed", "price"] });
    expect(pm.visibleQuestions.has("stack")).toBe(false);
    expect(pm.visiblePages.has("devs")).toBe(false);
    expect(pm.answers).toEqual({ role: "pm" });

    const dev = resolveLogic(survey, { role: "dev" });
    expect(dev.visibleQuestions.has("stack")).toBe(true);
    expect(dev.requiredQuestions.has("stack")).toBe(true);
    expect(dev.visiblePages.has("devs")).toBe(true);
  });

  it("applies requiredIf", () => {
    expect(resolveLogic(survey, { quality: { speed: "good" } }).requiredQuestions.has("why")).toBe(false);
    expect(resolveLogic(survey, { quality: { support: "poor" } }).requiredQuestions.has("why")).toBe(true);
  });
});

describe("validateAnswer for new types", () => {
  const q = (id: string) => survey.pages.flatMap((p) => p.elements).find((x) => x.id === id)!;

  it("checks matrix rows and columns", () => {
    expect(validateAnswer(q("quality"), { speed: "good" })).toBeNull();
    expect(validateAnswer(q("quality"), { speed: "great" })).toMatch(/one column/);
    expect(validateAnswer(q("quality"), { price: "good" })).toMatch(/Unknown row/);
    expect(validateAnswer(q("quality"), { speed: "good" }, { required: true })).toMatch(/Support/);
    expect(validateAnswer(q("quality"), { speed: ["good"] })).toMatch(/one column/);
  });

  it("checks multi-select matrices", () => {
    const multi = { ...(q("quality") as any), multiple: true };
    expect(validateAnswer(multi, { speed: ["ok", "good"] })).toBeNull();
    expect(validateAnswer(multi, { speed: "ok" })).toMatch(/columns/);
  });

  it("requires a ranking to be a full permutation", () => {
    expect(validateAnswer(q("priorities"), ["price", "docs", "speed"])).toBeNull();
    expect(validateAnswer(q("priorities"), ["price", "docs"])).toMatch(/exactly once/);
    expect(validateAnswer(q("priorities"), ["price", "price", "docs"])).toMatch(/exactly once/);
  });

  it("checks file type, size, count and inline data size", () => {
    const png = { name: "a.png", type: "image/png", size: 100, url: "https://x/a" };
    expect(validateAnswer(q("screenshot"), [png])).toBeNull();
    expect(validateAnswer(q("screenshot"), [{ ...png, type: "text/html", name: "a.html" }])).toMatch(/not an accepted/);
    expect(validateAnswer(q("screenshot"), [{ ...png, size: 5000 }])).toMatch(/larger than/);
    expect(validateAnswer(q("screenshot"), [png, png, png])).toMatch(/at most 2/);
    // A data URL whose real size exceeds maxSize is caught even if `size` lies.
    const big = `data:image/png;base64,${"A".repeat(4000)}`;
    expect(validateAnswer(q("screenshot"), [{ ...png, url: big }])).toMatch(/larger than/);
    expect(validateAnswer(q("screenshot"), ["a.png"])).toMatch(/Expected uploaded files/);
  });
});

describe("validateAnswers", () => {
  it("skips hidden questions, applies requiredIf and strips hidden answers", () => {
    const pm = validateAnswers(survey, { role: "pm", stack: "", priorities: ["bad"] });
    expect(pm.issues).toEqual([]);
    expect(pm.answers).toEqual({ role: "pm" });

    const dev = validateAnswers(survey, { role: "dev", quality: { speed: "poor" }, extra: 1 });
    expect(dev.issues.map((i) => i.questionId).sort()).toEqual(["extra", "stack", "why"]);
  });
});
