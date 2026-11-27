import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { memoryStorage, type SurveyInput } from "@kvesto/core";
import { mountDashboard } from "../src/lib/index.js";

const survey: SurveyInput = {
  schemaVersion: 1,
  id: "feedback",
  title: "Feedback",
  pages: [
    {
      id: "p",
      elements: [
        { id: "nps", type: "rating", title: "Score", min: 1, max: 5 },
        { id: "role", type: "single-choice", title: "Role", choices: [{ value: "dev", label: "Developer" }, { value: "pm", label: "PM" }] },
      ],
    },
  ],
};

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
};

describe("mountDashboard", () => {
  it("lists surveys and opens a survey's results", async () => {
    const storage = memoryStorage();
    const saved = await storage.saveSurvey(survey as never);
    await storage.saveResponse(saved.id, { answers: { nps: 4, role: "dev" } });
    await storage.saveResponse(saved.id, { answers: { nps: 2, role: "dev" } });

    const target = document.createElement("div");
    const dash = mountDashboard(target, { storage });
    await settle();
    const link = [...target.querySelectorAll("button")].find((b) => b.textContent === "Feedback")!;
    expect(link).toBeTruthy();
    expect(target.textContent).toContain("2");

    link.click();
    await settle();
    expect(target.querySelector("h1")?.textContent).toBe("Feedback");
    expect(target.textContent).toContain("Average: 3.0");
    expect(target.textContent).toContain("Developer");
    dash.destroy();
  });

  it("shows a missing survey as an error", async () => {
    const target = document.createElement("div");
    mountDashboard(target, { storage: memoryStorage(), surveyId: "nope" });
    await settle();
    expect(target.textContent).toContain('Survey "nope" not found.');
  });

  it("shows panel titles as group headings", async () => {
    const storage = memoryStorage();
    const grouped: SurveyInput = {
      schemaVersion: 1,
      id: "grouped",
      title: "Grouped",
      pages: [
        {
          id: "p",
          elements: [
            { id: "a", type: "boolean", title: "A" },
            {
              id: "g",
              type: "panel",
              title: "Group one",
              elements: [
                { id: "b", type: "boolean", title: "B" },
                { id: "c", type: "boolean", title: "C" },
              ],
            },
          ],
        },
      ],
    };
    await storage.saveSurvey(grouped as never);
    const target = document.createElement("div");
    mountDashboard(target, { storage, surveyId: "grouped" });
    await settle();
    const groups = [...target.querySelectorAll(".kv-dash-group")].map((g) => g.textContent);
    expect(groups).toEqual(["Group one"]);
  });

  it("shows grid questions as a table of column summaries", async () => {
    const storage = memoryStorage();
    const g: SurveyInput = {
      schemaVersion: 1,
      id: "g",
      title: "G",
      pages: [
        {
          id: "p",
          elements: [
            {
              id: "d",
              type: "grid",
              title: "Devices",
              rows: [{ value: "phone", label: "Phone" }],
              columns: [{ value: "years", label: "Years", cellType: "number" }],
            },
          ],
        },
      ],
    };
    await storage.saveSurvey(g as never);
    await storage.saveResponse("g", { answers: { d: { phone: { years: 2 } } } });
    await storage.saveResponse("g", { answers: { d: { phone: { years: 4 } } } });
    const target = document.createElement("div");
    mountDashboard(target, { storage, surveyId: "g" });
    await settle();
    expect(target.querySelector(".kv-dash-matrix tbody td")?.textContent).toBe("avg 3.0");
  });
});
