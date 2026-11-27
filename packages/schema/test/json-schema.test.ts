import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { SURVEY_JSON_SCHEMA_URL, SurveySchema, surveyJsonSchema } from "../src/index.js";
import { advancedSurvey, feedbackSurvey, panelSurvey } from "../../core/test/fixtures.js";

const validate = new Ajv2020({ strict: false }).compile(surveyJsonSchema());

describe("surveyJsonSchema", () => {
  it("accepts the fixture surveys, which SurveySchema also accepts", () => {
    for (const survey of [feedbackSurvey, advancedSurvey, panelSurvey]) {
      expect(SurveySchema.safeParse(survey).success).toBe(true);
      expect(validate(survey), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it("accepts a $schema link in the survey file", () => {
    expect(validate({ ...feedbackSurvey, $schema: SURVEY_JSON_SCHEMA_URL })).toBe(true);
    expect(SurveySchema.parse({ ...feedbackSurvey, $schema: SURVEY_JSON_SCHEMA_URL }).$schema).toBe(SURVEY_JSON_SCHEMA_URL);
  });

  it("rejects invalid documents", () => {
    expect(validate({ ...feedbackSurvey, schemaVersion: 2 })).toBe(false);
    expect(validate({ ...feedbackSurvey, pages: [] })).toBe(false);
    const badType = structuredClone(feedbackSurvey);
    (badType.pages[0]!.elements[0] as { type: string }).type = "nope";
    expect(validate(badType)).toBe(false);
  });

  it("is written to dist/survey.schema.json by the build", () => {
    const file = JSON.parse(readFileSync(new URL("../dist/survey.schema.json", import.meta.url), "utf8"));
    expect(file).toEqual(surveyJsonSchema());
    expect(file.$id).toBe(SURVEY_JSON_SCHEMA_URL);
  });
});
