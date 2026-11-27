import type { Context } from "hono";

/** Everything a client can do through the API. `authorize` is asked about each one. */
export type KvestoAction =
  | "survey:list"
  | "survey:read"
  | "survey:write"
  | "response:create"
  | "response:read"
  /** See the answers to questions marked `pii` unmasked. */
  | "response:read-pii"
  | "response:delete"
  | "file:upload"
  | "file:read"
  | "webhook:manage";

export const KVESTO_ACTIONS: readonly KvestoAction[] = [
  "survey:list",
  "survey:read",
  "survey:write",
  "response:create",
  "response:read",
  "response:read-pii",
  "response:delete",
  "file:upload",
  "file:read",
  "webhook:manage",
];

export interface AuthorizeRequest {
  action: KvestoAction;
  /** The survey the request is about, when the path names one. */
  surveyId?: string;
}

/**
 * Decides whether a request may go ahead.
 *
 * Return `true` to allow it, `false` to refuse it with 403, or a `Response`
 * (for example a 401 with a `WWW-Authenticate` header) to send instead.
 * Plug in your own session, cookie or JWT check here.
 */
export type Authorize = (
  c: Context,
  request: AuthorizeRequest,
) => boolean | Response | Promise<boolean | Response>;

/** Allows everything. Pass it explicitly for local development to silence the startup warning. */
export const openAccess: Authorize = () => true;

/** What respondents need to take a survey: read it, submit a response, upload and view their files. */
export const RESPONDENT_ACTIONS: readonly KvestoAction[] = ["survey:read", "response:create", "file:upload", "file:read"];

export interface ApiKeyAuthOptions {
  /** Keys that unlock every action, sent as `Authorization: Bearer <key>`. Empty strings are ignored. */
  keys: readonly string[];
  /**
   * Actions allowed without a key. Default `RESPONDENT_ACTIONS`, so surveys can be embedded publicly while
   * editing surveys and reading responses need a key. Uploaded files are served by unguessable ids;
   * drop `file:read` from this list if file links must not be shareable.
   */
  publicActions?: readonly KvestoAction[];
}

/** Compares two strings without returning early, so response timing doesn't reveal how much of a key matched. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Bearer API keys for admin actions; the respondent actions stay public. */
export function apiKeyAuth(options: ApiKeyAuthOptions): Authorize {
  const keys = options.keys.filter((k) => k.length > 0);
  if (keys.length === 0) throw new Error("apiKeyAuth needs at least one non-empty key");
  const open = new Set(options.publicActions ?? RESPONDENT_ACTIONS);

  return (c, { action }) => {
    if (open.has(action)) return true;
    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    // Check every key so the time taken doesn't depend on which one matched.
    const ok = match ? keys.map((k) => safeEqual(k, match[1]!)).includes(true) : false;
    if (ok) return true;
    return c.json(
      { error: match ? "Invalid API key" : "An API key is required" },
      401,
      { "www-authenticate": 'Bearer realm="kvesto"' },
    );
  };
}
