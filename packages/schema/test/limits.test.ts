import { describe, expect, it } from "vitest";
import { answerLimitIssues, AnswersSchema, SurveySchema, surveyLimitIssues } from "../src/index.js";

const q = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: "text", title: id, ...extra });
const survey = (pages: unknown[]) => ({ schemaVersion: 1, id: "big", title: "Big", pages });
const messages = (issues: { message: string }[]) => issues.map((i) => i.message);

describe("survey limits", () => {
  it("accepts an ordinary survey", () => {
    expect(surveyLimitIssues(survey([{ id: "p", elements: [q("a"), q("b")] }]))).toEqual([]);
  });

  it("refuses too many pages and elements", () => {
    const pages = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, elements: [q(`a${i}`), q(`b${i}`)] }));
    expect(messages(surveyLimitIssues(survey(pages), { pages: 2 }))).toEqual(["More than 2 pages"]);
    expect(messages(surveyLimitIssues(survey(pages), { elements: 5 }))).toEqual(["More than 5 elements"]);
  });

  it("refuses too many choices", () => {
    const choices = Array.from({ length: 4 }, (_, i) => ({ value: `c${i}`, label: `C${i}` }));
    const doc = survey([{ id: "p", elements: [{ id: "c", type: "single-choice", title: "C", choices }] }]);
    expect(surveyLimitIssues(doc, { choices: 3 })).toEqual([{ path: ["pages", 0, "elements", 0, "choices"], message: "More than 3 choices" }]);
  });

  it("refuses long strings, deep panels and deep conditions", () => {
    expect(messages(surveyLimitIssues(survey([{ id: "p", elements: [q("a", { title: "x".repeat(11) })] }]), { stringLength: 10 }))).toEqual([
      "Longer than 10 characters",
    ]);
    let panel: Record<string, unknown> = q("leaf");
    for (let i = 0; i < 4; i++) panel = { id: `panel${i}`, type: "panel", elements: [panel] };
    expect(messages(surveyLimitIssues(survey([{ id: "p", elements: [panel] }]), { panelDepth: 2 }))).toEqual(["Panels nested more than 2 levels deep"]);
    let condition: Record<string, unknown> = { question: "a", op: "eq", value: "x" };
    for (let i = 0; i < 5; i++) condition = { not: condition };
    expect(messages(surveyLimitIssues(survey([{ id: "p", elements: [q("a"), q("b", { visibleIf: condition })] }]), { conditionDepth: 3 }))).toEqual([
      "Conditions nested more than 3 levels deep",
    ]);
  });

  it("stops at the depth cap on hostile nesting instead of overflowing the stack", () => {
    let deep: unknown = "x";
    for (let i = 0; i < 100_000; i++) deep = [deep];
    expect(messages(surveyLimitIssues({ pages: deep }))).toEqual(["Nested more than 64 levels deep"]);
    expect(messages(answerLimitIssues({ a: deep }))).toEqual(["Nested more than 8 levels deep"]);
  });

  it("is part of SurveySchema", () => {
    const pages = Array.from({ length: 201 }, (_, i) => ({ id: `p${i}`, elements: [] }));
    const result = SurveySchema.safeParse(survey(pages));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("More than 200 pages");
  });
});

describe("answer limits", () => {
  it("refuses long text, long lists and too many repeat items", () => {
    expect(messages(answerLimitIssues({ a: "x".repeat(11) }, { stringLength: 10 }))).toEqual(["Longer than 10 characters"]);
    expect(messages(answerLimitIssues({ a: ["1", "2", "3"] }, { arrayLength: 2 }))).toEqual(["More than 2 values"]);
    expect(messages(answerLimitIssues({ kids: [{ n: "a" }, { n: "b" }, { n: "c" }] }, { repeatItems: 2 }))).toEqual(["More than 2 items"]);
    expect(answerLimitIssues({ kids: [{ n: "a", tags: ["x"] }], m: { r1: "c1" } })).toEqual([]);
  });

  it("is part of AnswersSchema", () => {
    expect(AnswersSchema.safeParse({ a: "x".repeat(100_001) }).success).toBe(false);
    expect(AnswersSchema.safeParse({ a: "x".repeat(1000) }).success).toBe(true);
  });
});
