import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiKeyAuth, createApp, createSqliteDb, drizzleRepository, openAccess, type KvestoAction } from "../src/index.js";

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
  app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: openAccess });
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

describe("panels", () => {
  it("stores surveys with panels and validates answers inside visible panels", async () => {
    const grouped = {
      schemaVersion: 1,
      id: "grouped",
      title: "Grouped",
      pages: [
        {
          id: "p1",
          elements: [
            { id: "pet", type: "boolean", title: "Pet?" },
            {
              id: "about",
              type: "panel",
              title: "About the pet",
              visibleIf: { question: "pet", op: "eq", value: true },
              elements: [{ id: "name", type: "text", title: "Name", required: true }],
            },
          ],
        },
      ],
    };
    expect((await send("POST", "/surveys", grouped)).status).toBe(201);
    expect(await (await send("GET", "/surveys/grouped")).json()).toEqual(grouped);
    expect((await send("POST", "/surveys/grouped/responses", { answers: { pet: true } })).status).toBe(400);
    const ok = await send("POST", "/surveys/grouped/responses", { answers: { pet: false, name: "ignored" } });
    expect(ok.status).toBe(201);
    expect((await ok.json()).answers).toEqual({ pet: false });
    const doc = await (await send("GET", "/openapi.json")).json();
    expect(doc.components.schemas.Panel).toBeDefined();
  });
});

describe("repeating panels", () => {
  it("validates items and stores them under the panel id", async () => {
    const family = {
      schemaVersion: 1,
      id: "family",
      title: "Family",
      pages: [
        {
          id: "p1",
          elements: [
            {
              id: "kids",
              type: "panel",
              repeat: { min: 1, max: 2 },
              elements: [
                { id: "name", type: "text", title: "Name", required: true },
                { id: "age", type: "rating", title: "Age", min: 0, max: 18 },
              ],
            },
          ],
        },
      ],
    };
    expect((await send("POST", "/surveys", family)).status).toBe(201);
    const bad = await send("POST", "/surveys/family/responses", { answers: { kids: [{ age: 3 }] } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).issues).toEqual([{ path: ["answers", "kids", 0, "name"], message: "This question is required." }]);
    const ok = await send("POST", "/surveys/family/responses", { answers: { kids: [{ name: "Ana", age: 7 }, { name: "Ivo" }] } });
    expect(ok.status).toBe(201);
    expect((await ok.json()).answers).toEqual({ kids: [{ name: "Ana", age: 7 }, { name: "Ivo" }] });
  });
});

describe("validators", () => {
  const signup = {
    schemaVersion: 1,
    id: "signup",
    title: "Signup",
    pages: [
      {
        id: "p1",
        elements: [
          { id: "nick", type: "text", title: "Nick", validators: [{ type: "length", min: 3, message: "At least 3" }] },
          { id: "invite", type: "text", title: "Invite code", validators: [{ type: "custom", name: "invite" }] },
        ],
      },
    ],
  };

  it("rejects responses that break a validator, with its message", async () => {
    app = createApp({
      repository: drizzleRepository(createSqliteDb(":memory:")),
      authorize: openAccess,
      validators: { invite: (v) => v === "KV-1" || "Unknown invite code" },
    });
    expect((await send("POST", "/surveys", signup)).status).toBe(201);
    const bad = await send("POST", "/surveys/signup/responses", { answers: { nick: "ab", invite: "nope" } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).issues).toEqual([
      { path: ["answers", "nick"], message: "At least 3" },
      { path: ["answers", "invite"], message: "Unknown invite code" },
    ]);
    expect((await send("POST", "/surveys/signup/responses", { answers: { nick: "abc", invite: "KV-1" } })).status).toBe(201);
  });

  it("refuses answers to custom validators the server doesn't know", async () => {
    expect((await send("POST", "/surveys", signup)).status).toBe(201);
    const res = await send("POST", "/surveys/signup/responses", { answers: { invite: "KV-1" } });
    expect(res.status).toBe(400);
  });

  it("rejects surveys with invalid validators", async () => {
    const broken = structuredClone(signup);
    (broken.pages[0]!.elements[0] as { validators: unknown[] }).validators = [{ type: "pattern", pattern: "(" }];
    expect((await send("POST", "/surveys", broken)).status).toBe(400);
  });
});

describe("access control", () => {
  const KEY = "s3cret-key";
  const authed = (method: string, path: string, body?: unknown, key?: string) =>
    app.request(path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const upload = (key?: string) => {
    const form = new FormData();
    form.set("questionId", "shot");
    form.set("file", new File([new Uint8Array(10)], "a.png", { type: "image/png" }));
    return app.request("/surveys/uploads/files", { method: "POST", body: form, headers: key ? { authorization: `Bearer ${key}` } : {} });
  };

  beforeEach(async () => {
    app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: apiKeyAuth({ keys: [KEY] }) });
    expect((await authed("POST", "/surveys", survey, KEY)).status).toBe(201);
    expect((await authed("POST", "/surveys", uploads, KEY)).status).toBe(201);
  });

  it("keeps the respondent routes public", async () => {
    expect((await authed("GET", "/surveys/feedback")).status).toBe(200);
    expect((await authed("POST", "/surveys/feedback/responses", { answers: { email: "a@b.co" } })).status).toBe(201);
    const up = await upload();
    expect(up.status).toBe(201);
    const { url } = await up.json();
    expect((await app.request(new URL(url).pathname)).status).toBe(200);
    expect((await authed("GET", "/health")).status).toBe(200);
    expect((await authed("GET", "/openapi.json")).status).toBe(200);
  });

  it("needs a key to list, edit or delete surveys and to read responses", async () => {
    const admin: [string, string, unknown?][] = [
      ["GET", "/surveys"],
      ["POST", "/surveys", { ...survey, id: "other" }],
      ["PUT", "/surveys/feedback", survey],
      ["GET", "/surveys/feedback/responses"],
      ["DELETE", "/surveys/feedback"],
    ];
    for (const [method, path, body] of admin) {
      const none = await authed(method, path, body);
      expect(none.status, `${method} ${path}`).toBe(401);
      expect(none.headers.get("www-authenticate")).toMatch(/^Bearer/);
      expect((await authed(method, path, body, "wrong")).status, `${method} ${path}`).toBe(401);
    }
    // Nothing changed while refused.
    expect((await authed("GET", "/surveys", undefined, KEY)).status).toBe(200);
    expect((await authed("GET", "/surveys/feedback")).status).toBe(200);
    for (const [method, path, body] of admin) {
      expect((await authed(method, path, body, KEY)).status, `${method} ${path}`).toBeLessThan(300);
    }
  });

  it("can lock down the respondent routes too", async () => {
    app = createApp({
      repository: drizzleRepository(createSqliteDb(":memory:")),
      authorize: apiKeyAuth({ keys: [KEY], publicActions: [] }),
    });
    expect((await authed("POST", "/surveys", uploads, KEY)).status).toBe(201);
    expect((await authed("GET", "/surveys/uploads")).status).toBe(401);
    expect((await upload()).status).toBe(401);
    expect((await upload(KEY)).status).toBe(201);
  });

  it("asks a custom authorize function about each action, with the survey id", async () => {
    const seen: string[] = [];
    app = createApp({
      repository: drizzleRepository(createSqliteDb(":memory:")),
      authorize: (_c, { action, surveyId }) => {
        seen.push(`${action}:${surveyId ?? "-"}`);
        return action !== ("response:read" satisfies KvestoAction);
      },
    });
    await authed("POST", "/surveys", survey);
    await authed("GET", "/surveys/feedback");
    expect((await authed("GET", "/surveys/feedback/responses")).status).toBe(403);
    expect(seen).toEqual(["survey:write:-", "survey:read:feedback", "response:read:feedback"]);
  });

  it("warns when no authorize option is given", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createApp({ repository: drizzleRepository(createSqliteDb(":memory:")) });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/authorize/));
    warn.mockClear();
    createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: openAccess });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejects an empty key list", () => {
    expect(() => apiKeyAuth({ keys: ["", ""] })).toThrow(/at least one/);
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
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(doc.paths["/surveys"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.paths["/surveys/{id}/responses"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.paths["/surveys/{id}/responses"].post.security).toBeUndefined();
    expect(doc.paths["/surveys/{id}"].get.security).toBeUndefined();
  });

  it("serves the interactive docs UI", async () => {
    const res = await send("GET", "/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });
});

describe("expressions", () => {
  const exprSurvey = {
    schemaVersion: 1,
    id: "expr",
    title: "Expressions",
    pages: [
      {
        id: "p1",
        elements: [
          { id: "age", type: "text", inputType: "number", title: "Age" },
          { id: "vat", type: "text", title: "VAT", required: true, visibleIf: { expr: "adult({age}) and {age} < 100" } },
        ],
      },
    ],
  };
  const functions = { adult: (age: unknown) => Number(age) >= 18 };

  it("refuses a survey that calls a function the server does not have", async () => {
    const res = await send("POST", "/surveys", exprSurvey);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('Unknown expression function \\"adult\\"');
    expect((await send("PUT", "/surveys/expr", exprSurvey)).status).toBe(400);
  });

  it("refuses an expression that does not parse", async () => {
    const res = await send("POST", "/surveys", { ...exprSurvey, pages: [{ id: "p1", elements: [{ id: "a", type: "text", title: "A", visibleIf: { expr: "{a" } }] }] });
    expect(res.status).toBe(400);
  });

  it("validates responses with registered functions", async () => {
    app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: openAccess, functions });
    expect((await send("POST", "/surveys", exprSurvey)).status).toBe(201);
    expect((await send("POST", "/surveys/expr/responses", { answers: { age: "30" } })).status).toBe(400);
    expect((await send("POST", "/surveys/expr/responses", { answers: { age: "12", vat: "x" } })).status).toBe(201);
    const ok = await send("POST", "/surveys/expr/responses", { answers: { age: "30", vat: "BG1" } });
    expect(ok.status).toBe(201);
  });
});

describe("calculated values", () => {
  const calc = {
    schemaVersion: 1,
    id: "calc",
    title: "Calc",
    variables: [{ name: "total", expr: "{price} * {qty}" }],
    pages: [
      {
        id: "p1",
        elements: [
          { id: "price", type: "text", inputType: "number", title: "Price", readOnly: true, defaultValue: "5" },
          { id: "qty", type: "text", inputType: "number", title: "Qty" },
          { id: "sum", type: "computed", title: "Sum", expr: "{total}" },
        ],
      },
    ],
  };

  it("stores the recalculated value, not the one the client sent", async () => {
    expect((await send("POST", "/surveys", calc)).status).toBe(201);
    const res = await send("POST", "/surveys/calc/responses", { answers: { price: "5", qty: "3", sum: 1 } });
    expect(res.status).toBe(201);
    expect((await res.json()).answers).toEqual({ price: "5", qty: "3", sum: 15 });
  });

  it("refuses a changed read-only answer", async () => {
    await send("POST", "/surveys", calc);
    const res = await send("POST", "/surveys/calc/responses", { answers: { price: "1", qty: "3" } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain("can't be changed");
  });

  it("refuses a variable cycle", async () => {
    const bad = { ...calc, id: "cyc", variables: [{ name: "a1", expr: "{b1}" }, { name: "b1", expr: "{a1}" }] };
    expect((await send("POST", "/surveys", bad)).status).toBe(400);
  });
});
