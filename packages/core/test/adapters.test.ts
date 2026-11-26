import { describe, expect, it } from "vitest";
import { httpStorage, HttpStorageError, localStorageStorage, memoryStorage, SurveySchema } from "../src/index.js";
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

describe("file uploads through adapters", () => {
  const file = new File(["hi"], "note.txt", { type: "text/plain" });

  it("memoryStorage and localStorageStorage embed files as data URLs", async () => {
    for (const storage of [memoryStorage(), localStorageStorage({ storage: new MemoryWebStorage() })]) {
      expect(await storage.uploadFile("s", "q", file)).toEqual({
        name: "note.txt",
        type: "text/plain",
        size: 2,
        url: "data:text/plain;base64,aGk=",
      });
    }
  });

  it("httpStorage posts multipart form data", async () => {
    let seen: { url: string; body: unknown; headers: Record<string, string> } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, body: init.body, headers: init.headers as Record<string, string> };
      return Response.json({ name: "note.txt", type: "text/plain", size: 2, url: "https://api.test/f/1" }, { status: 201 });
    }) as typeof fetch;
    const storage = httpStorage({ baseUrl: "https://api.test", fetch: fakeFetch });
    const result = await storage.uploadFile("feedback", "attachment", file);
    expect(result.url).toBe("https://api.test/f/1");
    expect(seen!.url).toBe("https://api.test/surveys/feedback/files");
    expect(seen!.headers["content-type"]).toBeUndefined();
    const form = seen!.body as FormData;
    expect(form.get("questionId")).toBe("attachment");
    expect((form.get("file") as File).name).toBe("note.txt");
  });
});
