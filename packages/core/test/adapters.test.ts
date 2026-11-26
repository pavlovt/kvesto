import { describe, expect, it } from "vitest";
import { httpStorage, HttpStorageError, localStorageStorage, SurveySchema } from "../src/index.js";
import { feedbackSurvey } from "./fixtures.js";

class MemoryWebStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

const survey = SurveySchema.parse(feedbackSurvey);

describe("localStorageStorage", () => {
  it("round-trips surveys and responses", async () => {
    const storage = localStorageStorage({ storage: new MemoryWebStorage() });
    await storage.saveSurvey(survey);
    expect((await storage.loadSurvey("feedback"))?.title).toBe("Product feedback");
    await storage.saveResponse("feedback", { answers: { score: 5 } });
    expect(await storage.listSurveys()).toEqual([{ id: "feedback", title: "Product feedback", responseCount: 1 }]);
    await storage.deleteSurvey("feedback");
    expect(await storage.loadSurvey("feedback")).toBeNull();
    expect(await storage.listSurveys()).toEqual([]);
  });
});

describe("httpStorage", () => {
  it("maps calls to the REST contract", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      if (url.endsWith("/surveys/missing")) return new Response(null, { status: 404 });
      if (url.endsWith("/responses") && init.method === "POST") {
        return Response.json({ id: "r1", surveyId: "feedback", createdAt: "now", ...JSON.parse(String(init.body)) }, { status: 201 });
      }
      if (url.endsWith("/surveys")) return Response.json({ items: [] });
      return Response.json({ error: "boom" }, { status: 500 });
    }) as typeof fetch;

    const storage = httpStorage({ baseUrl: "https://api.test/v1/", fetch: fakeFetch });
    expect(await storage.loadSurvey("missing")).toBeNull();
    expect(await storage.listSurveys()).toEqual([]);
    expect((await storage.saveResponse("feedback", { answers: { score: 1 } })).id).toBe("r1");
    await expect(storage.saveSurvey(survey)).rejects.toBeInstanceOf(HttpStorageError);

    expect(calls).toEqual([
      "GET https://api.test/v1/surveys/missing",
      "GET https://api.test/v1/surveys",
      "POST https://api.test/v1/surveys/feedback/responses",
      "PUT https://api.test/v1/surveys/feedback",
    ]);
  });
});
