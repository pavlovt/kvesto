// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createSurvey, HttpStorageError, memoryStorage, mountSurvey, surveyAvailability, type SurveyInput } from "../src/index.js";

const survey = (settings: Record<string, unknown>): SurveyInput => ({
  schemaVersion: 1,
  id: "limited",
  title: "Limited",
  settings,
  pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Name" }] }],
});
const hour = 3_600_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

afterEach(() => localStorage.clear());

describe("surveyAvailability", () => {
  it("checks the window, the limit, the respondent and earlier answers", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const s = { settings: { opensAt: "2026-06-01T10:00:00Z", closesAt: "2026-06-02T10:00:00Z", maxResponses: 5 } };
    expect(surveyAvailability(s, { now })).toEqual({ open: true });
    expect(surveyAvailability(s, { now: new Date("2026-06-01T09:00:00Z") })).toEqual({ open: false, reason: "not-open" });
    expect(surveyAvailability(s, { now: new Date("2026-06-02T10:00:00Z") })).toEqual({ open: false, reason: "closed" });
    expect(surveyAvailability(s, { now, completeResponses: 5 })).toEqual({ open: false, reason: "full" });
    expect(surveyAvailability({ settings: { oneResponsePer: "respondent" } }, { identified: false })).toEqual({ open: false, reason: "sign-in" });
    expect(surveyAvailability({ settings: { oneResponsePer: "browser" } }, { answered: true })).toEqual({ open: false, reason: "answered" });
    expect(surveyAvailability({}, { answered: true })).toEqual({ open: true });
  });
});

describe("the runner's closed state", () => {
  it("shows a closed message instead of the survey before it opens", () => {
    const target = document.createElement("div");
    mountSurvey(target, { survey: survey({ opensAt: at(hour) }) });
    expect(target.querySelector("input")).toBeNull();
    expect(target.querySelector(".kv-closed")?.textContent).toBe("This survey isn't open yet.");
  });

  it("uses the survey's closedMessage, in the respondent's language", () => {
    const target = document.createElement("div");
    mountSurvey(target, { survey: survey({ closesAt: at(-hour), closedMessage: { en: "Closed for the season.", de: "Saisonpause." } }), locale: "de" });
    expect(target.querySelector(".kv-closed")?.textContent).toBe("Saisonpause.");
  });

  it("remembers a response in this browser for oneResponsePer: browser, and sends a browserId", async () => {
    const storage = memoryStorage();
    const model = createSurvey({ survey: survey({ oneResponsePer: "browser" }), storage });
    model.setValue("name", "Ana");
    const result = await model.complete();
    expect(result?.response.meta?.browserId).toMatch(/^[0-9a-f]{36}$/);
    const target = document.createElement("div");
    mountSurvey(target, { survey: survey({ oneResponsePer: "browser" }) });
    expect(target.querySelector(".kv-closed")?.textContent).toBe("You have already answered this survey. Thank you!");
    // Other surveys, and surveys without the limit, are not affected.
    expect(createSurvey({ survey: survey({}) }).snapshot.status).toBe("running");
  });

  it("shows the closed state when the server refuses a submission as full", async () => {
    const storage = { ...memoryStorage(), saveResponse: async () => Promise.reject(new HttpStorageError(409, { error: "Full", reason: "full" })) };
    const target = document.createElement("div");
    const { model } = mountSurvey(target, { survey: survey({ maxResponses: 1 }), storage });
    model.setValue("name", "Ana");
    expect(await model.complete()).toBeNull();
    expect(model.snapshot).toMatchObject({ status: "closed", closedReason: "full", submitError: null });
    expect(target.querySelector(".kv-closed")?.textContent).toBe("This survey has all the responses it needs. Thank you!");
  });
});
