import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import { SurveySchema } from "@kvesto/schema";
import { answersJsonSchema, surveyFromJsonSchema, validateAnswers } from "../src/index.js";
import { advancedSurvey, feedbackSurvey, panelSurvey, repeatSurvey } from "./fixtures.js";

const parseSurvey = (s: unknown) => SurveySchema.parse(s);
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;
const ajv = addFormats(new Ajv2020({ strict: false }));
const check = (schema: object, data: unknown) => {
  const validate = ajv.compile(schema);
  return validate(data) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
};

describe("answersJsonSchema", () => {
  it("is a valid JSON Schema for every fixture", () => {
    for (const fixture of [feedbackSurvey, advancedSurvey, panelSurvey, repeatSurvey]) {
      expect(() => ajv.compile(answersJsonSchema(parseSurvey(fixture)))).not.toThrow();
    }
  });

  it("accepts what validateAnswers accepts, and catches wrong types and values", () => {
    const survey = parseSurvey(feedbackSurvey);
    const schema = answersJsonSchema(survey);
    const good = { email: "ana@example.com", role: "dev", score: 9, comment: "Nice" };
    expect(validateAnswers(survey, good).issues).toEqual([]);
    expect(check(schema, good)).toEqual([]);
    expect(schema.required).toEqual(["email", "score"]);
    expect(check(schema, { email: "ana@example.com" })).not.toEqual([]);
    expect(check(schema, { ...good, role: "ceo" })).not.toEqual([]);
    expect(check(schema, { ...good, score: 11 })).not.toEqual([]);
    expect(check(schema, { ...good, email: "not an email" })).not.toEqual([]);
    expect(check(schema, { ...good, extra: 1 })).not.toEqual([]);
  });

  it("leaves conditional questions optional, and describes matrices, rankings and files", () => {
    const survey = parseSurvey(advancedSurvey);
    const schema = answersJsonSchema(survey) as { required: string[]; properties: Record<string, object> };
    expect(schema.required).toEqual(["role"]);
    const answers = {
      role: "dev",
      stack: "TS",
      quality: { speed: "good", support: "ok" },
      priorities: ["price", "docs", "speed"],
      screenshot: [{ name: "a.png", type: "image/png", size: 10, url: "https://x.test/a.png" }],
    };
    expect(validateAnswers(survey, answers).issues).toEqual([]);
    expect(check(schema, answers)).toEqual([]);
    expect(check(schema, { role: "pm" })).toEqual([]);
    expect(check(schema, { ...answers, quality: { speed: "great" } })).not.toEqual([]);
    expect(check(schema, { ...answers, priorities: ["price", "docs"] })).not.toEqual([]);
  });

  it("flattens panels and turns repeating panels into arrays of items", () => {
    expect(Object.keys((answersJsonSchema(parseSurvey(panelSurvey)) as { properties: object }).properties)).toEqual(["hasPet", "petName", "vet", "vetName", "comment"]);
    const schema = answersJsonSchema(parseSurvey(repeatSurvey));
    expect(check(schema, { hasKids: true, children: [{ name: "Mia", age: 7, school: "public" }] })).toEqual([]);
    expect(check(schema, { hasKids: true, children: [{ age: 7 }] })).not.toEqual([]);
    expect(check(schema, { hasKids: true, children: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }] })).not.toEqual([]);
  });
});

describe("surveyFromJsonSchema", () => {
  const schema = {
    title: "Sign up",
    type: "object",
    required: ["email", "plan"],
    properties: {
      email: { type: "string", format: "email", title: "Email" },
      full_name: { type: "string", minLength: 2, maxLength: 80 },
      plan: { enum: ["free", "pro"] },
      seats: { type: "integer", minimum: 1, maximum: 500 },
      satisfaction: { type: "integer", minimum: 1, maximum: 5 },
      newsletter: { type: "boolean" },
      topics: { type: "array", items: { enum: ["news", "tips"] }, maxItems: 2 },
      bio: { type: "string", maxLength: 2000 },
      address: { type: "object", properties: { city: { type: "string" }, zip: { type: "string", pattern: "^[0-9]{4}$" } } },
      matrix: { type: "array", items: { type: "object" } },
    },
    oneOf: [{ required: ["seats"] }],
  };

  it("makes a valid survey with the types, required fields and limits carried over", () => {
    const { survey, issues } = surveyFromJsonSchema(schema);
    expect(SurveySchema.safeParse(survey).success).toBe(true);
    const els = survey.pages[0]!.elements as Record<string, unknown>[];
    const byId = Object.fromEntries(els.map((e) => [e.id, e]));
    expect(survey.title).toBe("Sign up");
    expect(byId.email).toMatchObject({ type: "text", inputType: "email", required: true, title: "Email" });
    expect(byId.full_name).toMatchObject({ type: "text", title: "Full name", validators: [{ type: "length", min: 2, max: 80 }] });
    expect(byId.plan).toMatchObject({ type: "single-choice", required: true, choices: [{ value: "free" }, { value: "pro" }] });
    expect(byId.seats).toMatchObject({ type: "text", inputType: "number", validators: [{ type: "range", min: 1, max: 500 }] });
    expect(byId.satisfaction).toMatchObject({ type: "rating", min: 1, max: 5 });
    expect(byId.newsletter).toMatchObject({ type: "boolean" });
    expect(byId.topics).toMatchObject({ type: "multiple-choice", validators: [{ type: "count", max: 2 }] });
    expect(byId.bio).toMatchObject({ type: "comment" });
    expect(byId.address).toMatchObject({ type: "panel", elements: [{ id: "address_city" }, { id: "address_zip", validators: [{ type: "pattern", pattern: "[0-9]{4}" }] }] });
    expect(byId.matrix).toBeUndefined();
    expect(issues.join("\n")).toContain("matrix");
    expect(issues.join("\n")).toContain('"oneOf"');
  });

  it("round-trips: a survey made from a schema accepts what the schema accepts", () => {
    const { survey } = surveyFromJsonSchema(schema);
    const parsed = parseSurvey(survey);
    const answers = { email: "a@b.test", plan: "pro", full_name: "Ana", satisfaction: 4, newsletter: true, topics: ["news"], address_zip: "1000" };
    expect(validateAnswers(parsed, answers).issues).toEqual([]);
    expect(check(answersJsonSchema(parsed), answers)).toEqual([]);
    expect(validateAnswers(parsed, { ...answers, address_zip: "10" }).issues.map((i) => i.questionId)).toEqual(["address_zip"]);
  });

  it("round-trips the fixture surveys' answer schemas back into surveys with the same questions", () => {
    for (const fixture of [feedbackSurvey, panelSurvey]) {
      const { survey } = surveyFromJsonSchema(answersJsonSchema(parseSurvey(fixture)));
      expect(SurveySchema.safeParse(survey).success).toBe(true);
      const ids = (survey.pages[0]!.elements as { id: string }[]).map((e) => e.id);
      const original = Object.keys((answersJsonSchema(parseSurvey(fixture)) as { properties: object }).properties);
      expect(ids).toEqual(original);
    }
  });
});
