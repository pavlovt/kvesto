import { HttpStorageError, type HttpStorageOptions } from "@kvesto/core";

/** Calls to the Kvesto server's admin routes that `SurveyStorage` has no method for (tokens, audit, deleting a response). */
async function send(api: HttpStorageOptions, method: string, path: string, body?: unknown, accept = "application/json"): Promise<Response> {
  const doFetch = api.fetch ?? globalThis.fetch.bind(globalThis);
  const extra = typeof api.headers === "function" ? await api.headers() : (api.headers ?? {});
  const res = await doFetch(`${api.baseUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { accept, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new HttpStorageError(res.status, await res.json().catch(() => undefined));
  return res;
}

/** A JSON request; null for an empty (204) reply. */
export async function apiRequest<T>(api: HttpStorageOptions, method: string, path: string, body?: unknown): Promise<T | null> {
  const res = await send(api, method, path, body);
  return res.status === 204 ? null : ((await res.json()) as T);
}

/** A file from the server, fetched with the API's headers (a plain link can't send them). */
export async function apiBlob(api: HttpStorageOptions, path: string, accept: string): Promise<Blob> {
  return (await send(api, "GET", path, undefined, accept)).blob();
}

/** The server's error message, or the HTTP status. */
export function apiError(e: unknown): string {
  if (e instanceof HttpStorageError) {
    const message = (e.body as { error?: unknown } | undefined)?.error;
    if (e.status === 403) return `Not allowed (403)${typeof message === "string" ? `: ${message}` : ""}.`;
    return typeof message === "string" ? `${message} (${e.status}).` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Save a blob as a file. */
export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
