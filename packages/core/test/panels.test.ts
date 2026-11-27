// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { SurveySchema, createSurvey, mountSurvey, resolveLogic, summarizeResponses, validateAnswers } from "../src/index.js";
import { panelSurvey } from "./fixtures.js";

const survey = SurveySchema.parse(panelSurvey);

describe("panels in the logic", () => {
  it("hides a panel and everything inside it", () => {
    const off = resolveLogic(survey, { hasPet: false, petName: "Rex", vet: true });
    expect([...off.visiblePanels]).toEqual([]);
    expect([...off.visibleQuestions]).toEqual(["hasPet", "comment"]);
    expect(off.answers).toEqual({ hasPet: false });

    const on = resolveLogic(survey, { hasPet: true, vet: true });
    expect([...on.visiblePanels]).toEqual(["pet", "health"]);
    expect([...on.visibleQuestions]).toEqual(["hasPet", "petName", "vet", "vetName", "comment"]);
    expect(on.requiredQuestions.has("petName")).toBe(true);
  });

  it("validates questions inside visible panels only, with flat answers", () => {
    expect(validateAnswers(survey, { hasPet: false }).issues).toEqual([]);
    expect(validateAnswers(survey, { hasPet: true }).issues).toEqual([{ questionId: "petName", message: "This question is required." }]);
  });

  it("completes through the model with flat answers", async () => {
    const model = createSurvey({ survey: panelSurvey });
    model.setValue("hasPet", true);
    expect(model.snapshot.questions.map((q) => q.id)).toEqual(["hasPet", "petName", "vet", "comment"]);
    expect(await model.complete()).toBeNull();
    model.setValue("petName", "Rex");
    const done = await model.complete();
    expect(done?.response.answers).toEqual({ hasPet: true, petName: "Rex" });
  });
});

describe("panels in the renderer", () => {
  it("renders nested fieldsets and toggles them with the logic", () => {
    const target = document.createElement("div");
    const { model, destroy } = mountSurvey(target, { survey: panelSurvey });
    const pet = target.querySelector<HTMLFieldSetElement>('fieldset.kv-panel[data-panel="pet"]')!;
    expect(pet.querySelector(":scope > legend")?.textContent).toBe("About your pet");
    expect(pet.querySelector(".kv-panel-description")?.textContent).toBe("Tell us a little more.");
    expect(pet.querySelector('[data-panel="health"] [data-question="vet"]')).not.toBeNull();
    expect(pet.hidden).toBe(true);

    const name = pet.querySelector<HTMLInputElement>('[data-question="petName"] input')!;
    model.setValue("hasPet", true);
    expect(pet.hidden).toBe(false);
    // The same input element stays in place, so focus is never lost.
    expect(pet.querySelector('[data-question="petName"] input')).toBe(name);
    model.setValue("hasPet", false);
    expect(pet.hidden).toBe(true);
    destroy();
  });
});

describe("panels in summaries", () => {
  it("lists the panels around each question", () => {
    const summary = summarizeResponses(survey, []);
    expect(summary.map((s) => [s.question.id, s.panels.map((p) => p.title ?? p.id).join(" / ")])).toEqual([
      ["hasPet", ""],
      ["petName", "About your pet"],
      ["vet", "About your pet / Health"],
      ["vetName", "About your pet / Health"],
      ["comment", ""],
    ]);
  });
});
