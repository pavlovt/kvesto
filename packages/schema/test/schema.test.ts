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
