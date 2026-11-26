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
});
