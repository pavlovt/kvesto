import { describe, expect, it } from "vitest";
import {
  ExpressionEvaluationError,
  createSurvey,
  evaluateCondition,
  evaluateExpression,
  resolveLogic,
  unknownFunctions,
  validateAnswers,
  migrateSurvey,
} from "../src/index.js";

const now = () => new Date(2026, 10, 27, 12);
const ev = (text: string, answers = {}, options = {}) => evaluateExpression(text, answers, { now, ...options });

describe("evaluateExpression", () => {
  it.each([
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["10 / 4", 2.5],
    ["7 % 3", 1],
    ["-{a} + 1", -4],
    ["1 / 0", null],
    ["{missing} * 2", null],
    ["'a' + 'b'", "ab"],
    ["{s} + 1", 6],
    ["concat({s}, 'x', 1)", "5x1"],
    ["{age} >= 18 and {role} = 'dev'", true],
    ["{age} < 18 or not {vip}", false],
    ["{role} != 'pm'", true],
    ["{missing} = null", true],
    ["{missing} != 'x'", true],
    ["{missing} > 1", false],
    ["{s} = 5", true],
    ["{langs} = 'js'", false],
    ["contains({langs}, 'js')", true],
    ["contains({role}, 'ev')", true],
    ["count({langs})", 2],
    ["count({m})", 1],
    ["count({missing})", 0],
    ["sum({a}, {s}, {langs}, 1)", 11],
    ["avg(1, 2, {missing})", 1.5],
    ["avg({missing})", null],
    ["min(3, 1, 2)", 1],
    ["max({a}, 10)", 10],
    ["round(2.345, 2)", 2.35],
    ["round(2.5)", 3],
    ["abs(-3)", 3],
    ["length({role})", 3],
    ["upper({role})", "DEV"],
    ["iif({age} > 18, 'adult', 'minor')", "adult"],
    ["iif(false, unknownFn(), 'safe')", "safe"],
    ["isEmpty({missing})", true],
    ["{m.speed} = 'good'", true],
    ["{g.r1.c1} + 1", 4],
    ["today()", "2026-11-27"],
    ["age('2000-11-28')", 25],
    ["age('2000-11-27')", 26],
    ["dateDiff('2026-01-01', '2026-03-01')", 59],
    ["dateDiff('2026-01-31', '2026-03-01', 'months')", 1],
    ["year('2024-02-29')", 2024],
    ["'2026-01-02' > '2025-12-31'", true],
  ])("%s → %j", (text, expected) => {
    const answers = { a: 5, s: "5", age: "30", role: "dev", vip: true, langs: ["js", "ts"], m: { speed: "good" }, g: { r1: { c1: 3 } } };
    expect(ev(text, answers)).toEqual(expected);
  });

  it("reads $item references from the item", () => {
    expect(ev("{$item.x} * 2", { x: 1 }, { item: { x: 4 } })).toBe(8);
  });

  it("calls custom functions and refuses unknown ones", () => {
    const functions = { double: (x: unknown) => Number(x) * 2 };
    expect(ev("double({a})", { a: 3 }, { functions })).toBe(6);
    expect(() => ev("nope(1)")).toThrow(ExpressionEvaluationError);
    // Names on Object.prototype are not functions here.
    expect(() => ev("constructor(1)")).toThrow('Unknown function "constructor"');
    expect(() => ev("toString()", {}, { functions })).toThrow('Unknown function "toString"');
  });

  it("does not let built-ins be replaced", () => {
    expect(ev("sum(1, 2)", {}, { functions: { sum: () => 99 } })).toBe(3);
  });
});

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "s",
  title: "S",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "age", type: "text", inputType: "number", title: "Age" },
        { id: "role", type: "single-choice", title: "Role", choices: [{ value: "dev", label: "Dev" }, { value: "pm", label: "PM" }] },
        { id: "why", type: "comment", title: "Why", visibleIf: { expr: "{age} >= 18 and {role} = 'dev'" }, requiredIf: { expr: "{age} > 40" } },
        { id: "vat", type: "text", title: "VAT", visibleIf: { expr: "isBusiness({role})" } },
      ],
    },
  ],
});
const functions = { isBusiness: (role: unknown) => role === "pm" };

describe("expression conditions", () => {
  it("drive visibility and requiredness", () => {
    expect(resolveLogic(survey, { age: "30", role: "dev" }, { functions }).visibleQuestions.has("why")).toBe(true);
    expect(resolveLogic(survey, { age: "17", role: "dev" }, { functions }).visibleQuestions.has("why")).toBe(false);
    expect(resolveLogic(survey, { age: "50", role: "dev" }, { functions }).requiredQuestions.has("why")).toBe(true);
    expect(resolveLogic(survey, { role: "pm" }, { functions }).visibleQuestions.has("vat")).toBe(true);
  });

  it("are false when a function is missing at evaluation time", () => {
    expect(evaluateCondition({ expr: "isBusiness('pm')" }, {})).toBe(false);
  });

  it("are checked by validateAnswers", () => {
    const { issues } = validateAnswers(survey, { age: "50", role: "dev" }, { functions });
    expect(issues).toEqual([{ questionId: "why", message: "This question is required.", path: ["why"] }]);
  });

  it("make createSurvey refuse a survey that calls unregistered functions", () => {
    expect(unknownFunctions(survey)).toEqual(["isBusiness"]);
    expect(unknownFunctions(survey, functions)).toEqual([]);
    expect(() => createSurvey({ survey })).toThrow("unknown functions: isBusiness");
    const model = createSurvey({ survey, functions, initialAnswers: { role: "pm" } });
    expect(model.isVisible("vat")).toBe(true);
  });

  it("leave existing JSON conditions unchanged", () => {
    expect(evaluateCondition({ question: "a", op: "gte", value: 2 }, { a: 3 })).toBe(true);
    expect(evaluateCondition({ all: [{ question: "a", op: "eq", value: 3 }, { expr: "{a} = 3" }] }, { a: 3 })).toBe(true);
  });
});
