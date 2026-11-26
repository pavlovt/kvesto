import { describe, expect, it } from "vitest";
import { SurveySchema, summarizeResponses, type SurveyResponse } from "../src/index.js";
import { advancedSurvey, feedbackSurvey } from "./fixtures.js";

const r = (answers: SurveyResponse["answers"], i: number): SurveyResponse => ({
  id: String(i),
  surveyId: "feedback",
  createdAt: new Date(i).toISOString(),
  answers,
});

describe("summarizeResponses", () => {
  it("counts choices, averages ratings and samples text", () => {
    const survey = SurveySchema.parse(feedbackSurvey);
    const summary = summarizeResponses(survey, [
      r({ email: "a@x.io", role: "dev", score: 8 }, 1),
      r({ email: "b@x.io", role: "dev", score: 10, comment: "Great" }, 2),
      r({ email: "c@x.io", role: "pm" }, 3),
    ]);
    const byId = Object.fromEntries(summary.map((s) => [s.question.id, s]));

    expect(byId.role!.counts).toEqual([
      { value: "dev", label: "Developer", count: 2 },
      { value: "pm", label: "Product manager", count: 1 },
    ]);
    expect(byId.score!.answered).toBe(2);
    expect(byId.score!.average).toBe(9);
    expect(byId.comment!.samples).toEqual(["Great"]);
  });
});

describe("summarizeResponses for new types", () => {
  it("counts matrix cells, averages ranks and lists files", () => {
    const survey = SurveySchema.parse(advancedSurvey);
    const file = { name: "a.png", type: "image/png", size: 3, url: "u" };
    const summary = summarizeResponses(survey, [
      r({ role: "dev", quality: { speed: "good", support: "ok" }, priorities: ["speed", "docs", "price"], screenshot: [file] }, 1),
      r({ role: "dev", quality: { speed: "good" }, priorities: ["docs", "speed", "price"] }, 2),
      r({ role: "dev", quality: { speed: "poor" }, priorities: ["speed", "price", "docs"], screenshot: [file, file] }, 3),
    ]);
    const byId = Object.fromEntries(summary.map((s) => [s.question.id, s]));

    expect(byId.quality!.matrix![0]).toEqual({
      value: "speed",
      label: "Speed",
      answered: 3,
      counts: [
        { value: "poor", label: "Poor", count: 1 },
        { value: "ok", label: "OK", count: 0 },
        { value: "good", label: "Good", count: 2 },
      ],
    });
    expect(byId.quality!.matrix![1]!.answered).toBe(1);

    const ranking = byId.priorities!.ranking!;
    expect(ranking.map((x) => x.value)).toEqual(["speed", "docs", "price"]);
    expect(ranking[0]).toMatchObject({ averageRank: 4 / 3, firstPlace: 2 });

    expect(byId.screenshot!.fileCount).toBe(3);
    expect(byId.screenshot!.answered).toBe(2);
  });
});
