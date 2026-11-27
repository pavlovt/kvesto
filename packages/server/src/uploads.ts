/**
 * Upload checks: a file's real type from its first bytes, safe file names,
 * and signed, short-lived file URLs.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const startsWith = (bytes: Uint8Array, sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Binary formats recognised by their first bytes. */
const MAGIC: [string, (b: Uint8Array) => boolean][] = [
  ["image/png", (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ["image/jpeg", (b) => startsWith(b, [0xff, 0xd8, 0xff])],
  ["image/gif", (b) => startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a"))],
  ["image/webp", (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8)],
  ["image/bmp", (b) => startsWith(b, ascii("BM"))],
  ["image/tiff", (b) => startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])],
  ["application/pdf", (b) => startsWith(b, ascii("%PDF-"))],
  ["application/zip", (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])],
  ["application/gzip", (b) => startsWith(b, [0x1f, 0x8b])],
  ["audio/wav", (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WAVE"), 8)],
  ["audio/mpeg", (b) => startsWith(b, ascii("ID3")) || startsWith(b, [0xff, 0xfb])],
  ["video/mp4", (b) => startsWith(b, ascii("ftyp"), 4)],
  ["application/x-msdownload", (b) => startsWith(b, ascii("MZ"))],
  ["application/x-executable", (b) => startsWith(b, [0x7f, 0x45, 0x4c, 0x46])],
];

/** Declared types that are zip files inside (Office documents, OpenDocument, EPUB). */
const ZIP_TYPES = /^application\/(zip|x-zip-compressed|epub\+zip|vnd\.openxmlformats-officedocument\..+|vnd\.oasis\.opendocument\..+)$/;
const MARKUP = /<\s*(script|html|svg|iframe|object|embed|!doctype|\?xml|body|meta)\b/i;

/** The type the bytes really are, as far as their start shows: a binary format, markup, plain text, or null. */
export function sniffType(bytes: Uint8Array): string | null {
  for (const [type, test] of MAGIC) if (test(bytes)) return type;
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 1024));
  const text = head.replace(/^\uFEFF/, "").trimStart();
  if (/^<\?xml[\s\S]*<svg\b/i.test(text) || /^<svg\b/i.test(text)) return "image/svg+xml";
  if (/^<(!doctype html|html|head|body|script)\b/i.test(text)) return "text/html";
  if (/^<\?xml\b/i.test(text)) return "application/xml";
  // Text: no NUL bytes or other control characters apart from tab and line breaks.
  if (!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(head)) return "text/plain";
  return null;
}

const TEXT_FAMILY = /^(text\/(plain|csv|markdown|tab-separated-values)|application\/(json|csv))$/;
const MARKUP_TYPES = new Set(["image/svg+xml", "text/html", "application/xml", "text/xml", "application/xhtml+xml"]);

/**
 * Checks an upload's bytes against its declared type. Returns the type to store (the declared one, or the real one
 * when nothing useful was declared) or a reason to refuse it.
 */
export function checkUploadType(declared: string, bytes: Uint8Array): { type: string } | { error: string } {
  const real = sniffType(bytes);
  const claimed = declared.toLowerCase().split(";")[0]!.trim();
  const unknown = claimed === "" || claimed === "application/octet-stream";
  // An image or PDF that also carries markup near its start could be run as a page by a lenient viewer.
  if (real && real !== "text/plain" && !MARKUP_TYPES.has(real)) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    if (MARKUP.test(head)) return { error: "The file contains markup it shouldn't (it looks like a polyglot)" };
  }
  if (unknown) return { type: real ?? "application/octet-stream" };
  if (MARKUP_TYPES.has(real ?? "")) {
    return MARKUP_TYPES.has(claimed) ? { type: claimed } : { error: `The file's content doesn't match its type (${claimed})` };
  }
  if (real === "text/plain") {
    return claimed.startsWith("text/") || TEXT_FAMILY.test(claimed) ? { type: claimed } : { error: `The file's content doesn't match its type (${claimed})` };
  }
  if (real === "application/zip" && ZIP_TYPES.test(claimed)) return { type: claimed };
  if (real) return real === claimed ? { type: claimed } : { error: `The file's content doesn't match its type (${claimed})` };
  // Unknown bytes: fine for types we can't recognise, not for one we can.
  const recognisable = MAGIC.some(([t]) => t === claimed) || claimed.startsWith("image/") || claimed === "application/pdf";
  return recognisable ? { error: `The file's content doesn't match its type (${claimed})` } : { type: claimed };
}

/** A file name with no path, control characters or bidi overrides, at most 200 characters. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .replace(/\s+/g, " ");
  if (!clean) return "file";
  if (clean.length <= 200) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 16 ? clean.slice(dot) : "";
  return clean.slice(0, 200 - ext.length) + ext;
}

/** `expires` and `signature` query values for a file URL that works until `expires` (seconds since epoch). */
export function signFileUrl(secret: string, surveyId: string, fileId: string, expires: number): string {
  const signature = createHmac("sha256", secret).update(`file\0${surveyId}\0${fileId}\0${expires}`).digest("base64url");
  return `expires=${expires}&signature=${signature}`;
}

export function fileUrlValid(secret: string, surveyId: string, fileId: string, expires: string | undefined, signature: string | undefined, now = Date.now()): boolean {
  const at = Number(expires);
  if (!Number.isSafeInteger(at) || at * 1000 < now || !signature) return false;
  const expected = Buffer.from(new URLSearchParams(signFileUrl(secret, surveyId, fileId, at)).get("signature")!);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
