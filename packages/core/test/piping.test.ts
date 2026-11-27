// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { SurveySchema, createSurvey, migrateSurvey, pipeText, renderSurvey } from "../src/index.js";

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "pipe",
  title: "Hello",
  completedText: "Thanks, {name}! You picked {color}.",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "name", type: "text", title: "Your name" },
        { id: "color", type: "single-choice", title: "Colour", choices: [{ value: "r", label: "Red" }, { value: "g", label: "Green" }] },
        { id: "langs", type: "multiple-choice", title: "Languages", choices: [{ value: "js", label: "JavaScript" }, { value: "ts", label: "TypeScript" }] },
        { id: "ok", type: "boolean", title: "OK?", labelTrue: "Sure" },
        { id: "m", type: "matrix", title: "M", rows: [{ value: "speed", label: "Speed" }], columns: [{ value: "good", label: "Good" }] },
        { id: "secret", type: "text", title: "Secret", visibleIf: { question: "name", op: "neq", value: "hide" } },
        {
          id: "why",
          type: "comment",
          title: "Why {color}, {name}?",
          description: "Literal {{braces}}, {not-a-question} and {secret}",
          visibleIf: { question: "color", op: "notEmpty" },
        },
        { id: "pick", type: "single-choice", title: "Pick", choices: [{ value: "a", label: "Same as {name}" }, { value: "b", label: "Other" }] },
        {
          id: "kids",
          type: "panel",
          title: "Children of {name}",
          repeat: { min: 1, itemTitle: "Child {n}: {$item.kid}" },
          elements: [
            { id: "kid", type: "text", title: "Name" },
            { id: "kage", type: "text", title: "How old is {$item.kid}?" },
          ],
        },
      ],
    },
  ],
});

describe("pipeText", () => {
  const answers = { name: "Ana", color: "g", langs: ["js", "ts"], ok: true, m: { speed: "good" } };
  it.each([
    ["Hi {name}", "Hi Ana"],
    ["{color}", "Green"],
    ["{langs}", "JavaScript, TypeScript"],
    ["{ok}", "Sure"],
    ["{m.speed}", "Good"],
    ["{secret}", ""],
    ["{{name}} {{", "{name} {"],
    ["{unknown} stays", "{unknown} stays"],
    ["no braces", "no braces"],
  ])("%j → %j", (text, expected) => {
    expect(pipeText(text, survey, answers)).toBe(expected);
  });

  it("never produces markup: piped text is inserted as text", () => {
    const target = document.createElement("div");
    const model = createSurvey({ survey, initialAnswers: { name: "<img src=x onerror=alert(1)>", color: "r" } });
    renderSurvey(target, model);
    const why = target.querySelector('[data-question="why"] .kv-question-title')!;
    expect(why.textContent).toContain("Why Red, <img src=x onerror=alert(1)>?");
    expect(target.querySelector("img")).toBeNull();
  });
});

describe("rendering piped text", () => {
  it("updates titles, descriptions and choice labels as answers change, and pipes hidden questions as empty", () => {
    const target = document.createElement("div");
    const model = createSurvey({ survey });
    renderSurvey(target, model);
    model.setValue("name", "Ivo");
    model.setValue("color", "r");
    model.setValue("secret", "s3");
    const title = () => target.querySelector('[data-question="why"] .kv-question-title')!.firstChild!.textContent;
    const desc = () => target.querySelector('[data-question="why"] .kv-question-description')!.textContent;
    expect(title()).toBe("Why Red, Ivo?");
    expect(desc()).toBe("Literal {braces}, {not-a-question} and s3");
    expect(target.querySelector('[data-question="pick"] .kv-choice')!.textContent).toBe(" Same as Ivo");
    expect(target.querySelector('[data-panel="kids"] .kv-panel-title')!.textContent).toBe("Children of Ivo");
    model.setValue("name", "hide");
    expect(desc()).toBe("Literal {braces}, {not-a-question} and ");
  });

  it("pipes {$item.q} inside repeat items and their titles", () => {
    const target = document.createElement("div");
    const model = createSurvey({ survey });
    renderSurvey(target, model);
    model.setItemValue("kids", 0, "kid", "Mila");
    expect(target.querySelector(".kv-repeat-item-title")!.textContent).toBe("Child 1: Mila");
    expect(target.querySelector('[data-question="kage"] .kv-question-title')!.firstChild!.textContent).toBe("How old is Mila?");
    expect(model.text("{$item.kid} of {name}", { panel: "kids", index: 0 })).toBe("Mila of ");
  });

  it("pipes the completion text", async () => {
    const target = document.createElement("div");
    const model = createSurvey({ survey, initialAnswers: { name: "Ana", color: "g" } });
    renderSurvey(target, model);
    await model.complete();
    expect(target.querySelector(".kv-completed")!.textContent).toBe("Thanks, Ana! You picked Green.");
  });
});

describe("placeholder checks in the schema", () => {
  const base = (title: string, extra: object = {}) => ({
    schemaVersion: 1,
    id: "s",
    title: "S",
    ...extra,
    pages: [{ id: "p1", elements: [{ id: "a", type: "text", title: "A" }, { id: "b", type: "text", title }, { id: "c", type: "text", title: "C" }] }],
  });
  it("accepts earlier questions and braces around anything else", () => {
    expect(SurveySchema.safeParse(base("After {a}, see {not a ref} and {zzz} and {{c}}")).success).toBe(true);
  });
  it("refuses a placeholder for a later question or the question itself", () => {
    for (const title of ["Before {c}", "Itself {b}"]) {
      const r = SurveySchema.safeParse(base(title));
      expect(r.success).toBe(false);
      expect(r.error!.issues[0]!.message).toContain("does not refer to an earlier question");
    }
    expect(SurveySchema.safeParse(base("B", { title: "Survey {a}" })).success).toBe(false);
    expect(SurveySchema.safeParse(base("B", { completedText: "Bye {c}" })).success).toBe(true);
  });
});
