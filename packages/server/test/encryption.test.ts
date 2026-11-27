import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, createEncryption, createSqliteDb, drizzleRepository, encryptionFromEnv, openAccess, type EncryptionOptions } from "../src/index.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode("PASSPORT-SCAN-1234")]);
const survey = {
  schemaVersion: 1,
  id: "secret",
  title: "Secret",
  pages: [
    {
      id: "p",
      elements: [
        { id: "email", type: "text", title: "Email", pii: true },
        { id: "family", type: "panel", repeat: {}, elements: [{ id: "relative", type: "text", title: "Name", pii: true }] },
        { id: "doc", type: "file", title: "ID scan", accept: ["image/*"], pii: true },
        { id: "rating", type: "rating", title: "Rating", min: 1, max: 5 },
      ],
    },
  ],
};
const key = () => randomBytes(32).toString("base64");

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

function open(file: string, encryption?: EncryptionOptions) {
  const db = createSqliteDb(file);
  const repository = drizzleRepository(db, encryption ? { encryption } : {});
  const app = createApp({ repository, authorize: openAccess });
  const json = (method: string, path: string, body?: unknown) =>
    app.request(`http://kvesto.test${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers: { "content-type": "application/json" } });
  const upload = async () => {
    const form = new FormData();
    form.set("questionId", "doc");
    form.set("file", new File([PNG], "id.png", { type: "image/png" }));
    return (await app.request("http://kvesto.test/surveys/secret/files", { method: "POST", body: form })).json();
  };
  return { db, repository, app, json, upload, close: () => db.$client.close() };
}

/** Everything on disk for the database: the file and its write-ahead log. */
const onDisk = (file: string) => Buffer.concat([file, `${file}-wal`].filter(existsSync).map((f) => readFileSync(f))).toString("latin1");

describe("encryption at rest", () => {
  it("stores no plaintext pii answers or file bytes in the database file", async () => {
    dir = mkdtempSync(join(tmpdir(), "kvesto-enc-"));
    const file = join(dir, "kvesto.db");
    const s = open(file, { keys: { k1: key() }, current: "k1" });
    await s.json("POST", "/surveys", survey);
    const scan = await s.upload();
    const saved = await s.json("POST", "/surveys/secret/responses", {
      answers: { email: "ana.secret@example.com", family: [{ relative: "Boris Hidden" }], doc: [scan], rating: 4 },
    });
    expect(saved.status).toBe(201);
    // The API still reads them back in the clear.
    const list = await (await s.json("GET", "/surveys/secret/responses")).json();
    expect(list.items[0].answers).toMatchObject({ email: "ana.secret@example.com", family: [{ relative: "Boris Hidden" }], rating: 4 });
    expect(new Uint8Array(await (await s.app.request(scan.url)).arrayBuffer())).toEqual(PNG);
    s.close();
    const raw = onDisk(file);
    for (const secret of ["ana.secret@example.com", "Boris Hidden", "PASSPORT-SCAN-1234"]) expect(raw).not.toContain(secret);
    expect(raw).toContain("kv:enc:1:k1:");
  });

  it("rotates keys: new values use the new key, old ones still read, reencrypt moves them, then the old key can go", async () => {
    dir = mkdtempSync(join(tmpdir(), "kvesto-enc-"));
    const file = join(dir, "kvesto.db");
    const k1 = key();
    const k2 = key();
    const first = open(file, { keys: { k1 }, current: "k1" });
    await first.json("POST", "/surveys", survey);
    const scan = await first.upload();
    await first.json("POST", "/surveys/secret/responses", { answers: { email: "old@example.com", doc: [scan] } });
    first.close();

    const both = open(file, { keys: { k1, k2 }, current: "k2" });
    await both.json("POST", "/surveys/secret/responses", { answers: { email: "new@example.com" } });
    const keysUsed = () => (both.db.$client.prepare("select answers from responses").all() as { answers: string }[]).map((r) => /kv:enc:1:(\w+):/.exec(r.answers)?.[1]);
    expect(keysUsed().sort()).toEqual(["k1", "k2"]);
    expect(await both.repository.reencrypt()).toEqual({ responses: 1, files: 1 });
    expect(keysUsed()).toEqual(["k2", "k2"]);
    expect(await both.repository.reencrypt()).toEqual({ responses: 0, files: 0 });
    both.close();

    const onlyNew = open(file, { keys: { k2 }, current: "k2" });
    const list = await (await onlyNew.json("GET", "/surveys/secret/responses")).json();
    expect(list.items.map((r: { answers: { email: string } }) => r.answers.email).sort()).toEqual(["new@example.com", "old@example.com"]);
    expect(new Uint8Array(await (await onlyNew.app.request(scan.url)).arrayBuffer())).toEqual(PNG);
    onlyNew.close();
  });

  it("encrypts what was stored before encryption was turned on", async () => {
    dir = mkdtempSync(join(tmpdir(), "kvesto-enc-"));
    const file = join(dir, "kvesto.db");
    const plain = open(file);
    await plain.json("POST", "/surveys", survey);
    await plain.json("POST", "/surveys/secret/responses", { answers: { email: "before@example.com" } });
    plain.close();
    const later = open(file, { keys: { k1: key() }, current: "k1" });
    expect((await (await later.json("GET", "/surveys/secret/responses")).json()).items[0].answers.email).toBe("before@example.com");
    expect((await later.repository.reencrypt()).responses).toBe(1);
    later.close();
    expect(onDisk(file)).not.toContain('"before@example.com"');
  });

  it("checks keys, refuses tampering, and reads keys from the environment", () => {
    expect(() => createEncryption({ keys: { k1: "c2hvcnQ=" }, current: "k1" })).toThrow("32 bytes");
    expect(() => createEncryption({ keys: { k1: key() }, current: "k9" })).toThrow("not among the keys");
    const enc = createEncryption({ keys: { k1: key() }, current: "k1" });
    const sealed = enc.sealValue({ a: 1 });
    expect(enc.openValue(sealed)).toEqual({ a: 1 });
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => enc.openValue(tampered)).toThrow();
    expect(() => createEncryption({ keys: { k2: key() }, current: "k2" }).openValue(sealed)).toThrow('No encryption key "k1"');
    const k = key();
    expect(encryptionFromEnv(`new:${k},old:${k}`)).toEqual({ keys: { new: k, old: k }, current: "new" });
    expect(encryptionFromEnv("")).toBeUndefined();
  });
});
