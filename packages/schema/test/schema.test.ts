import { describe, expect, it } from "vitest";
import { SurveySchema, migrateSurvey } from "../src/index.js";

const survey = {
  schemaVersion: 1,
  id: "demo",
  title: "Demo",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "name", type: "text", title: "Your name", required: true },
        { id: "score", type: "rating", title: "Score" },
      ],
    },
  ],
};

describe("SurveySchema", () => {
  it("accepts a valid survey and applies defaults", () => {
    const parsed = SurveySchema.parse(survey);
    const rating = parsed.pages[0]!.elements[1]!;
    expect(rating.type === "rating" && rating.max).toBe(5);
  });

  it("rejects duplicate question ids", () => {
    const bad = structuredClone(survey);
    bad.pages[0]!.elements[1]!.id = "name";
    expect(SurveySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown question types", () => {
    const bad = structuredClone(survey) as any;
    bad.pages[0].elements[0].type = "nope";
    expect(SurveySchema.safeParse(bad).success).toBe(false);
  });
});

describe("migrateSurvey", () => {
  it("fills in a missing schemaVersion", () => {
    const { schemaVersion, ...rest } = survey;
    expect(migrateSurvey(rest).schemaVersion).toBe(1);
  });

  it("refuses versions from the future", () => {
    expect(() => migrateSurvey({ ...survey, schemaVersion: 99 })).toThrow(/Unsupported/);
  });
});

describe("new question types and logic", () => {
  const base = (elements: unknown[], extraPages: unknown[] = []) => ({
    schemaVersion: 1,
    id: "s",
    title: "S",
    pages: [{ id: "p1", elements }, ...extraPages],
  });

  it("accepts matrix, ranking and file questions with defaults", () => {
    const parsed = SurveySchema.parse(
      base([
        {
          id: "m",
          type: "matrix",
          title: "Rate",
          rows: [{ value: "speed", label: "Speed" }],
          columns: [
            { value: "bad", label: "Bad" },
            { value: "good", label: "Good" },
          ],
        },
        { id: "r", type: "ranking", title: "Order", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
        { id: "f", type: "file", title: "Upload", accept: ["image/*"], maxSize: 1000 },
      ]),
    );
    const file = parsed.pages[0]!.elements[2]!;
    expect(file.type === "file" && file.maxFiles).toBe(1);
  });

  it("accepts nested conditions that refer to earlier questions and matrix rows", () => {
    const survey = base(
      [
        { id: "role", type: "single-choice", title: "Role", choices: [{ value: "dev", label: "Dev" }] },
        {
          id: "m",
          type: "matrix",
          title: "Rate",
          rows: [{ value: "speed", label: "Speed" }],
          columns: [{ value: "bad", label: "Bad" }],
        },
        {
          id: "why",
          type: "comment",
          title: "Why?",
          visibleIf: {
            all: [
              { question: "role", op: "eq", value: "dev" },
              { not: { question: "m", row: "speed", op: "empty" } },
            ],
          },
          requiredIf: { any: [{ question: "role", op: "in", value: ["dev"] }] },
        },
      ],
      [{ id: "p2", visibleIf: { question: "role", op: "notEmpty" }, elements: [] }],
    );
    expect(SurveySchema.safeParse(survey).success).toBe(true);
  });

  it("rejects conditions on later, unknown or self questions", () => {
    const later = base([
      { id: "a", type: "text", title: "A", visibleIf: { question: "b", op: "notEmpty" } },
      { id: "b", type: "text", title: "B" },
    ]);
    const self = base([{ id: "a", type: "text", title: "A", visibleIf: { question: "a", op: "notEmpty" } }]);
    const samePage = {
      ...base([{ id: "a", type: "text", title: "A" }]),
    };
    (samePage.pages[0] as any).visibleIf = { question: "a", op: "notEmpty" };
    for (const s of [later, self, samePage]) {
      const r = SurveySchema.safeParse(s);
      expect(r.success).toBe(false);
      expect(r.error!.issues[0]!.message).toMatch(/not an earlier question/);
    }
  });

  it("rejects malformed conditions, unknown matrix rows and duplicate choices", () => {
    const badOp = base([
      { id: "a", type: "text", title: "A" },
      { id: "b", type: "text", title: "B", visibleIf: { question: "a", op: "matches", value: ".*" } },
    ]);
    const extraKey = base([
      { id: "a", type: "text", title: "A" },
      { id: "b", type: "text", title: "B", visibleIf: { question: "a", op: "eq", value: "x", js: "alert(1)" } },
    ]);
    const badRow = base([
      { id: "m", type: "matrix", title: "M", rows: [{ value: "x", label: "X" }], columns: [{ value: "c", label: "C" }] },
      { id: "b", type: "text", title: "B", visibleIf: { question: "m", row: "nope", op: "notEmpty" } },
    ]);
    const dupes = base([
      { id: "r", type: "ranking", title: "R", choices: [{ value: "a", label: "A" }, { value: "a", label: "B" }] },
    ]);
    for (const s of [badOp, extraKey, badRow, dupes]) expect(SurveySchema.safeParse(s).success).toBe(false);
  });
});
