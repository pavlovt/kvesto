import { describe, expect, it } from "vitest";
import { SurveySchema, summarizeResponses, type SurveyResponse } from "../src/index.js";
import { feedbackSurvey } from "./fixtures.js";

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
