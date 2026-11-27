import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiKeyAuth, createApp, createSqliteDb, drizzleRepository, openAccess, type KvestoAction } from "../src/index.js";
import { unregisterQuestionType } from "@kvesto/core";

/** `size` bytes that start with the PNG signature, so the server sees a real PNG. */
const pngBytes = (size: number) => {
  const bytes = new Uint8Array(size).fill(7);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].slice(0, size));
  return bytes;
};

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
  const png = (size = 10, name = "shot.png") => new File([pngBytes(size)], name, { type: "image/png" });

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
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(pngBytes(10));

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
    form.set("file", new File([pngBytes(10)], "a.png", { type: "image/png" }));
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
        "/s/{id}",
        "/s/embed.js",
        "/s/assets/{file}",
        "/surveys",
        "/surveys/{id}",
        "/surveys/{id}/responses",
        "/surveys/{id}/responses.csv",
        "/surveys/{id}/responses/{responseId}",
        "/surveys/{id}/responses/{responseId}/resume",
        "/surveys/{id}/responses/{responseId}/mine",
        "/surveys/{id}/responses/{responseId}/forget",
        "/surveys/{id}/responses/{responseId}/release",
        "/surveys/{id}/files",
        "/surveys/{id}/files/{fileId}",
        "/surveys/{id}/webhooks",
        "/surveys/{id}/webhooks/{webhookId}",
        "/surveys/{id}/webhooks/{webhookId}/deliveries",
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

describe("custom question types", () => {
  const stars = {
    schemaVersion: 1,
    id: "stars",
    title: "Stars",
    pages: [{ id: "p1", elements: [{ id: "s", type: "x-stars", title: "Stars", max: 3 }] }],
  };
  const starsType = {
    type: "x-stars" as const,
    validate: (q: { max?: unknown }, v: unknown) => (typeof v === "number" && v >= 1 && v <= Number(q.max) ? null : "Pick 1 to max stars."),
  };

  it("refuses a survey with an unknown type, then validates answers with the registered type", async () => {
    unregisterQuestionType("x-stars");
    const res = await send("POST", "/surveys", stars);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('unknown question type \\"x-stars\\"');

    app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: openAccess, questionTypes: [starsType] });
    expect((await send("POST", "/surveys", stars)).status).toBe(201);
    expect((await send("POST", "/surveys/stars/responses", { answers: { s: 5 } })).status).toBe(400);
    expect((await send("POST", "/surveys/stars/responses", { answers: { s: 2 } })).status).toBe(201);
    unregisterQuestionType("x-stars");
  });
});

describe("signatures", () => {
  it("uploads a signature as a PNG and accepts it in a response", async () => {
    const signed = {
      schemaVersion: 1,
      id: "signed",
      title: "Signed",
      pages: [{ id: "p1", elements: [{ id: "sig", type: "signature", title: "Sign", required: true }] }],
    };
    expect((await send("POST", "/surveys", signed)).status).toBe(201);
    const upload = (file: File) => {
      const form = new FormData();
      form.set("questionId", "sig");
      form.set("file", file);
      return app.request("http://kvesto.test/surveys/signed/files", { method: "POST", body: form });
    };
    expect((await upload(new File(["x"], "s.jpg", { type: "image/jpeg" }))).status).toBe(400);
    const res = await upload(new File([pngBytes(8)], "signature.png", { type: "image/png" }));
    expect(res.status).toBe(201);
    const entry = await res.json();
    expect((await send("POST", "/surveys/signed/responses", { answers: { sig: [entry] } })).status).toBe(201);
    expect((await app.request(entry.url)).headers.get("content-type")).toBe("image/png");
  });
});

describe("localized surveys", () => {
  const multi = {
    schemaVersion: 1,
    id: "multi",
    title: { en: "Feedback", de: "Rückmeldung" },
    locales: ["en", "de"],
    pages: [{ id: "p1", elements: [{ id: "name", type: "text", title: { en: "Name", de: "Name" }, required: true }] }],
  };

  it("stores every translation, lists the default title and answers in the respondent's language", async () => {
    expect((await send("POST", "/surveys", multi)).status).toBe(201);
    expect((await (await send("GET", "/surveys/multi")).json()).title).toEqual({ en: "Feedback", de: "Rückmeldung" });
    expect((await (await send("GET", "/surveys")).json()).items[0].title).toBe("Feedback");
    const res = await app.request("/surveys/multi/responses", {
      method: "POST",
      body: JSON.stringify({ answers: {} }),
      headers: { "content-type": "application/json", "accept-language": "de-AT,de;q=0.9,en;q=0.5" },
    });
    expect((await res.json()).issues[0].message).toBe("Diese Frage ist erforderlich.");
  });
});

describe("partial responses", () => {
  const patch = (rid: string, body: unknown) => send("PATCH", `/surveys/feedback/responses/${rid}`, body);
  beforeEach(async () => {
    await send("POST", "/surveys", survey);
  });

  it("saves progress without required answers and returns a resume token", async () => {
    const res = await send("POST", "/surveys/feedback/responses", { answers: { score: 7 }, status: "partial" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("partial");
    const [rid, secret] = body.resumeToken.split(".");
    expect(rid).toBe(body.id);
    expect(secret).toMatch(/^[\w-]{20,}$/);
    // Shapes are still checked.
    expect((await send("POST", "/surveys/feedback/responses", { answers: { score: 99 }, status: "partial" })).status).toBe(400);
  });

  it("updates, resumes and completes a partial response with its token, and only with it", async () => {
    const { id, resumeToken } = await (await send("POST", "/surveys/feedback/responses", { answers: { score: 7 }, status: "partial" })).json();
    expect((await patch(id, { token: `${id}.wrong`, answers: { score: 8 }, status: "partial" })).status).toBe(403);
    expect((await patch(id, { token: "other.secret", answers: { score: 8 }, status: "partial" })).status).toBe(403);
    expect((await patch(id, { answers: { score: 8 } })).status).toBe(400);

    const updated = await patch(id, { token: resumeToken, answers: { score: 8 }, status: "partial" });
    expect(updated.status).toBe(200);
    expect((await updated.json()).answers).toEqual({ score: 8 });

    const resumed = await send("POST", `/surveys/feedback/responses/${id}/resume`, { token: resumeToken });
    expect((await resumed.json()).answers).toEqual({ score: 8 });
    expect((await send("POST", `/surveys/feedback/responses/${id}/resume`, { token: `${id}.nope` })).status).toBe(403);

    // Completing checks everything, required answers included.
    expect((await patch(id, { token: resumeToken, answers: { score: 8 } })).status).toBe(400);
    const done = await patch(id, { token: resumeToken, answers: { score: 8, email: "a@b.co" } });
    expect(done.status).toBe(200);
    expect((await done.json()).status).toBe("complete");
    expect((await patch(id, { token: resumeToken, answers: { score: 1, email: "a@b.co" } })).status).toBe(409);
    expect((await send("POST", `/surveys/feedback/responses/${id}/resume`, { token: resumeToken })).status).toBe(409);
  });

  it("leaves partial responses out of lists and counts unless asked", async () => {
    await send("POST", "/surveys/feedback/responses", { answers: { score: 1 }, status: "partial" });
    await send("POST", "/surveys/feedback/responses", { answers: { email: "a@b.co", score: 2 } });
    const list = async (q = "") => (await send("GET", `/surveys/feedback/responses${q}`)).json();
    expect((await list()).total).toBe(1);
    expect((await list("?status=partial")).total).toBe(1);
    const all = await list("?status=all");
    expect(all.total).toBe(2);
    expect(all.items.map((r: { status: string }) => r.status).sort()).toEqual(["complete", "partial"]);
    expect(all.items.some((r: Record<string, unknown>) => "resumeToken" in r || "resumeTokenHash" in r)).toBe(false);
    expect((await (await send("GET", "/surveys")).json()).items[0].responseCount).toBe(1);
  });

  it("works end to end through httpStorage and the model", async () => {
    const { createSurvey, httpStorage } = await import("@kvesto/core");
    const storage = httpStorage({ baseUrl: "http://kvesto.test", fetch: (input, init) => app.request(String(input), init) });
    const twoPages = { ...survey, id: "two", pages: [survey.pages[0], { id: "p2", elements: [{ id: "more", type: "text", title: "More" }] }] };
    await send("POST", "/surveys", twoPages);
    const tokens: string[] = [];
    const model = createSurvey({ survey: twoPages, storage, onProgress: (t) => tokens.push(t) });
    model.setValue("email", "a@b.co");
    expect(model.next()).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    await model.saveProgress();
    expect(tokens.length).toBeGreaterThan(0);
    const draft = await storage.loadProgress("two", tokens.at(-1)!);
    expect(draft).toMatchObject({ answers: { email: "a@b.co" }, pageIndex: 1 });

    const again = createSurvey({ survey: twoPages, storage, resume: draft! });
    expect(again.snapshot.page.id).toBe("p2");
    again.setValue("more", "x");
    const result = await again.complete();
    expect(result!.saved!.status).toBe("complete");
    const all = await (await send("GET", "/surveys/two/responses?status=all")).json();
    expect(all.total).toBe(1);
    expect(all.items[0].answers).toEqual({ email: "a@b.co", more: "x" });
  });
});

describe("hidden fields", () => {
  const tracked = {
    schemaVersion: 1,
    id: "tracked",
    title: "Tracked",
    hiddenFields: ["source"],
    pages: [{ id: "p1", elements: [{ id: "code", type: "text", title: "Code", required: true, visibleIf: { question: "source", op: "eq", value: "promo" } }] }],
  };

  it("uses hidden values from meta.hidden in validation, keeps only declared ones, and filters by them", async () => {
    await send("POST", "/surveys", tracked);
    expect((await send("POST", "/surveys/tracked/responses", { answers: {}, meta: { hidden: { source: "promo" } } })).status).toBe(400);
    const ok = await send("POST", "/surveys/tracked/responses", { answers: { code: "X" }, meta: { hidden: { source: "promo", sneaky: "1" }, ua: "t" } });
    expect((await ok.json()).meta).toEqual({ hidden: { source: "promo" }, ua: "t" });
    await send("POST", "/surveys/tracked/responses", { answers: {}, meta: { hidden: { source: "ads" } } });
    await send("POST", "/surveys/tracked/responses", { answers: {} });
    const list = async (q: string) => (await (await send("GET", `/surveys/tracked/responses${q}`)).json()).total;
    expect(await list("")).toBe(3);
    expect(await list("?hidden=source:promo")).toBe(1);
    expect(await list("?hidden=source:ads")).toBe(1);
    expect(await list("?hidden=source:none")).toBe(0);
  });
});

describe("quizzes", () => {
  const quiz = {
    schemaVersion: 1,
    id: "quiz",
    title: "Quiz",
    settings: { quiz: { passMark: 0.5, releaseScores: "manual" } },
    pages: [
      {
        id: "p1",
        elements: [
          { id: "q1", type: "single-choice", title: "Q1", required: true, choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }], correctAnswer: "b" },
          { id: "q2", type: "text", title: "Q2", correctAnswer: "yes" },
        ],
      },
    ],
  };

  it("recalculates the score instead of trusting the client, and releases it by hand", async () => {
    await send("POST", "/surveys", quiz);
    const res = await send("POST", "/surveys/quiz/responses", { answers: { q1: "a", q2: "yes" }, meta: { quiz: { score: 99, max: 2, passed: true } } });
    const body = await res.json();
    expect(body.meta.quiz).toEqual({ score: 1, max: 2, passed: true, released: false });
    const released = await send("POST", `/surveys/quiz/responses/${body.id}/release`);
    expect((await released.json()).meta.quiz.released).toBe(true);
  });

  it("accepts a timed-out submission without required answers only when the survey has a time limit", async () => {
    await send("POST", "/surveys", quiz);
    const late = { answers: { q2: "yes" }, meta: { quiz: { timedOut: true } } };
    expect((await send("POST", "/surveys/quiz/responses", late)).status).toBe(400);
    await send("PUT", "/surveys/quiz", { ...quiz, settings: { quiz: { timeLimit: 60 } } });
    const ok = await send("POST", "/surveys/quiz/responses", late);
    expect(ok.status).toBe(201);
    expect((await ok.json()).meta.quiz).toMatchObject({ score: 1, timedOut: true, released: true });
  });
});

describe("response listing", () => {
  it("pages with a cursor and filters by answer and date", async () => {
    await send("POST", "/surveys", survey);
    for (const score of [1, 2, 3, 4, 5]) await send("POST", "/surveys/feedback/responses", { answers: { email: `${score}@x.co`, score } });
    const page = async (q: string) => (await send("GET", `/surveys/feedback/responses${q}`)).json();
    // Responses made in the same millisecond are ordered by id; together the pages hold each one exactly once.
    const scores = (p: { items: { answers: { score: number } }[] }) => p.items.map((r) => r.answers.score);
    const first = await page("?limit=2");
    const second = await page(`?limit=2&cursor=${first.nextCursor}`);
    const last = await page(`?limit=2&cursor=${second.nextCursor}`);
    expect([first, second, last].map((p) => p.items.length)).toEqual([2, 2, 1]);
    expect([...scores(first), ...scores(second), ...scores(last)].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(last.nextCursor).toBeUndefined();
    expect((await send("GET", "/surveys/feedback/responses?cursor=bogus")).status).toBe(400);

    expect((await page("?answer=score:3")).total).toBe(1);
    expect((await page("?answer=score:3&answer=email:3@x.co")).total).toBe(1);
    expect((await page("?answer=score:9")).total).toBe(0);
    const today = new Date().toISOString().slice(0, 10);
    expect((await page(`?from=${today}`)).total).toBe(5);
    expect((await page(`?to=${today}`)).total).toBe(5);
    expect((await page("?to=2000-01-01")).total).toBe(0);
  });
});

describe("CSV export", () => {
  it("exports every matching response with labels or values, behind the read action", async () => {
    await send("POST", "/surveys", uploads);
    await send("POST", "/surveys/uploads/responses", { answers: { kind: "idea", note: "=SUM(A1)" } });
    await send("POST", "/surveys/uploads/responses", { answers: { kind: "idea", note: "plain" } });
    const res = await send("GET", "/surveys/uploads/responses.csv");
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="uploads-responses.csv"');
    // A byte order mark first, so Excel reads UTF-8 (text() drops it when decoding).
    expect([...new Uint8Array(await res.clone().arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = (await res.text()).split("\r\n");
    expect(lines[0]).toBe("id,submitted,status,Kind,Screenshot,Note");
    expect(lines.filter(Boolean)).toHaveLength(3);
    expect(lines.some((l) => l.endsWith(",Idea,,'=SUM(A1)"))).toBe(true);
    const values = await (await send("GET", "/surveys/uploads/responses.csv?values=true&answer=note:plain")).text();
    expect(values.split("\r\n")[0]).toBe("id,submitted,status,kind,shot,note");
    expect(values.split("\r\n").filter(Boolean)).toHaveLength(2);
    expect(values).toContain(",idea,,plain");

    const locked = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")), authorize: apiKeyAuth({ keys: ["k"] }) });
    expect((await locked.request("/surveys/uploads/responses.csv")).status).toBe(401);
  });
});

