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

const uploads = {
  schemaVersion: 1,
  id: "uploads",
  title: "Uploads",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "kind", type: "single-choice", title: "Kind", choices: [{ value: "bug", label: "Bug" }, { value: "idea", label: "Idea" }] },
        {
          id: "shot",
          type: "file",
          title: "Screenshot",
          accept: ["image/*"],
          maxSize: 1000,
          visibleIf: { question: "kind", op: "eq", value: "bug" },
          required: true,
        },
        { id: "note", type: "text", title: "Note" },
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

describe("conditional logic in responses", () => {
  beforeEach(async () => {
    await send("POST", "/surveys", uploads);
  });

  it("requires visible questions and drops answers to hidden ones", async () => {
    const bug = await send("POST", "/surveys/uploads/responses", { answers: { kind: "bug" } });
    expect(bug.status).toBe(400);
    expect((await bug.json()).issues[0].path).toEqual(["answers", "shot"]);

    const idea = await send("POST", "/surveys/uploads/responses", {
      answers: { kind: "idea", shot: [{ name: "x.png", type: "image/png", size: 1, url: "u" }], note: "hi" },
    });
    expect(idea.status).toBe(201);
    expect((await idea.json()).answers).toEqual({ kind: "idea", note: "hi" });
  });

  it("rejects surveys whose conditions point forward", async () => {
    const bad = structuredClone(uploads) as any;
    bad.id = "bad";
    bad.pages[0].elements[0].visibleIf = { question: "note", op: "notEmpty" };
    const res = await send("POST", "/surveys", bad);
    expect(res.status).toBe(400);
    expect((await res.json()).issues[0].message).toMatch(/earlier question/);
  });
});

describe("files", () => {
  const upload = (questionId: string, file: File, surveyId = "uploads") => {
    const form = new FormData();
    form.set("questionId", questionId);
    form.set("file", file);
    return app.request(`http://kvesto.test/surveys/${surveyId}/files`, { method: "POST", body: form });
  };
  const png = (size = 10, name = "shot.png") => new File([new Uint8Array(size).fill(7)], name, { type: "image/png" });

  beforeEach(async () => {
    await send("POST", "/surveys", uploads);
  });

  it("stores a file, returns its answer entry and serves it back", async () => {
    const res = await upload("shot", png());
    expect(res.status).toBe(201);
    const entry = await res.json();
    expect(entry).toMatchObject({ name: "shot.png", type: "image/png", size: 10 });
    expect(entry.url).toMatch(/^http:\/\/kvesto\.test\/surveys\/uploads\/files\/[\w-]+$/);

    const got = await app.request(entry.url);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array(10).fill(7));

    const saved = await send("POST", "/surveys/uploads/responses", { answers: { kind: "bug", shot: [entry] } });
    expect(saved.status).toBe(201);
  });

  it("serves risky types as downloads", async () => {
    const html = { ...uploads, id: "any", pages: [{ id: "p", elements: [{ id: "f", type: "file", title: "F" }] }] };
    await send("POST", "/surveys", html);
    const entry = await (await upload("f", new File(["<script>"], "x.html", { type: "text/html" }), "any")).json();
    const got = await app.request(entry.url);
    expect(got.headers.get("content-disposition")).toMatch(/^attachment/);
  });

  it("enforces the question's type and size rules", async () => {
    const wrongType = await upload("shot", new File(["x"], "a.txt", { type: "text/plain" }));
    expect(wrongType.status).toBe(400);
    expect((await wrongType.json()).error).toMatch(/not an accepted/);
    const tooBig = await upload("shot", png(2000));
    expect(tooBig.status).toBe(400);
    expect((await tooBig.json()).error).toMatch(/larger than/);
    expect((await upload("note", png())).status).toBe(400);
    expect((await upload("shot", png(), "nope")).status).toBe(404);
  });

  it("enforces the server-wide limit", async () => {
    app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), maxFileSize: 100 });
    const any = { ...uploads, id: "any", pages: [{ id: "p", elements: [{ id: "f", type: "file", title: "F" }] }] };
    await send("POST", "/surveys", any);
    expect((await upload("f", png(500), "any")).status).toBe(413);
    expect((await upload("f", png(50), "any")).status).toBe(201);
  });

  it("returns 404 for unknown files and deletes files with their survey", async () => {
    expect((await send("GET", "/surveys/uploads/files/nope")).status).toBe(404);
    const entry = await (await upload("shot", png())).json();
    await send("DELETE", "/surveys/uploads");
    await send("POST", "/surveys", uploads);
    expect((await app.request(entry.url)).status).toBe(404);
  });
});

describe("documentation", () => {
  it("serves an OpenAPI 3.1 document covering every route", async () => {
    const res = await send("GET", "/openapi.json");
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths).sort()).toEqual(
      [
        "/health",
        "/surveys",
        "/surveys/{id}",
        "/surveys/{id}/responses",
        "/surveys/{id}/files",
        "/surveys/{id}/files/{fileId}",
      ].sort(),
    );
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(["Survey", "ResponseInput", "SurveyResponse", "Error", "Condition", "FileAnswer", "FileUpload"]),
    );
    const upload = doc.paths["/surveys/{id}/files"].post.requestBody.content["multipart/form-data"];
    expect(upload.schema.$ref).toBe("#/components/schemas/FileUpload");
    expect(doc.components.schemas.FileUpload.properties.file).toMatchObject({ type: "string", format: "binary" });
  });

  it("serves the interactive docs UI", async () => {
    const res = await send("GET", "/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });
});
