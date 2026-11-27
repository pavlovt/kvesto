import { afterEach, describe, expect, it, vi } from "vitest";
import { checkUploadType, createApp, createSqliteDb, drizzleRepository, openAccess, safeFileName, sniffType, type UploadOptions } from "../src/index.js";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (size = 16) => {
  const b = new Uint8Array(size).fill(1);
  b.set(PNG);
  return b;
};
const text = (s: string) => new TextEncoder().encode(s);

const survey = {
  schemaVersion: 1,
  id: "up",
  title: "Uploads",
  pages: [
    {
      id: "p",
      elements: [
        { id: "shot", type: "file", title: "Screenshot", accept: ["image/*"], maxFiles: 3 },
        { id: "any", type: "file", title: "Anything", maxFiles: 3 },
      ],
    },
  ],
};

function setup(uploads: UploadOptions = {}) {
  const db = createSqliteDb(":memory:");
  const app = createApp({ repository: drizzleRepository(db), authorize: openAccess, uploads });
  const upload = (questionId: string, bytes: Uint8Array, name: string, type: string) => {
    const form = new FormData();
    form.set("questionId", questionId);
    form.set("file", new File([bytes as Uint8Array<ArrayBuffer>], name, { type }));
    return app.request("http://kvesto.test/surveys/up/files", { method: "POST", body: form });
  };
  const answer = (answers: unknown) =>
    app.request("/surveys/up/responses", { method: "POST", body: JSON.stringify({ answers }), headers: { "content-type": "application/json" } });
  const ready = app.request("/surveys", { method: "POST", body: JSON.stringify(survey), headers: { "content-type": "application/json" } });
  return { app, db, upload, answer, ready };
}

afterEach(() => vi.useRealTimers());

describe("file types from their bytes", () => {
  it("recognises common formats and markup", () => {
    expect(sniffType(png())).toBe("image/png");
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffType(text("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffType(text("  <svg xmlns='http://www.w3.org/2000/svg'>"))).toBe("image/svg+xml");
    expect(sniffType(text("<!DOCTYPE html><p>hi"))).toBe("text/html");
    expect(sniffType(text("name,age\nAna,30\n"))).toBe("text/plain");
    expect(sniffType(new Uint8Array([0, 1, 2, 3]))).toBeNull();
  });

  it("accepts a matching or vaguely declared type, and Office files as zips", () => {
    expect(checkUploadType("image/png", png())).toEqual({ type: "image/png" });
    expect(checkUploadType("", png())).toEqual({ type: "image/png" });
    expect(checkUploadType("application/octet-stream", png())).toEqual({ type: "image/png" });
    expect(checkUploadType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Uint8Array([0x50, 0x4b, 3, 4]))).toEqual({
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(checkUploadType("text/csv", text("a,b\n"))).toEqual({ type: "text/csv" });
    expect(checkUploadType("application/x-custom", new Uint8Array([0, 1, 2]))).toEqual({ type: "application/x-custom" });
  });
});

describe("upload hardening", () => {
  it("refuses a disguised file: HTML or a program sent as a PNG", async () => {
    const { upload, ready } = setup();
    await ready;
    const html = await upload("shot", text("<html><script>alert(1)</script>"), "cat.png", "image/png");
    expect(html.status).toBe(400);
    expect((await html.json()).error).toContain("doesn't match its type");
    const exe = await upload("shot", text("MZ\x90\x00binary"), "cat.png", "image/png");
    expect(exe.status).toBe(400);
    // An SVG declared as SVG passes the type check, but the question only takes raster images through `accept`?
    // image/svg+xml matches image/*, so it is stored, and always served as a download.
    const svg = await upload("shot", text("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "x.svg", "image/svg+xml");
    expect(svg.status).toBe(201);
  });

  it("refuses a polyglot: a real GIF header with a page after it", async () => {
    const { upload, ready } = setup();
    await ready;
    const res = await upload("shot", text("GIF89a/*<html><script>alert(1)</script>"), "a.gif", "image/gif");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("polyglot");
  });

  it("never serves SVG, HTML or XML inline", async () => {
    const { app, upload, ready } = setup();
    await ready;
    for (const [bytes, name, type] of [
      [text("<svg xmlns='http://www.w3.org/2000/svg'/>"), "a.svg", "image/svg+xml"],
      [text("<!doctype html><p>x"), "a.html", "text/html"],
      [text("<?xml version='1.0'?><a/>"), "a.xml", "application/xml"],
    ] as const) {
      const entry = await (await upload("any", bytes, name, type)).json();
      const got = await app.request(entry.url);
      expect(got.headers.get("content-disposition")).toMatch(/^attachment/);
      expect(got.headers.get("content-security-policy")).toContain("sandbox");
    }
  });

  it("cleans hostile file names", async () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
    expect(safeFileName("invoice\u202Efdp.exe")).toBe("invoicefdp.exe");
    expect(safeFileName("a\u0000b\u0007c.txt")).toBe("abc.txt");
    expect(safeFileName("...")).toBe("file");
    expect(safeFileName("x".repeat(300) + ".png")).toHaveLength(200);
    expect(safeFileName("x".repeat(300) + ".png").endsWith(".png")).toBe(true);
    const { upload, ready } = setup();
    await ready;
    const entry = await (await upload("shot", png(), "../../evil\u202Egnp.png", "image/png")).json();
    expect(entry.name).toBe("evilgnp.png");
  });

  it("stops at the survey's storage quota", async () => {
    const { upload, ready } = setup({ surveyQuota: 40 });
    await ready;
    expect((await upload("shot", png(16), "a.png", "image/png")).status).toBe(201);
    expect((await upload("shot", png(16), "b.png", "image/png")).status).toBe(201);
    const full = await upload("shot", png(16), "c.png", "image/png");
    expect(full.status).toBe(413);
    expect((await full.json()).error).toContain("storage is full");
  });

  it("stops a response whose files are over the response quota", async () => {
    const { upload, answer, ready } = setup({ responseQuota: 40 });
    await ready;
    const files = [];
    for (const n of ["a", "b", "c"]) files.push(await (await upload("shot", png(16), `${n}.png`, "image/png")).json());
    expect((await answer({ shot: files.slice(0, 2) })).status).toBe(201);
    expect((await answer({ shot: files })).status).toBe(413);
  });

  it("deletes uploads no response refers to, once they are old enough", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { app, upload, answer, ready } = setup({ orphanAfterSeconds: 3600 });
    await ready;
    const kept = await (await upload("shot", png(), "kept.png", "image/png")).json();
    const orphan = await (await upload("shot", png(), "orphan.png", "image/png")).json();
    await answer({ shot: [kept] });
    expect(await app.uploads.sweep()).toBe(0);
    vi.setSystemTime(Date.now() + 2 * 3600_000);
    expect(await app.uploads.sweep()).toBe(1);
    expect((await app.request(kept.url)).status).toBe(200);
    expect((await app.request(orphan.url)).status).toBe(404);
  });

  it("asks the scanner, and refuses what it flags", async () => {
    const scanFile = vi.fn((_f: unknown, bytes: Uint8Array) => (new TextDecoder().decode(bytes).includes("EICAR") ? "Infected: EICAR test file" : true));
    const { upload, ready } = setup({ scanFile });
    await ready;
    expect((await upload("any", text("plain notes"), "notes.txt", "text/plain")).status).toBe(201);
    const bad = await upload("any", text("X5O!P%@AP EICAR-STANDARD-ANTIVIRUS-TEST-FILE"), "eicar.txt", "text/plain");
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toBe("Infected: EICAR test file");
    expect(scanFile.mock.calls[0]![0]).toMatchObject({ name: "notes.txt", type: "text/plain", surveyId: "up", questionId: "any" });
  });

  it("hands out signed file URLs that expire, and signs them again for admins", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { app, upload, answer, ready } = setup({ signedUrls: { ttlSeconds: 60 } });
    await ready;
    const entry = await (await upload("shot", png(), "a.png", "image/png")).json();
    expect(entry.url).toMatch(/\?expires=\d+&signature=[\w-]+$/);
    expect((await app.request(entry.url)).status).toBe(200);
    expect((await app.request(entry.url.split("?")[0])).status).toBe(403);
    expect((await app.request(entry.url.replace(/signature=./, "signature=x"))).status).toBe(403);
    await answer({ shot: [entry] });
    vi.setSystemTime(Date.now() + 120_000);
    expect((await app.request(entry.url)).status).toBe(403);
    const list = await (await app.request("http://kvesto.test/surveys/up/responses")).json();
    const fresh = list.items[0].answers.shot[0].url;
    expect(fresh).not.toBe(entry.url);
    expect((await app.request(fresh)).status).toBe(200);
  });
});
