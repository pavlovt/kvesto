// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  createSurvey,
  migrateSurvey,
  registerQuestionType,
  renderSurvey,
  summarizeResponses,
  unregisterQuestionType,
  validateAnswers,
  z,
  type QuestionTypeDefinition,
} from "../src/index.js";

/** A test type: a colour picker answering with "#rrggbb". */
export const colour: QuestionTypeDefinition = {
  type: "x-colour",
  label: "colour",
  schema: z.looseObject({ palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).optional() }),
  validate: (_q, value) => (typeof value === "string" && /^#[0-9a-f]{6}$/.test(value) ? null : "Pick a colour."),
  render: ({ value, setValue, document, id, labelId }) => {
    const input = document.createElement("input");
    input.type = "color";
    input.id = id;
    input.setAttribute("aria-labelledby", labelId);
    input.value = typeof value === "string" ? value : "#000000";
    input.addEventListener("input", () => setValue(input.value));
    return { element: input, update: (v) => void (input.value = typeof v === "string" ? v : "#000000") };
  },
  summarize: (_q, values) => ({ samples: values.map(String), counts: [{ value: "dark", label: "Dark", count: values.filter((v) => v === "#000000").length }] }),
  editorDefaults: { palette: ["#ff0000"] },
};

const survey = {
  schemaVersion: 1,
  id: "c",
  title: "C",
  pages: [{ id: "p1", elements: [{ id: "fav", type: "x-colour", title: "Favourite colour", required: true, palette: ["#ff0000"] }] }],
};

afterEach(() => unregisterQuestionType("x-colour"));

describe("custom question types", () => {
  it("refuse surveys using an unregistered type, or breaking the type's schema", () => {
    expect(() => createSurvey({ survey })).toThrow('unknown question type "x-colour": register it with registerQuestionType');
    registerQuestionType(colour);
    const bad = structuredClone(survey);
    (bad.pages[0]!.elements[0] as { palette: string[] }).palette = ["red"];
    expect(() => createSurvey({ survey: bad })).toThrow('"fav" (palette.0)');
    expect(() => registerQuestionType({ type: "colour" as never })).toThrow('named "x-"');
  });

  it("render, validate and summarise through the registered definition", () => {
    registerQuestionType(colour);
    const target = document.createElement("div");
    const model = createSurvey({ survey });
    renderSurvey(target, model);
    const input = target.querySelector<HTMLInputElement>('[data-question="fav"] input[type="color"]')!;
    input.value = "#00ff00";
    input.dispatchEvent(new Event("input"));
    expect(model.getValue("fav")).toBe("#00ff00");

    const parsed = migrateSurvey(survey);
    expect(validateAnswers(parsed, { fav: "green" }).issues[0]!.message).toBe("Pick a colour.");
    expect(validateAnswers(parsed, { fav: "#123456" }).issues).toEqual([]);
    expect(validateAnswers(parsed, {}).issues[0]!.message).toBe("This question is required.");

    const responses = ["#000000", "#ffffff"].map((fav, i) => ({ id: String(i), surveyId: "c", createdAt: "", answers: { fav } }));
    expect(summarizeResponses(parsed, responses)[0]).toMatchObject({ answered: 2, counts: [{ value: "dark", count: 1 }] });
  });

  it("fall back to a text input and accept any answer without render and validate", () => {
    registerQuestionType({ type: "x-colour" });
    const target = document.createElement("div");
    renderSurvey(target, createSurvey({ survey }));
    expect(target.querySelector('[data-question="fav"] input[type="text"]')).not.toBeNull();
    expect(validateAnswers(migrateSurvey(survey), { fav: "anything" }).issues).toEqual([]);
  });

  it("refuse answers to a type that is no longer registered", () => {
    const parsed = migrateSurvey(survey);
    expect(validateAnswers(parsed, { fav: "#000000" }).issues[0]!.message).toContain('unknown question type "x-colour"');
  });
});
