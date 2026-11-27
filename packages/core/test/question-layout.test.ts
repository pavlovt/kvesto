// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createSurvey, migrateSurvey, renderSurvey } from "../src/index.js";

const yesNo = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
const survey = migrateSurvey({
  schemaVersion: 1,
  id: "steps",
  title: "Steps",
  settings: { layout: "question" },
  pages: [
    {
      id: "p1",
      elements: [
        { id: "intro", type: "content", markdown: "Hello" },
        { id: "pet", type: "single-choice", title: "Pet?", choices: yesNo, required: true },
        { id: "petName", type: "text", title: "Pet name", visibleIf: { question: "pet", op: "eq", value: "yes" } },
      ],
    },
    { id: "p2", visibleIf: { question: "pet", op: "eq", value: "yes" }, elements: [{ id: "vet", type: "boolean", title: "Vet?" }] },
    { id: "p3", elements: [{ id: "score", type: "rating", title: "Score", min: 0, max: 10 }, { id: "notes", type: "comment", title: "Notes" }] },
  ],
});

describe("question stepping in the model", () => {
  it("lists visible steps across pages and skips hidden ones", () => {
    const model = createSurvey({ survey });
    expect(model.snapshot.steps.map((s) => s.id)).toEqual(["intro", "pet", "score", "notes"]);
    model.setValue("pet", "yes");
    expect(model.snapshot.steps.map((s) => s.id)).toEqual(["intro", "pet", "petName", "vet", "score", "notes"]);
  });

  it("validates the current step before moving, and crosses pages", () => {
    const model = createSurvey({ survey });
    expect(model.nextStep()).toBe(true); // intro → pet
    expect(model.nextStep()).toBe(false); // pet is required
    expect(model.snapshot.errors.pet).toBe("This question is required.");
    model.setValue("pet", "no");
    expect(model.nextStep()).toBe(true);
    expect(model.snapshot.steps[model.snapshot.stepIndex]!.id).toBe("score");
    expect(model.snapshot.page.id).toBe("p3");
    expect(model.prevStep()).toBe(true);
    expect(model.snapshot.steps[model.snapshot.stepIndex]!.id).toBe("pet");
    expect(model.snapshot.page.id).toBe("p1");
  });

  it("moves on to the next shown step when the current one becomes hidden", () => {
    const model = createSurvey({ survey });
    model.setValue("pet", "yes");
    model.nextStep();
    model.nextStep();
    expect(model.snapshot.steps[model.snapshot.stepIndex]!.id).toBe("petName");
    model.setValue("pet", "no");
    expect(model.snapshot.steps[model.snapshot.stepIndex]!.id).toBe("score");
  });
});

describe("question layout rendering", () => {
  const setup = () => {
    const target = document.createElement("div");
    document.body.append(target);
    const onComplete = vi.fn();
    const model = createSurvey({ survey, onComplete });
    renderSurvey(target, model);
    const shown = () => [...target.querySelectorAll<HTMLElement>("[data-question], [data-block]")].filter((e) => !e.hidden).map((e) => e.dataset.question ?? e.dataset.block);
    const form = target.querySelector("form")!;
    const key = (k: string, on: Element = form) => on.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    const enter = () => form.dispatchEvent(new Event("submit", { cancelable: true }));
    const tick = () => new Promise((r) => setTimeout(r, 0));
    return { target, model, shown, key, enter, tick, onComplete };
  };

  it("can be completed with the keyboard only", async () => {
    const ui = setup();
    expect(ui.shown()).toEqual(["intro"]);
    expect(ui.target.querySelector(".kv-progress-text")!.textContent).toBe("1 of 4");
    ui.enter();
    expect(ui.shown()).toEqual(["pet"]);
    expect(document.activeElement).toBe(ui.target.querySelector('[data-question="pet"] input'));
    // "2" picks the second option, and a single-choice answer moves on by itself.
    ui.key("2");
    await ui.tick();
    expect(ui.model.getValue("pet")).toBe("no");
    expect(ui.shown()).toEqual(["score"]);
    expect(ui.target.querySelector(".kv-progress-text")!.textContent).toBe("3 of 4");
    // On a rating, the number key picks that value.
    ui.key("7");
    await ui.tick();
    expect(ui.model.getValue("score")).toBe(7);
    expect(ui.shown()).toEqual(["notes"]);
    // Number keys are ordinary typing in a text field.
    ui.key("5", ui.target.querySelector("textarea")!);
    expect(ui.target.querySelector(".kv-next")!.textContent).toBe("Submit");
    ui.enter();
    await ui.tick();
    expect(ui.onComplete).toHaveBeenCalledOnce();
  });

  it("goes back a step with the Back button, and the page layout is unchanged by default", () => {
    const ui = setup();
    ui.enter();
    ui.target.querySelector<HTMLButtonElement>(".kv-prev")!.click();
    expect(ui.shown()).toEqual(["intro"]);
    expect(ui.target.querySelector<HTMLButtonElement>(".kv-prev")!.hidden).toBe(true);

    const target = document.createElement("div");
    renderSurvey(target, createSurvey({ survey }), { layout: "page" });
    expect([...target.querySelectorAll<HTMLElement>("[data-question], [data-block]")].filter((e) => !e.hidden)).toHaveLength(2);
    expect(target.querySelector(".kv-progress")).toBeNull();
  });
});

describe("mountSurvey", () => {
  it("passes every render option on, not just labels", async () => {
    const { mountSurvey } = await import("../src/index.js");
    const target = document.createElement("div");
    mountSurvey(target, { survey, layout: "page", progressBar: true });
    expect(target.querySelector(".kv-progress")).not.toBeNull();
    expect([...target.querySelectorAll<HTMLElement>("[data-question], [data-block]")].filter((e) => !e.hidden)).toHaveLength(2);
  });
});
