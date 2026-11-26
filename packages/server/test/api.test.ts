import { beforeEach, describe, expect, it } from "vitest";
import { createApp, createSqliteDb, drizzleRepository } from "../src/index.js";

const survey = {
  schemaVersion: 1,
  id: "feedback",
  title: "Product feedback",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "email", type: "text", inputType: "email", title: "Email", required: true },
        { id: "score", type: "rating", title: "Score", min: 0, max: 10 },
      ],
    },
  ],
};

let app: ReturnType<typeof createApp>;

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });

beforeEach(() => {
  app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")) });
});

describe("surveys", () => {
  it("creates, reads, lists, replaces and deletes a survey", async () => {
    expect((await send("POST", "/surveys", survey)).status).toBe(201);
    expect((await send("POST", "/surveys", survey)).status).toBe(409);

    const got = await send("GET", "/surveys/feedback");
    expect(got.status).toBe(200);
    expect((await got.json()).title).toBe("Product feedback");

    const put = await send("PUT", "/surveys/feedback", { ...survey, title: "Renamed" });
    expect(put.status).toBe(200);

    const list = await (await send("GET", "/surveys")).json();
    expect(list.items).toMatchObject([{ id: "feedback", title: "Renamed", responseCount: 0 }]);

    expect((await send("DELETE", "/surveys/feedback")).status).toBe(204);
    expect((await send("GET", "/surveys/feedback")).status).toBe(404);
    expect((await send("DELETE", "/surveys/feedback")).status).toBe(404);
  });

  it("rejects invalid survey JSON with a list of issues", async () => {
    const res = await send("POST", "/surveys", { ...survey, pages: [] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.issues[0].path).toEqual(["pages"]);
  });

  it("rejects a PUT whose body id differs from the path", async () => {
    expect((await send("PUT", "/surveys/other", survey)).status).toBe(400);
  });
});

describe("responses", () => {
  beforeEach(async () => {
    await send("POST", "/surveys", survey);
  });

  it("stores valid responses and lists them with pagination", async () => {
    for (const score of [3, 9]) {
      const res = await send("POST", "/surveys/feedback/responses", { answers: { email: "a@b.co", score } });
      expect(res.status).toBe(201);
      expect((await res.json()).id).toBeTruthy();
    }
    const page = await (await send("GET", "/surveys/feedback/responses?limit=1")).json();
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);

    const list = await (await send("GET", "/surveys")).json();
    expect(list.items[0].responseCount).toBe(2);
  });

  it("validates answers against the survey with the core rules", async () => {
    const res = await send("POST", "/surveys/feedback/responses", { answers: { score: 42, extra: "x" } });
    expect(res.status).toBe(400);
    const { issues } = await res.json();
    expect(issues.map((i: { path: string[] }) => i.path.join("."))).toEqual(
      expect.arrayContaining(["answers.extra", "answers.email", "answers.score"]),
    );
  });

  it("returns 404 for unknown surveys", async () => {
    expect((await send("POST", "/surveys/nope/responses", { answers: {} })).status).toBe(404);
    expect((await send("GET", "/surveys/nope/responses")).status).toBe(404);
  });

  it("deletes responses with their survey", async () => {
    await send("POST", "/surveys/feedback/responses", { answers: { email: "a@b.co" } });
    await send("DELETE", "/surveys/feedback");
    await send("POST", "/surveys", survey);
    expect((await (await send("GET", "/surveys/feedback/responses")).json()).total).toBe(0);
  });
});

describe("documentation", () => {
  it("serves an OpenAPI 3.1 document covering every route", async () => {
    const res = await send("GET", "/openapi.json");
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual(
      ["/health", "/surveys", "/surveys/{id}", "/surveys/{id}/responses"].sort(),
    );
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(["Survey", "ResponseInput", "SurveyResponse", "Error"]),
    );
  });

  it("serves the interactive docs UI", async () => {
    const res = await send("GET", "/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });
});
