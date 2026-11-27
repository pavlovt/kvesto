/**
 * Property-based fuzzing of the parts that read untrusted input: the survey
 * schema, the expression parser and evaluator, and the condition evaluator.
 * Each property has a fixed number of runs and a time budget, so CI time is
 * bounded; any throw other than a validation error, or a slow case, fails.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ExpressionError, parseExpression, resolveLogic, SurveySchema, evaluateExpression, type Survey } from "../../src/index.js";

const RUNS = Number(process.env.KVESTO_FUZZ_RUNS ?? 300);
const BUDGET_MS = 8_000;
const run = (property: fc.IAsyncProperty<unknown[]> | fc.IProperty<unknown[]>) =>
  fc.assert(property as fc.IProperty<unknown[]>, { numRuns: RUNS, interruptAfterTimeLimit: BUDGET_MS, markInterruptAsFailure: false });

/** How long `fn` takes, in ms. */
const time = (fn: () => void) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

const ids = fc.constantFrom("a", "b", "c", "q1", "item");
const value = fc.oneof(fc.string({ maxLength: 20 }), fc.integer(), fc.double({ noNaN: false }), fc.boolean(), fc.constant(null));
const condition: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    tie("leaf"),
    fc.record({ all: fc.array(tie("node"), { maxLength: 4 }) }),
    fc.record({ any: fc.array(tie("node"), { maxLength: 4 }) }),
    fc.record({ not: tie("node") }),
  ),
  leaf: fc.record({
    question: ids,
    op: fc.constantFrom("eq", "neq", "gt", "gte", "lt", "lte", "contains", "empty", "notEmpty", "in", "bogus"),
    value: fc.oneof(value, fc.array(value, { maxLength: 3 })),
  }),
})).node;

describe("fuzzing", () => {
  it("SurveySchema never throws on arbitrary JSON, and answers quickly", () => {
    run(
      fc.property(fc.jsonValue({ maxDepth: 6 }), (doc) => {
        expect(time(() => SurveySchema.safeParse(doc))).toBeLessThan(500);
      }),
    );
  });

  it("SurveySchema never throws on survey-shaped documents with random conditions", () => {
    run(
      fc.property(fc.array(fc.record({ id: ids, type: fc.constantFrom("text", "boolean", "rating", "panel", "bogus"), title: fc.string(), visibleIf: condition }), { maxLength: 6 }), (elements) => {
        const doc = { schemaVersion: 1, id: "f", title: "F", pages: [{ id: "p", elements }] };
        expect(time(() => SurveySchema.safeParse(doc))).toBeLessThan(500);
      }),
    );
  });

  it("the expression parser only ever throws ExpressionError", () => {
    const tokens = fc.constantFrom("{a}", "{b}", "(", ")", "+", "-", "*", "/", "and", "or", "not", "==", "!=", "<", ">=", "1", "2.5", "'x'", "iif(", "sum(", ",", "true", "{$item.a}", "?", ":", "''", "\\");
    run(
      fc.property(fc.oneof(fc.string({ maxLength: 200 }), fc.array(tokens, { maxLength: 60 }).map((t) => t.join(" "))), (text) => {
        const elapsed = time(() => {
          try {
            parseExpression(text);
          } catch (e) {
            if (!(e instanceof ExpressionError)) throw e;
          }
        });
        expect(elapsed).toBeLessThan(200);
      }),
    );
  });

  it("evaluating any parsable expression never throws a non-expression error, and finishes quickly", () => {
    const tokens = fc.constantFrom("{a}", "{b}", "(", ")", "+", "-", "*", "/", "and", "or", "not", "==", "<", "1", "0", "'x'", "iif(", "sum(", "count(", "round(", ",", "true", "null");
    const answers = fc.record({ a: value, b: fc.oneof(value, fc.array(fc.string({ maxLength: 5 }), { maxLength: 4 })) });
    run(
      fc.property(fc.array(tokens, { maxLength: 40 }).map((t) => t.join(" ")), answers, (text, given) => {
        try {
          parseExpression(text);
        } catch {
          return;
        }
        const elapsed = time(() => {
          try {
            evaluateExpression(text, given as never);
          } catch (e) {
            if (!(e instanceof ExpressionError)) throw e;
          }
        });
        expect(elapsed).toBeLessThan(200);
      }),
    );
  });

  it("resolveLogic never throws on valid surveys with random answers", () => {
    const survey = SurveySchema.parse({
      schemaVersion: 1,
      id: "logic",
      title: "Logic",
      pages: [
        {
          id: "p",
          elements: [
            { id: "a", type: "text", title: "A" },
            { id: "b", type: "rating", title: "B", min: 1, max: 5, visibleIf: { question: "a", op: "eq", value: "x" } },
            { id: "c", type: "multiple-choice", title: "C", choices: [{ value: "1", label: "1" }], visibleIf: { any: [{ question: "b", op: "gt", value: 2 }, { not: { question: "a", op: "empty" } }] } },
            { id: "d", type: "text", title: "D", visibleIf: { expr: "{a} == 'y' or {b} * 2 > 5" } },
          ],
        },
      ],
    }) as Survey;
    run(
      fc.property(fc.dictionary(fc.constantFrom("a", "b", "c", "d", "zzz"), fc.oneof(value, fc.array(fc.string({ maxLength: 3 }), { maxLength: 3 }), fc.object({ maxDepth: 2 }))), (answers) => {
        expect(time(() => resolveLogic(survey, answers as never))).toBeLessThan(200);
      }),
    );
  });
});
