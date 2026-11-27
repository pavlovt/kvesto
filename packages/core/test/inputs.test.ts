// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createSurvey, migrateSurvey, renderSurvey, summarizeResponses, validateAnswers } from "../src/index.js";

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "inputs",
  title: "Inputs",
  pages: [
    {
      id: "p1",
      elements: [
        {
          id: "contact",
          type: "multi-text",
          title: "Contact",
          items: [
            { value: "first", label: "First name", required: true },
            { value: "age", label: "Age", inputType: "number" },
            { value: "mail", label: "Email", inputType: "email" },
          ],
        },
        { id: "volume", type: "slider", title: "Volume", min: 0, max: 10, step: 2, unit: "dB" },
        {
          id: "skills",
          type: "tags",
          title: "Skills",
          allowCustom: true,
          maxTags: 3,
          choices: [{ value: "js", label: "JavaScript" }, { value: "go", label: "Go" }],
        },
        { id: "strict", type: "tags", title: "Strict", choices: [{ value: "a", label: "A" }] },
        {
          id: "pet",
          type: "image-choice",
          title: "Pet",
          choices: [{ value: "cat", label: "Cat", imageUrl: "/cat.png" }, { value: "dog", label: "Dog", imageUrl: "/dog.png" }],
        },
        {
          id: "pets",
          type: "image-choice",
          title: "Pets",
          multiple: true,
          choices: [{ value: "cat", label: "Cat", imageUrl: "/cat.png" }, { value: "dog", label: "Dog", imageUrl: "/dog.png" }],
        },
        {
          id: "country",
          type: "dropdown",
          title: "Country",
          searchable: true,
          choices: [{ value: "bg", label: "Bulgaria" }, { value: "de", label: "Germany" }],
        },
      ],
    },
  ],
});

const issue = (answers: Record<string, unknown>) => validateAnswers(survey, answers as never).issues.map((i) => i.message);

describe("validation", () => {
  it.each([
    [{ contact: { first: "Ana", age: "7", mail: "a@b.co" } }, []],
    [{ contact: { age: "7" } }, ["First name is required."]],
    [{ contact: { first: "A", age: "x" } }, ["Age: enter a number."]],
    [{ contact: { first: "A", mail: "nope" } }, ["Email: enter a valid email address."]],
    [{ contact: { first: "A", zip: "1" } }, ['Unknown field "zip".']],
    [{ volume: 4 }, []],
    [{ volume: 5 }, ["Choose a value from 0 to 10 in steps of 2."]],
    [{ volume: 12 }, ["Choose a value from 0 to 10 in steps of 2."]],
    [{ skills: ["js", "Rust"] }, []],
    [{ skills: ["js", "js"] }, ["Each entry can be added once."]],
    [{ skills: ["js", "go", "a", "b"] }, ["Add at most 3 entries."]],
    [{ strict: ["zzz"] }, ["Choose from the list."]],
    [{ pet: "cat", pets: ["cat", "dog"] }, []],
    [{ pet: ["cat"] }, ["Choose one of the pictures."]],
    [{ pets: ["cow"] }, ["Choose from the pictures."]],
  ])("%j → %j", (answers, expected) => {
    expect(issue(answers)).toEqual(expected);
  });
});

describe("rendering", () => {
  const setup = () => {
    const target = document.createElement("div");
    document.body.append(target);
    const model = createSurvey({ survey });
    renderSurvey(target, model);
    const q = (id: string) => target.querySelector<HTMLElement>(`[data-question="${id}"]`)!;
    const input = (el: HTMLInputElement, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event("input"));
    };
    return { target, model, q, input };
  };

  it("multi-text keeps an object of the filled inputs", () => {
    const { model, q, input } = setup();
    const [first, age] = q("contact").querySelectorAll<HTMLInputElement>("input");
    input(first!, "Ana");
    input(age!, "7");
    expect(model.getValue("contact")).toEqual({ first: "Ana", age: "7" });
    input(first!, "");
    input(age!, "");
    expect(model.getValue("contact")).toBeUndefined();
    expect(q("contact").querySelector("label")!.textContent).toBe("First name");
  });

  it("a slider is unanswered until moved", () => {
    const { model, q, input } = setup();
    const range = q("volume").querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(q("volume").querySelector("output")!.textContent).toBe("Not set");
    expect(range.getAttribute("aria-valuetext")).toBe("Not set");
    input(range, "6");
    expect(model.getValue("volume")).toBe(6);
    expect(q("volume").querySelector("output")!.textContent).toBe("6 dB");
  });

  it("tags add choices by label and custom entries, and remove them", () => {
    const { model, q } = setup();
    const field = q("skills").querySelector<HTMLInputElement>("input")!;
    const enter = (text: string) => {
      field.value = text;
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    };
    enter("javascript");
    enter("Rust");
    expect(model.getValue("skills")).toEqual(["js", "Rust"]);
    expect([...q("skills").querySelectorAll(".kv-tag")].map((t) => t.firstChild!.textContent)).toEqual(["JavaScript", "Rust"]);
    q("skills").querySelector<HTMLButtonElement>(".kv-tag-remove")!.click();
    expect(model.getValue("skills")).toEqual(["Rust"]);
    const strict = q("strict").querySelector<HTMLInputElement>("input")!;
    strict.value = "nope";
    strict.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(model.getValue("strict")).toBeUndefined();
  });

  it("image choices pick pictures", () => {
    const { model, q } = setup();
    const dog = q("pets").querySelectorAll<HTMLInputElement>("input")[1]!;
    dog.checked = true;
    dog.dispatchEvent(new Event("change"));
    expect(model.getValue("pets")).toEqual(["dog"]);
    expect(q("pet").querySelector("img")!.getAttribute("src")).toBe("/cat.png");
  });

  it("a searchable dropdown matches typed labels", () => {
    const { model, q, input } = setup();
    const field = q("country").querySelector<HTMLInputElement>("input[list]")!;
    input(field, "germany");
    expect(model.getValue("country")).toBe("de");
    input(field, "Germ");
    expect(model.getValue("country")).toBeUndefined();
    expect(q("country").querySelectorAll("datalist option")).toHaveLength(2);
  });
});

describe("summaries", () => {
  it("summarise each type", () => {
    const answers = [
      { contact: { first: "Ana", age: "7" }, volume: 4, skills: ["js", "Rust"], pet: "cat" },
      { contact: { first: "Ivo" }, volume: 8, skills: ["js"], pet: "dog", pets: ["dog"] },
    ];
    const responses = answers.map((a, i) => ({ id: String(i), surveyId: "inputs", createdAt: "", answers: a }));
    const by = Object.fromEntries(summarizeResponses(survey, responses as never).map((s) => [s.question.id, s]));
    expect(by.contact!.samples).toEqual(["First name: Ivo", "First name: Ana; Age: 7"]);
    expect(by.volume!.average).toBe(6);
    expect(by.skills!.counts).toEqual([{ value: "js", label: "JavaScript", count: 2 }, { value: "go", label: "Go", count: 0 }]);
    expect(by.skills!.samples).toEqual(["Rust"]);
    expect(by.pet!.counts!.map((c) => c.count)).toEqual([1, 1]);
  });
});
