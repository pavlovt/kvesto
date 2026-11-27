/**
 * Encryption at rest: answers to `pii` questions and uploaded files are
 * stored encrypted with AES-256-GCM. Each value carries the id of the key it
 * was encrypted with, so keys can be rotated: add a new key, make it current,
 * run `reencrypt`, then drop the old one.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptionOptions {
  /** Keys by id: 32 bytes each, as a Buffer or base64. Ids are letters, digits, `-` and `_`. */
  keys: Record<string, Uint8Array | string>;
  /** The id of the key new values are encrypted with. */
  current: string;
}

export interface Encryption {
  current: string;
  /** Encrypt a JSON value as a string `kv:enc:1:<key id>:<base64>`. */
  sealValue(value: unknown): string;
  /** The value back, if `text` is an encrypted value; otherwise `text` itself. */
  openValue(text: unknown): unknown;
  /** The key id of an encrypted value or file, or null when it isn't encrypted. */
  keyOf(data: unknown): string | null;
  sealBytes(bytes: Uint8Array): Uint8Array;
  /** The bytes back; bytes that aren't encrypted (stored before encryption was on) come back as they are. */
  openBytes(bytes: Uint8Array): Uint8Array;
}

const PREFIX = "kv:enc:1:";
// Files: "KVE1", a key id length byte, the key id, then iv, tag and ciphertext.
const MAGIC = Buffer.from("KVE1");
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Keys from `KVESTO_ENCRYPTION_KEYS`: `id:base64,id:base64`, the first one current. */
export function encryptionFromEnv(value: string | undefined): EncryptionOptions | undefined {
  const pairs = (value ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (!pairs.length) return undefined;
  const keys: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf(":");
    if (at < 1) throw new Error("KVESTO_ENCRYPTION_KEYS must be id:base64 pairs, separated by commas");
    keys[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return { keys, current: pairs[0]!.slice(0, pairs[0]!.indexOf(":")) };
}

export function createEncryption(options: EncryptionOptions): Encryption {
  const keys = new Map<string, Buffer>();
  for (const [id, key] of Object.entries(options.keys)) {
    if (!ID.test(id)) throw new Error(`Encryption key id "${id}" may only use letters, digits, - and _`);
    const bytes = typeof key === "string" ? Buffer.from(key, "base64") : Buffer.from(key);
    if (bytes.length !== 32) throw new Error(`Encryption key "${id}" must be 32 bytes (256 bits)`);
    keys.set(id, bytes);
  }
  const keyFor = (id: string) => {
    const key = keys.get(id);
    if (!key) throw new Error(`No encryption key "${id}": keep old keys until \`reencrypt\` has run`);
    return key;
  };
  if (!keys.has(options.current)) throw new Error(`The current encryption key "${options.current}" is not among the keys`);

  const seal = (plain: Buffer, id: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyFor(id), iv);
    // The key id is authenticated too, so a value can't be passed off as another key's.
    cipher.setAAD(Buffer.from(id));
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  };
  const open = (sealed: Buffer, id: string) => {
    const decipher = createDecipheriv("aes-256-gcm", keyFor(id), sealed.subarray(0, 12));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(sealed.subarray(12, 28));
    return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
  };

  return {
    current: options.current,
    sealValue(value) {
      return `${PREFIX}${options.current}:${seal(Buffer.from(JSON.stringify(value)), options.current).toString("base64")}`;
    },
    openValue(text) {
      if (typeof text !== "string" || !text.startsWith(PREFIX)) return text;
      const rest = text.slice(PREFIX.length);
      const at = rest.indexOf(":");
      return JSON.parse(open(Buffer.from(rest.slice(at + 1), "base64"), rest.slice(0, at)).toString("utf8"));
    },
    keyOf(data) {
      if (typeof data === "string") return data.startsWith(PREFIX) ? data.slice(PREFIX.length, data.indexOf(":", PREFIX.length)) : null;
      if (data instanceof Uint8Array && Buffer.from(data.subarray(0, 4)).equals(MAGIC)) return Buffer.from(data.subarray(5, 5 + data[4]!)).toString();
      return null;
    },
    sealBytes(bytes) {
      const id = Buffer.from(options.current);
      return new Uint8Array(Buffer.concat([MAGIC, Buffer.from([id.length]), id, seal(Buffer.from(bytes), options.current)]));
    },
    openBytes(bytes) {
      const b = Buffer.from(bytes);
      if (!b.subarray(0, 4).equals(MAGIC)) return bytes;
      const length = b[4]!;
      const id = b.subarray(5, 5 + length).toString();
      return new Uint8Array(open(b.subarray(5 + length), id));
    },
  };
}

/** The answers with `fn` applied to the values of these question ids (also inside repeat items). */
export function mapAnswerValues(answers: Record<string, unknown>, ids: Set<string>, fn: (value: unknown) => unknown): Record<string, unknown> {
  if (!ids.size) return answers;
  const walk = (record: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(record).map(([k, v]) => {
        if (ids.has(k)) return [k, v === undefined || v === null ? v : fn(v)];
        if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && !Array.isArray(x) && !("url" in x))) {
          return [k, v.map((item) => walk(item as Record<string, unknown>))];
        }
        return [k, v];
      }),
    );
  return walk(answers);
}

/** Every encrypted value in the answers opened, wherever it is. */
export function openAnswers(enc: Encryption, answers: Record<string, unknown>): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return enc.openValue(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(answers) as Record<string, unknown>;
}
