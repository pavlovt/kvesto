// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createSurvey, localStorageStorage, memoryStorage, migrateSurvey, validateAnswers } from "../src/index.js";

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "long",
  title: "Long",
  pages: [
    { id: "p1", elements: [{ id: "name", type: "text", title: "Name", required: true }] },
    { id: "p2", elements: [{ id: "age", type: "rating", title: "Age", min: 1, max: 5, required: true }] },
  ],
});
const tick = () => new Promise((r) => setTimeout(r, 5));

describe("saving progress and resuming", () => {
  for (const [name, make] of [
    ["memoryStorage", () => memoryStorage([survey])],
    ["localStorageStorage", () => localStorageStorage({ prefix: `t${Math.random()}` })],
  ] as const) {
    it(`saves after a page change and resumes with ${name}`, async () => {
      const storage = make();
      const tokens: string[] = [];
      const model = createSurvey({ survey, storage, onProgress: (t) => tokens.push(t) });
      model.setValue("name", "Ana");
      model.next();
      await tick();
      expect(tokens).toHaveLength(1);
      // Later saves update the same draft.
      model.setValue("age", 3);
      expect(await model.saveProgress()).toBe(tokens[0]);

      const draft = await storage.loadProgress(survey.id, tokens[0]!);
      expect(draft).toMatchObject({ answers: { name: "Ana", age: 3 }, pageIndex: 1 });
      const again = createSurvey({ survey, storage, resume: draft! });
      expect(again.snapshot.page.id).toBe("p2");
      expect(again.getValue("name")).toBe("Ana");
      expect(again.resumeToken).toBe(tokens[0]);
      await again.complete();
      // Completing clears the draft.
      expect(await storage.loadProgress(survey.id, tokens[0]!)).toBeNull();
      expect(await storage.listResponses(survey.id)).toHaveLength(1);
    });
  }

  it("does nothing without a storage that can save progress, or when turned off", async () => {
    expect(await createSurvey({ survey }).saveProgress()).toBeUndefined();
    const storage = memoryStorage([survey]);
    const model = createSurvey({ survey, storage, autoSaveProgress: false, initialAnswers: { name: "x" } });
    model.next();
    await tick();
    expect(model.resumeToken).toBeUndefined();
  });

  it("validates partial answers without requiring anything", () => {
    expect(validateAnswers(survey, {}, { partial: true }).issues).toEqual([]);
    expect(validateAnswers(survey, { age: 9 }, { partial: true }).issues[0]!.questionId).toBe("age");
  });
});
