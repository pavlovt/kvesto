import { describe, expect, it, vi } from "vitest";
import { createSurvey, loadSurvey, memoryStorage, SurveySchema } from "../src/index.js";
import { feedbackSurvey } from "./fixtures.js";

describe("SurveyModel without storage", () => {
  it("validates pages and blocks navigation on errors", () => {
    const model = createSurvey({ survey: feedbackSurvey });
    expect(model.next()).toBe(false);
    expect(model.snapshot.errors.email).toMatch(/required/);

    model.setValue("email", "not-an-email");
    expect(model.next()).toBe(false);
    expect(model.snapshot.errors.email).toMatch(/valid email/);

    model.setValue("email", "a@b.co");
    expect(model.next()).toBe(true);
    expect(model.snapshot.pageIndex).toBe(1);
    expect(model.snapshot.isLastPage).toBe(true);
  });

  it("returns the response through onComplete", async () => {
    const onComplete = vi.fn();
    const model = createSurvey({ survey: feedbackSurvey, onComplete, meta: { source: "test" } });
    model.setValue("email", "a@b.co");
    model.setValue("score", 9);
    const result = await model.complete();

    expect(result?.saved).toBeUndefined();
    expect(onComplete).toHaveBeenCalledWith({
      surveyId: "feedback",
      response: { answers: { email: "a@b.co", score: 9 }, meta: { source: "test" } },
    });
    expect(model.snapshot.status).toBe("completed");
  });

  it("rejects out-of-range ratings", async () => {
    const model = createSurvey({ survey: feedbackSurvey, initialAnswers: { email: "a@b.co", score: 11 } });
    expect(await model.complete()).toBeNull();
    expect(model.snapshot.pageIndex).toBe(1);
    expect(model.snapshot.errors.score).toMatch(/0 to 10/);
  });

  it("notifies subscribers like a Svelte store", () => {
    const model = createSurvey({ survey: feedbackSurvey });
    const seen: number[] = [];
    const off = model.subscribe((s) => seen.push(Object.keys(s.answers).length));
    model.setValue("role", "dev");
    off();
    model.setValue("email", "x@y.z");
    expect(seen).toEqual([0, 1]);
  });

  it("throws on invalid survey JSON", () => {
    expect(() => createSurvey({ survey: { title: "x" } })).toThrow();
  });
});

describe("SurveyModel with storage", () => {
  it("saves the response through the adapter", async () => {
    const storage = memoryStorage([SurveySchema.parse(feedbackSurvey)]);
    const model = await loadSurvey("feedback", { storage });
    model.setValue("email", "a@b.co");
    model.setValue("score", 7);
    const result = await model.complete();

    expect(result?.saved?.id).toBeTruthy();
    const stored = await storage.listResponses("feedback");
    expect(stored).toHaveLength(1);
    expect(stored[0]!.answers).toEqual({ email: "a@b.co", score: 7 });
  });

  it("surfaces storage errors and lets the respondent retry", async () => {
    const storage = memoryStorage();
    let fail = true;
    const flaky = {
      ...storage,
      saveResponse: async (...args: Parameters<typeof storage.saveResponse>) => {
        if (fail) throw new Error("offline");
        return storage.saveResponse(...args);
      },
    };
    const model = createSurvey({ survey: feedbackSurvey, storage: flaky, initialAnswers: { email: "a@b.co", score: 1 } });
    expect(await model.complete()).toBeNull();
    expect(model.snapshot.submitError).toBe("offline");
    fail = false;
    expect(await model.complete()).not.toBeNull();
  });
});
