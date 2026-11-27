import { describe, expect, it } from "vitest";
import {
  SurveySchema,
  createSurvey,
  validateAnswer,
  validateAnswers,
  type Question,
  type SurveyInput,
  type Validator,
} from "../src/index.js";

const q = (question: Record<string, unknown>, validators: Validator[]): Question =>
  ({ id: "q", title: "Q", ...question, validators }) as Question;

const text = (validators: Validator[], extra: Record<string, unknown> = {}) => q({ type: "text", ...extra }, validators);

describe("validators", () => {
  it("pattern matches the whole answer, with flags", () => {
    const zip = text([{ type: "pattern", pattern: "[0-9]{4}" }]);
    expect(validateAnswer(zip, "1000")).toBeNull();
    expect(validateAnswer(zip, "10000")).toBe("Enter a value in the expected format.");
    expect(validateAnswer(zip, "x1000")).not.toBeNull();
    const code = text([{ type: "pattern", pattern: "ab+", flags: "i", message: "Use AB codes" }]);
    expect(validateAnswer(code, "ABB")).toBeNull();
    expect(validateAnswer(code, "AC")).toBe("Use AB codes");
  });

  it("length counts characters", () => {
    const v = text([{ type: "length", min: 2, max: 4 }]);
    expect(validateAnswer(v, "ab")).toBeNull();
    expect(validateAnswer(v, "a")).toBe("Enter between 2 and 4 characters.");
    expect(validateAnswer(v, "abcde")).toBe("Enter between 2 and 4 characters.");
    expect(validateAnswer(text([{ type: "length", min: 3 }]), "ab")).toBe("Enter at least 3 characters.");
    expect(validateAnswer(q({ type: "comment" }, [{ type: "length", max: 2 }]), "😀😀")).toBeNull();
  });

  it("email and url", () => {
    expect(validateAnswer(text([{ type: "email" }]), "a@b.co")).toBeNull();
    expect(validateAnswer(text([{ type: "email" }]), "nope")).toBe("Enter a valid email address.");
    expect(validateAnswer(text([{ type: "url" }]), "https://example.com/x")).toBeNull();
    expect(validateAnswer(text([{ type: "url" }]), "javascript:alert(1)")).toMatch(/web address/);
    expect(validateAnswer(text([{ type: "url" }]), "example.com")).toMatch(/web address/);
  });

  it("range checks numbers, ratings and dates", () => {
    const age = text([{ type: "range", min: 18, max: 120 }], { inputType: "number" });
    expect(validateAnswer(age, "30")).toBeNull();
    expect(validateAnswer(age, "12")).toBe("Enter a number between 18 and 120.");
    expect(validateAnswer(age, "abc")).toBe("Enter a number.");
    const rating = q({ type: "rating", min: 1, max: 10 }, [{ type: "range", min: 5 }]);
    expect(validateAnswer(rating, 7)).toBeNull();
    expect(validateAnswer(rating, 3)).toBe("Enter a number at least 5.");
    const date = text([{ type: "range", min: "2026-01-01" }], { inputType: "date" });
    expect(validateAnswer(date, "2026-03-04")).toBeNull();
    expect(validateAnswer(date, "2025-12-31")).toBe("Enter a date on or after 2026-01-01.");
  });

  it("count checks picked options, files and answered matrix rows", () => {
    const pick = q(
      { type: "multiple-choice", choices: ["a", "b", "c"].map((v) => ({ value: v, label: v })) },
      [{ type: "count", min: 2, max: 2 }],
    );
    expect(validateAnswer(pick, ["a", "b"])).toBeNull();
    expect(validateAnswer(pick, ["a"])).toBe("Choose exactly 2 options.");
    const grid = q(
      {
        type: "matrix",
        rows: ["r1", "r2", "r3"].map((v) => ({ value: v, label: v })),
        columns: [{ value: "y", label: "Y" }],
      },
      [{ type: "count", min: 2 }],
    );
    expect(validateAnswer(grid, { r1: "y", r2: "y" })).toBeNull();
    expect(validateAnswer(grid, { r1: "y" })).toBe("Answer at least 2 rows.");
    const file = { name: "a.txt", type: "text/plain", size: 1, url: "https://x/a" };
    const files = q({ type: "file", maxFiles: 5 }, [{ type: "count", min: 2 }]);
    expect(validateAnswer(files, [file])).toBe("Attach at least 2 files.");
  });

  it("runs after the shape check and skips empty answers", () => {
    const v = text([{ type: "length", min: 3 }]);
    expect(validateAnswer(v, "")).toBeNull();
    expect(validateAnswer({ ...v, required: true }, "")).toBe("This question is required.");
    expect(validateAnswer(v, 5 as never)).toBe("Expected text.");
  });

  it("reports the first failing validator", () => {
    const v = text([{ type: "length", min: 5, message: "too short" }, { type: "pattern", pattern: "[a-z]+", message: "lowercase" }]);
    expect(validateAnswer(v, "AB")).toBe("too short");
    expect(validateAnswer(v, "ABCDE")).toBe("lowercase");
  });

  it("calls registered custom validators with options and answers", () => {
    const v = text([{ type: "custom", name: "notEqual", options: { other: "a" } }]);
    const validators = {
      notEqual: (value: unknown, ctx: { options: Record<string, unknown>; answers: Record<string, unknown> }) =>
        value === ctx.answers[ctx.options.other as string] ? "Must differ from A" : true,
    };
    expect(validateAnswer(v, "x", { validators, answers: { a: "y" } })).toBeNull();
    expect(validateAnswer(v, "y", { validators, answers: { a: "y" } })).toBe("Must differ from A");
    const withMessage = text([{ type: "custom", name: "never", message: "Nope" }]);
    expect(validateAnswer(withMessage, "x", { validators: { never: () => false } })).toBe("Nope");
  });

  it("does not pass an unregistered custom validator", () => {
    expect(validateAnswer(text([{ type: "custom", name: "missing" }]), "x")).toMatch(/unknown validator "missing"/);
  });
});

describe("validator schema rules", () => {
  const survey = (question: Record<string, unknown>): SurveyInput =>
    ({ schemaVersion: 1, id: "s", title: "S", pages: [{ id: "p", elements: [{ id: "q", title: "Q", ...question }] }] }) as SurveyInput;
  const issues = (question: Record<string, unknown>) => {
    const r = SurveySchema.safeParse(survey(question));
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("accepts validators on the question types they apply to", () => {
    expect(issues({ type: "text", validators: [{ type: "pattern", pattern: "a+" }, { type: "email" }] })).toEqual([]);
    expect(issues({ type: "text", inputType: "date", validators: [{ type: "range", min: "2026-01-01" }] })).toEqual([]);
    expect(issues({ type: "rating", validators: [{ type: "range", min: 2, max: 4 }] })).toEqual([]);
  });

  it("rejects bad patterns, wrong question types, wrong bound types and min > max", () => {
    expect(issues({ type: "text", validators: [{ type: "pattern", pattern: "(" }] })[0]).toMatch(/Invalid regular expression/);
    expect(issues({ type: "boolean", validators: [{ type: "length", max: 3 }] })[0]).toMatch(/only applies/);
    expect(issues({ type: "text", validators: [{ type: "range", min: 1 }] })[0]).toMatch(/only applies/);
    expect(issues({ type: "text", inputType: "number", validators: [{ type: "range", min: "2026-01-01" }] })[0]).toMatch(
      /must be numbers/,
    );
    expect(issues({ type: "text", validators: [{ type: "length", min: 5, max: 2 }] })[0]).toMatch(/max must be at least min/);
    expect(issues({ type: "text", validators: [{ type: "pattern", pattern: "a", flags: "g" }] }).length).toBe(1);
  });
});

describe("validators in the runtime", () => {
  const input: SurveyInput = {
    schemaVersion: 1,
    id: "v",
    title: "V",
    pages: [
      {
        id: "p",
        elements: [
          { id: "code", type: "text", title: "Code", validators: [{ type: "custom", name: "even" }] },
          { id: "nick", type: "text", title: "Nick", validators: [{ type: "length", min: 3, message: "Three or more" }] },
        ],
      },
    ],
  };
  const even = (v: unknown) => Number(v) % 2 === 0;

  it("blocks completion with the validator message", async () => {
    const model = createSurvey({ survey: input, validators: { even } });
    model.setValue("code", "4");
    model.setValue("nick", "ab");
    expect(await model.complete()).toBeNull();
    expect(model.snapshot.errors).toEqual({ nick: "Three or more" });
    model.setValue("nick", "abc");
    expect(await model.complete()).not.toBeNull();
  });

  it("is applied by validateAnswers with custom validators", () => {
    const survey = SurveySchema.parse(input);
    expect(validateAnswers(survey, { code: "3" }, { validators: { even } }).issues).toEqual([
      { questionId: "code", message: "This answer is not valid." },
    ]);
    expect(validateAnswers(survey, { code: "2" }, { validators: { even } }).issues).toEqual([]);
  });
});
