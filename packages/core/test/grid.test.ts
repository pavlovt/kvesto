// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { SurveySchema, mountSurvey, summarizeResponses, validateAnswer, type Question, type SurveyInput } from "../src/index.js";

const gridSurvey: SurveyInput = {
  schemaVersion: 1,
  id: "devices",
  title: "Devices",
  pages: [
    {
      id: "p",
      elements: [
        {
          id: "devices",
          type: "grid",
          title: "Your devices",
          rows: [
            { value: "phone", label: "Phone" },
            { value: "laptop", label: "Laptop" },
          ],
          columns: [
            { value: "brand", label: "Brand", cellType: "text", required: true, validators: [{ type: "length", max: 10 }] },
            { value: "years", label: "Years", cellType: "number", validators: [{ type: "range", min: 0, max: 20 }] },
            { value: "os", label: "OS", cellType: "dropdown", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
            { value: "work", label: "For work", cellType: "boolean" },
          ],
        },
      ],
    },
  ],
};

const survey = SurveySchema.parse(gridSurvey);
const grid = survey.pages[0]!.elements[0] as Question;

describe("grid questions", () => {
  it("rejects bad column definitions", () => {
    const bad = structuredClone(gridSurvey) as unknown as { pages: { elements: { columns: Record<string, unknown>[] }[] }[] };
    delete bad.pages[0]!.elements[0]!.columns[2]!.choices;
    bad.pages[0]!.elements[0]!.columns[3]!.validators = [{ type: "length", max: 2 }];
    const issues = SurveySchema.safeParse(bad).error?.issues.map((i) => i.message);
    expect(issues).toEqual(["A dropdown column needs choices", "length only applies to text and comment questions"]);
  });

  it("validates cell types, column rules and required columns", () => {
    expect(validateAnswer(grid, { phone: { brand: "Acme", years: 2, os: "a", work: true } })).toBeNull();
    expect(validateAnswer(grid, { tablet: { brand: "x" } })).toBe('Unknown row "tablet".');
    expect(validateAnswer(grid, { phone: { brand: "Acme", years: "2" } })).toBe("Phone, Years: enter a number.");
    expect(validateAnswer(grid, { phone: { brand: "Acme", os: "zzz" } })).toBe("Phone, OS: choose one of the options.");
    expect(validateAnswer(grid, { phone: { brand: "Acme", years: 30 } })).toBe("Phone, Years: Enter a number between 0 and 20.");
    expect(validateAnswer(grid, { phone: { brand: "A very long brand" } })).toBe("Phone, Brand: Enter at most 10 characters.");
    expect(validateAnswer(grid, { laptop: { years: 3 } })).toBe("Laptop: Brand is required.");
    expect(validateAnswer({ ...grid, required: true } as Question, undefined)).toBe("This question is required.");
  });

  it("renders a table of typed inputs and stores typed cell values", () => {
    const target = document.createElement("div");
    const { model, destroy } = mountSurvey(target, { survey: gridSurvey });
    const cell = (key: string) => target.querySelector<HTMLInputElement & HTMLSelectElement>(`[data-cell="${key}"]`)!;
    expect(target.querySelectorAll(".kv-grid tbody tr")).toHaveLength(2);
    expect(cell("phone.years").type).toBe("number");
    cell("phone.brand").value = "Acme";
    cell("phone.brand").dispatchEvent(new Event("input"));
    cell("phone.years").value = "3";
    cell("phone.years").dispatchEvent(new Event("input"));
    cell("phone.work").value = "false";
    cell("phone.work").dispatchEvent(new Event("change"));
    expect(model.getValue("devices")).toEqual({ phone: { brand: "Acme", years: 3, work: false } });
    cell("phone.years").value = "";
    cell("phone.years").dispatchEvent(new Event("input"));
    expect(model.getValue("devices")).toEqual({ phone: { brand: "Acme", work: false } });
    destroy();
  });

  it("summarises each column per row", () => {
    const responses = [
      { id: "1", surveyId: "devices", createdAt: "", answers: { devices: { phone: { brand: "A", years: 2, os: "a", work: true } } } },
      { id: "2", surveyId: "devices", createdAt: "", answers: { devices: { phone: { brand: "B", years: 4, os: "a" } } } },
    ];
    const [summary] = summarizeResponses(survey, responses);
    const phone = summary!.grid![0]!;
    expect(phone.answered).toBe(2);
    expect(phone.columns.find((c) => c.value === "years")!.average).toBe(3);
    expect(phone.columns.find((c) => c.value === "os")!.counts).toEqual([
      { value: "a", label: "A", count: 2 },
      { value: "b", label: "B", count: 0 },
    ]);
    expect(phone.columns.find((c) => c.value === "work")!.counts?.[0]).toEqual({ value: "true", label: "Yes", count: 1 });
    expect(summary!.grid![1]!.answered).toBe(0);
  });
});
