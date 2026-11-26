import { describe, expect, it, vi } from "vitest";
import { createSurvey, loadSurvey, memoryStorage, SurveySchema } from "../src/index.js";
import { advancedSurvey, feedbackSurvey } from "./fixtures.js";

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

describe("SurveyModel with conditional logic", () => {
  it("skips hidden pages, ignores hidden questions and drops their answers", async () => {
    const onComplete = vi.fn();
    const model = createSurvey({ survey: advancedSurvey, onComplete });
    model.setValue("role", "dev");
    expect(model.isVisible("stack")).toBe(true);
    expect(model.next()).toBe(false);
    expect(model.snapshot.errors.stack).toMatch(/required/);

    model.setValue("stack", "svelte");
    model.setValue("role", "pm");
    // Stack is hidden again, so the page is valid and the dev page is skipped.
    expect(model.snapshot.questions.map((q) => q.id)).toEqual(["role", "quality", "why"]);
    expect(model.snapshot.pages.map((p) => p.id)).toEqual(["start", "end"]);
    expect(model.next()).toBe(true);
    expect(model.snapshot.page.id).toBe("end");
    expect(model.snapshot.isLastPage).toBe(true);
    expect(model.prev()).toBe(true);
    expect(model.snapshot.page.id).toBe("start");

    model.next();
    const result = await model.complete();
    expect(result?.response.answers).toEqual({ role: "pm" });
    // The hidden answer is kept in state in case the respondent changes their mind.
    expect(model.snapshot.answers.stack).toBe("svelte");
  });

  it("enforces requiredIf", () => {
    const model = createSurvey({ survey: advancedSurvey, initialAnswers: { role: "pm" } });
    model.setValue("quality", { speed: "poor" });
    expect(model.isRequired("why")).toBe(true);
    expect(model.next()).toBe(false);
    expect(model.snapshot.errors.why).toMatch(/required/);
    model.setValue("quality", { speed: "good" });
    expect(model.next()).toBe(true);
  });
});

describe("SurveyModel file uploads", () => {
  const png = (name = "a.png", size = 10) => new File([new Uint8Array(size)], name, { type: "image/png" });

  it("embeds files as data URLs without a storage adapter", async () => {
    const model = createSurvey({ survey: advancedSurvey });
    expect(await model.addFiles("screenshot", [png()])).toBe(true);
    const [file] = model.getValue("screenshot") as { name: string; url: string; size: number }[];
    expect(file!.name).toBe("a.png");
    expect(file!.size).toBe(10);
    expect(file!.url).toMatch(/^data:image\/png;base64,/);
    model.removeFile("screenshot", 0);
    expect(model.getValue("screenshot")).toBeUndefined();
  });

  it("uses the adapter's uploadFile and tracks progress", async () => {
    let release!: () => void;
    const uploadFile = vi.fn(
      (_s: string, _q: string, f: File) =>
        new Promise<{ name: string; type: string; size: number; url: string }>((resolve) => {
          release = () => resolve({ name: f.name, type: f.type, size: f.size, url: `https://files.test/${f.name}` });
        }),
    );
    const model = createSurvey({ survey: advancedSurvey, storage: { ...memoryStorage(), uploadFile } });
    const pending = model.addFiles("screenshot", [png("b.png")]);
    await Promise.resolve();
    expect(model.snapshot.uploading).toEqual(["screenshot"]);
    expect(await model.complete()).toBeNull();
    release();
    expect(await pending).toBe(true);
    expect(uploadFile).toHaveBeenCalledWith("advanced", "screenshot", expect.any(File));
    expect(model.snapshot.uploading).toEqual([]);
    expect(model.getValue("screenshot")).toEqual([{ name: "b.png", type: "image/png", size: 10, url: "https://files.test/b.png" }]);
  });

  it("rejects files that break the question's rules before uploading", async () => {
    const uploadFile = vi.fn();
    const model = createSurvey({ survey: advancedSurvey, storage: { ...memoryStorage(), uploadFile } });
    expect(await model.addFiles("screenshot", [new File(["x"], "a.txt", { type: "text/plain" })])).toBe(false);
    expect(model.snapshot.errors.screenshot).toMatch(/not an accepted/);
    expect(await model.addFiles("screenshot", [png("big.png", 4096)])).toBe(false);
    expect(model.snapshot.errors.screenshot).toMatch(/larger than 1 KB/);
    expect(await model.addFiles("screenshot", [png(), png(), png()])).toBe(false);
    expect(model.snapshot.errors.screenshot).toMatch(/at most 2/);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("reports upload failures", async () => {
    const storage = { ...memoryStorage(), uploadFile: async () => Promise.reject(new Error("offline")) };
    const model = createSurvey({ survey: advancedSurvey, storage });
    expect(await model.addFiles("screenshot", [png()])).toBe(false);
    expect(model.snapshot.errors.screenshot).toBe("Upload failed: offline");
    expect(model.snapshot.uploading).toEqual([]);
  });
});
