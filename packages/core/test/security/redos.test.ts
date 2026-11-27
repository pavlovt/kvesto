/** Patterns that can take exponential time are refused; the ones that are accepted run fast on hostile input. */
import { describe, expect, it } from "vitest";
import { regexRisk, runValidators, SurveySchema } from "../../src/index.js";

const EVIL = [
  "(a+)+",
  "(a*)*b",
  "([a-z]+)*$",
  "(\\w+\\s?)*",
  "((ab)*)+",
  "((a+)b)+",
  "(a{1,10}){2,}",
  "(x+x+)+y",
  "(.*a){12}",
  "(\\d+)*\\.",
  "(a)\\1",
  "(?<x>a)\\k<x>",
];
const SAFE = ["[A-Z]{2}\\d{4}", "\\d{3}-\\d{4}", "[^@\\s]+@[^@\\s]+", "(ab|cd)?x", "(foo)+", "a{2}(b)?", "[(+)]*", "\\(a+\\)+", "(?:[0-9]{2}){3}"];

describe("ReDoS check on pattern validators", () => {
  it.each(EVIL)("refuses %s", (pattern) => {
    expect(regexRisk(pattern)).not.toBeNull();
  });

  it.each(SAFE)("accepts %s", (pattern) => {
    expect(regexRisk(pattern)).toBeNull();
  });

  it("is enforced by the schema", () => {
    const survey = (pattern: string) => ({
      schemaVersion: 1,
      id: "r",
      title: "R",
      pages: [{ id: "p", elements: [{ id: "t", type: "text", title: "T", validators: [{ type: "pattern", pattern }] }] }],
    });
    expect(SurveySchema.safeParse(survey("(a+)+")).success).toBe(false);
    expect(SurveySchema.safeParse(survey("[a-z]+")).success).toBe(true);
  });

  it("runs every accepted pattern against hostile input quickly", () => {
    const hostile = ["a".repeat(5000) + "!", "1".repeat(5000) + "x", "ab".repeat(2500) + "\u0000", " ".repeat(5000) + "@"];
    for (const pattern of SAFE) {
      const question = { id: "t", type: "text", title: "T" } as never;
      for (const input of hostile) {
        const start = performance.now();
        runValidators(question, input, [{ type: "pattern", pattern }], { answers: {} });
        expect(performance.now() - start, `${pattern} on ${input.slice(0, 10)}…`).toBeLessThan(100);
      }
    }
  });
});
