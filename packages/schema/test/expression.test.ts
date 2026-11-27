import { describe, expect, it } from "vitest";
import {
  ExpressionError,
  MAX_EXPRESSION_DEPTH,
  MAX_EXPRESSION_LENGTH,
  SurveySchema,
  expressionFunctions,
  expressionRefs,
  parseExpression,
} from "../src/index.js";

describe("parseExpression", () => {
  it("parses operators with the right precedence", () => {
    expect(parseExpression("1 + 2 * 3")).toEqual({
      type: "binary",
      op: "+",
      left: { type: "literal", value: 1 },
      right: { type: "binary", op: "*", left: { type: "literal", value: 2 }, right: { type: "literal", value: 3 } },
    });
    const tree = parseExpression("{age} >= 18 and {role} = 'dev' or not {vip}");
    expect(tree.type === "binary" && tree.op).toBe("or");
  });

  it("parses references, calls, strings and literals", () => {
    const tree = parseExpression(`sum({q1}, {m.row}, {$item.x}) > 2 and "a\\"b" != 'c' and true and null = {g.r.c}`);
    expect(expressionRefs(tree)).toEqual([
      { name: "q1", path: [] },
      { name: "m", path: ["row"] },
      { name: "x", path: [], scope: "item" },
      { name: "g", path: ["r", "c"] },
    ]);
    expect(expressionFunctions(parseExpression("iif(isEmpty({a}), round(avg({b}), 1), 0)"))).toEqual(["iif", "isEmpty", "round", "avg"]);
    expect(parseExpression(`"a\\"b"`)).toEqual({ type: "literal", value: 'a"b' });
    expect(parseExpression("-.5e1")).toEqual({ type: "unary", op: "-", arg: { type: "literal", value: 5 } });
  });

  it.each([
    ["", "Empty expression"],
    ["1 +", "Unexpected end"],
    ["(1", 'Expected ")"'],
    ["'open", "Unterminated string"],
    ["{a", "Missing }"],
    ["{a b}", "Invalid reference"],
    ["{}", "Invalid reference"],
    ["age > 3", "Unknown word"],
    ["1 2", "Unexpected text"],
    ["1 # 2", "Unexpected character"],
    ["f(1,)", "Unexpected"],
  ])("rejects %j", (text, message) => {
    expect(() => parseExpression(text)).toThrow(ExpressionError);
    expect(() => parseExpression(text)).toThrow(message);
  });

  it("limits length and nesting", () => {
    expect(() => parseExpression("1".repeat(MAX_EXPRESSION_LENGTH + 1))).toThrow("longer than");
    const deep = "(".repeat(MAX_EXPRESSION_DEPTH) + "1" + ")".repeat(MAX_EXPRESSION_DEPTH);
    expect(() => parseExpression(deep)).toThrow("nested too deeply");
    expect(() => parseExpression("-".repeat(200) + "1")).toThrow("nested too deeply");
    expect(() => parseExpression("not ".repeat(200) + "true")).toThrow("nested too deeply");
  });
});

const survey = (visibleIf: unknown, extra: object[] = []) => ({
  schemaVersion: 1,
  id: "s",
  title: "S",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "age", type: "text", inputType: "number", title: "Age" },
        { id: "m", type: "matrix", title: "M", rows: [{ value: "r", label: "R" }], columns: [{ value: "c", label: "C" }] },
        ...extra,
        { id: "late", type: "text", title: "Late", visibleIf },
      ],
    },
  ],
});

describe("expression conditions in a survey", () => {
  it("accepts a valid expression that refers to earlier questions", () => {
    expect(SurveySchema.safeParse(survey({ expr: "{age} >= 18 and {m.r} = 'c'" })).success).toBe(true);
    expect(SurveySchema.safeParse(survey({ all: [{ expr: "{age} > 1" }, { question: "age", op: "notEmpty" }] })).success).toBe(true);
  });

  it("reports syntax errors with the position", () => {
    const r = SurveySchema.safeParse(survey({ expr: "{age} >=" }));
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toMatch(/Unexpected end of expression \(at character 9\)/);
  });

  it.each([
    ["{late} = 1", "does not refer to an earlier question"],
    ["{nope} = 1", "does not refer to an earlier question"],
    ["{m.zzz} = 'c'", "is not a part of"],
    ["{age.x} = 1", "is not a part of"],
    ["{$item.age} = 1", "$item can only be used inside a repeating panel"],
  ])("rejects %j", (expr, message) => {
    const r = SurveySchema.safeParse(survey({ expr }));
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message).join("\n")).toContain(message);
  });

  it("checks $item references inside repeating panels", () => {
    const repeat = (expr: string) => ({
      schemaVersion: 1,
      id: "s",
      title: "S",
      pages: [
        {
          id: "p1",
          elements: [
            {
              id: "kids",
              type: "panel",
              repeat: {},
              elements: [
                { id: "kage", type: "text", inputType: "number", title: "Age" },
                { id: "school", type: "text", title: "School", visibleIf: { expr } },
              ],
            },
          ],
        },
      ],
    });
    expect(SurveySchema.safeParse(repeat("{$item.kage} >= 6")).success).toBe(true);
    const r = SurveySchema.safeParse(repeat("{kage} >= 6"));
    expect(r.error!.issues[0]!.message).toContain("use {$item.kage} for the same item");
  });
});
