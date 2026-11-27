// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createSurvey, maskAnswers, mountSurvey, SurveySchema, validateAnswers, type SurveyInput } from "../src/index.js";

const input: SurveyInput = {
  schemaVersion: 1,
  id: "consent",
  title: "Consent",
  pages: [
    {
      id: "p",
      elements: [
        { id: "email", type: "text", title: "Email", pii: true },
        { id: "kids", type: "panel", repeat: {}, elements: [{ id: "kidName", type: "text", title: "Name", pii: true }, { id: "age", type: "rating", title: "Age", min: 0, max: 18 }] },
        { id: "agree", type: "boolean", title: "I agree to the terms", consent: true },
      ],
    },
  ],
};
const survey = SurveySchema.parse(input);

describe("consent questions", () => {
  it("must be ticked, but only when submitting", () => {
    expect(validateAnswers(survey, {}).issues.map((i) => [i.questionId, i.message])).toEqual([["agree", "Please agree to continue."]]);
    expect(validateAnswers(survey, { agree: false }).issues[0]?.message).toBe("Please agree to continue.");
    expect(validateAnswers(survey, { agree: true }).issues).toEqual([]);
    expect(validateAnswers(survey, {}, { partial: true }).issues).toEqual([]);
  });

  it("render as one checkbox labelled by the question", async () => {
    const target = document.createElement("div");
    const { model } = mountSurvey(target, { survey: input });
    const box = target.querySelector<HTMLInputElement>('[data-question="agree"] input[type="checkbox"]')!;
    expect(target.querySelector(`#${box.getAttribute("aria-labelledby")}`)?.textContent).toContain("I agree to the terms");
    expect(target.querySelectorAll('[data-question="agree"] input[type="radio"]')).toHaveLength(0);
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(model.snapshot.answers.agree).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    expect(model.snapshot.answers.agree).toBeUndefined();
    expect(await createSurvey({ survey: input }).complete()).toBeNull();
  });
});

describe("maskAnswers", () => {
  it("masks pii answers, also inside repeat items", () => {
    expect(maskAnswers(survey, { email: "a@b.test", kids: [{ kidName: "Mia", age: 7 }], agree: true })).toEqual({
      email: "[redacted]",
      kids: [{ kidName: "[redacted]", age: 7 }],
      agree: true,
    });
  });
});
