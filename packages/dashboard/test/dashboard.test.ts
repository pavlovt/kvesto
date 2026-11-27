import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { memoryStorage, registerQuestionType, unregisterQuestionType, type SurveyInput } from "@kvesto/core";
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

describe("custom question types", () => {
  it("shows the summary a registered type produces", async () => {
    registerQuestionType({
      type: "x-mood",
      summarize: (_q, values) => ({ counts: [{ value: "happy", label: "Happy faces", count: values.filter((v) => v === "happy").length }] }),
    });
    const storage = memoryStorage();
    const saved = await storage.saveSurvey({
      schemaVersion: 1,
      id: "mood",
      title: "Mood",
      pages: [{ id: "p", elements: [{ id: "m", type: "x-mood", title: "Mood" }] }],
    } as never);
    await storage.saveResponse(saved.id, { answers: { m: "happy" } });
    await storage.saveResponse(saved.id, { answers: { m: "sad" } });
    const target = document.createElement("div");
    const dash = mountDashboard(target, { storage, surveyId: "mood" });
    await settle();
    expect(target.textContent).toContain("Happy faces");
    dash.destroy();
    unregisterQuestionType("x-mood");
  });
});

describe("localized surveys", () => {
  it("shows titles and labels in the chosen locale", async () => {
    const storage = memoryStorage();
    const saved = await storage.saveSurvey({
      schemaVersion: 1,
      id: "multi",
      title: { en: "Feedback", de: "Rückmeldung" },
      pages: [{ id: "p", elements: [{ id: "c", type: "single-choice", title: { en: "Colour", de: "Farbe" }, choices: [{ value: "r", label: { en: "Red", de: "Rot" } }] }] }],
    } as never);
    await storage.saveResponse(saved.id, { answers: { c: "r" } });
    const target = document.createElement("div");
    const dash = mountDashboard(target, { storage, surveyId: "multi", locale: "de" });
    await settle();
    expect(target.querySelector("h1")?.textContent).toBe("Rückmeldung");
    expect(target.textContent).toContain("Farbe");
    expect(target.textContent).toContain("Rot");
    dash.destroy();
  });
});

describe("partial responses", () => {
  it("shows the completion rate and drop-off, and leaves partials out of the results unless asked", async () => {
    const survey = {
      schemaVersion: 1,
      id: "funnel",
      title: "Funnel",
      pages: [{ id: "p", elements: [{ id: "a", type: "rating", title: "First", min: 1, max: 5 }, { id: "b", type: "rating", title: "Second", min: 1, max: 5 }] }],
    };
    const responses = [
      { id: "1", surveyId: "funnel", createdAt: "", status: "complete", answers: { a: 5, b: 5 } },
      { id: "2", surveyId: "funnel", createdAt: "", status: "partial", answers: { a: 1 } },
      { id: "3", surveyId: "funnel", createdAt: "", status: "partial", answers: {} },
    ];
    const { mount } = await import("svelte");
    const { SurveyResults } = await import("../src/lib/index.js");
    const target = document.createElement("div");
    const view = mount(SurveyResults, { target, props: { survey: survey as never, responses: responses as never } });
    flushSync();
    expect(target.textContent).toContain("1 responses");
    expect(target.textContent).toContain("1 of 3 started responses were completed (33%)");
    expect([...target.querySelectorAll(".kv-dash-dropoff .kv-dash-num")].map((n) => n.textContent)).toEqual(["2", "1"]);
    const toggle = target.querySelector<HTMLInputElement>(".kv-dash-toggle input")!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expect(target.textContent).toContain("3 responses");
    const { unmount } = await import("svelte");
    unmount(view);
  });
});

describe("dashboard theme", () => {
  it("starts with the given theme and can be switched", async () => {
    const target = document.createElement("div");
    const dash = mountDashboard(target, { storage: memoryStorage(), theme: "auto" });
    await settle();
    const root = target.querySelector(".kv-dashboard")!;
    expect(root.getAttribute("data-kv-ui-theme")).toBe("auto");
    const pick = target.querySelector<HTMLSelectElement>(".kv-dash-ui-theme")!;
    pick.value = "dark";
    pick.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expect(root.getAttribute("data-kv-ui-theme")).toBe("dark");
    dash.destroy();
  });
});

describe("quiz scores", () => {
  it("shows the average, pass rate and score distribution", async () => {
    const survey = { schemaVersion: 1, id: "q", title: "Q", settings: { quiz: { passMark: 0.5 } }, pages: [{ id: "p", elements: [{ id: "a", type: "text", title: "A", correctAnswer: "x" }] }] };
    const responses = [1, 0, 1].map((score, i) => ({ id: String(i), surveyId: "q", createdAt: "", answers: {}, meta: { quiz: { score, max: 1, passed: score === 1 } } }));
    const { mount, unmount } = await import("svelte");
    const { SurveyResults } = await import("../src/lib/index.js");
    const target = document.createElement("div");
    const view = mount(SurveyResults, { target, props: { survey: survey as never, responses: responses as never } });
    flushSync();
    expect(target.querySelector(".kv-dash-scores")!.textContent).toContain("Average 67% over 3 scored responses, 67% passed.");
    unmount(view);
  });
});

describe("table view and filters", () => {
  const survey = {
    schemaVersion: 1,
    id: "t",
    title: "T",
    pages: [
      {
        id: "p",
        elements: [
          { id: "role", type: "single-choice", title: "Role", choices: [{ value: "dev", label: "Developer" }, { value: "pm", label: "Manager" }] },
          { id: "m", type: "matrix", title: "Rate", rows: [{ value: "speed", label: "Speed" }], columns: [{ value: "good", label: "Good" }, { value: "bad", label: "Bad" }] },
        ],
      },
    ],
  };
  const responses = [
    { id: "1", surveyId: "t", createdAt: "2026-01-05T10:00:00.000Z", answers: { role: "dev", m: { speed: "good" } } },
    { id: "2", surveyId: "t", createdAt: "2026-02-05T10:00:00.000Z", answers: { role: "pm", m: { speed: "bad" } } },
    { id: "3", surveyId: "t", createdAt: "2026-03-05T10:00:00.000Z", answers: { role: "dev" } },
  ];
  const mountResults = async () => {
    const { mount } = await import("svelte");
    const { SurveyResults } = await import("../src/lib/index.js");
    const target = document.createElement("div");
    const view = mount(SurveyResults, { target, props: { survey: survey as never, responses: responses as never } });
    flushSync();
    return { target, view };
  };
  const pick = (el: HTMLSelectElement | HTMLInputElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
  };

  it("shows a table with flattened columns, sorts it, and filters the summary and the table", async () => {
    const { target, view } = await mountResults();
    [...target.querySelectorAll<HTMLButtonElement>(".kv-dash-views button")].find((b) => b.textContent === "Table")!.click();
    flushSync();
    const headers = [...target.querySelectorAll(".kv-dash-table thead th")].map((th) => th.textContent);
    expect(headers).toEqual(["Open", "Submitted", "Role", "Rate: Speed"]);
    const firstCol = () => [...target.querySelectorAll(".kv-dash-table tbody tr td:nth-child(3)")].map((td) => td.textContent);
    expect(firstCol()).toEqual(["Developer", "Manager", "Developer"]);
    target.querySelectorAll<HTMLButtonElement>(".kv-dash-table thead th button")[1]!.click(); // Role
    flushSync();
    expect(firstCol()).toEqual(["Developer", "Developer", "Manager"]);

    pick(target.querySelector<HTMLSelectElement>('[aria-label="Question to filter by"]')!, "role");
    pick(target.querySelector<HTMLSelectElement>('[aria-label="Answer to filter by"]')!, "dev");
    expect(target.textContent).toContain("2 responses");
    pick(target.querySelectorAll<HTMLInputElement>('.kv-dash-filters input[type="date"]')[0]!, "2026-02-01");
    expect(target.textContent).toContain("1 responses");
    // One response on its own.
    target.querySelector<HTMLButtonElement>(".kv-dash-open")!.click();
    flushSync();
    expect(target.querySelector(".kv-dash-detail dl")!.textContent).toContain("Role Developer");
    // Downloads build a file from the filtered responses.
    const created: Blob[] = [];
    URL.createObjectURL = ((b: Blob) => (created.push(b), "blob:x")) as typeof URL.createObjectURL;
    URL.revokeObjectURL = () => {};
    [...target.querySelectorAll<HTMLButtonElement>(".kv-dash-exports button")].find((b) => b.textContent === "CSV")!.click();
    expect(await created[0]!.text()).toContain("Developer");
    [...target.querySelectorAll<HTMLButtonElement>(".kv-dash-exports button")].find((b) => b.textContent === "Excel")!.click();
    expect(created[1]!.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const { unmount } = await import("svelte");
    unmount(view);
  });
});
