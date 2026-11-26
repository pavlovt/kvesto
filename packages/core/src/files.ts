import type { FileAnswer } from "@kvesto/schema";

/** Encode a file as a base64 `data:` URL answer. Works in browsers, Node 20+, Bun and Deno. */
export async function fileToDataUrl(file: Blob & { name?: string }): Promise<FileAnswer> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const type = file.type || "application/octet-stream";
  return {
    name: file.name || "file",
    type: file.type,
    size: file.size,
    url: `data:${type};base64,${btoa(binary)}`,
  };
}
