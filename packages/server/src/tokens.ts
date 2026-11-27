/**
 * Roles and scoped API tokens. A token has a name, a role (or a list of
 * actions), optionally a list of surveys, and an expiry. Only its hash is
 * stored; the token itself is shown once, when it is created.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { KVESTO_ACTIONS, RESPONDENT_ACTIONS, type Authorize, type KvestoAction } from "./auth.js";
import { setActor } from "./audit.js";

export type Role = "owner" | "editor" | "analyst" | "viewer";
export const ROLES: readonly Role[] = ["owner", "editor", "analyst", "viewer"];

/** What each role may do. Respondent actions are public unless `tokenAuth` is told otherwise. */
export const ROLE_ACTIONS: Record<Role, readonly KvestoAction[]> = {
  owner: KVESTO_ACTIONS,
  editor: ["survey:list", "survey:read", "survey:write", "response:read", "file:read", "file:upload", "webhook:manage"],
  analyst: ["survey:list", "survey:read", "response:read", "response:read-pii", "file:read"],
  viewer: ["survey:list", "survey:read", "response:read", "file:read"],
};

export interface StoredToken {
  id: string;
  name: string;
  /** The actions the token allows. */
  actions: KvestoAction[];
  /** Only these surveys, or every survey when null. */
  surveyIds: string[] | null;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface TokenStore {
  createToken(token: StoredToken & { hash: string }): Promise<void>;
  /** A token with its hash, by id. */
  findToken(id: string): Promise<(StoredToken & { hash: string }) | null>;
  listTokens(): Promise<StoredToken[]>;
  revokeToken(id: string, at: string): Promise<boolean>;
  touchToken(id: string, at: string): Promise<void>;
}

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const TOKEN = /^kvt_([A-Za-z0-9]{16})_([A-Za-z0-9_-]{43})$/;

/** Make a token: returns the stored record and the token to show once (`kvt_<id>_<secret>`). */
export function newToken(input: { name: string; role?: Role; actions?: KvestoAction[]; surveyIds?: string[] | null; expiresAt?: string | null }): {
  token: string;
  record: StoredToken & { hash: string };
} {
  const id = randomBytes(12).toString("base64url").replace(/[-_]/g, "x").slice(0, 16);
  const secret = randomBytes(32).toString("base64url");
  const actions = [...new Set(input.actions ?? ROLE_ACTIONS[input.role ?? "viewer"])];
  return {
    token: `kvt_${id}_${secret}`,
    record: {
      id,
      name: input.name,
      actions,
      surveyIds: input.surveyIds?.length ? input.surveyIds : null,
      expiresAt: input.expiresAt ?? null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
      hash: hash(secret),
    },
  };
}

export interface TokenAuthOptions {
  store: TokenStore;
  /** Keys that allow everything, e.g. to create the first tokens. Compared in constant time. */
  adminKeys?: readonly string[];
  /** Actions allowed without a token. Default `RESPONDENT_ACTIONS`. */
  publicActions?: readonly KvestoAction[];
}

/** An `authorize` that accepts scoped tokens (and optional admin keys) as `Authorization: Bearer …`. */
export function tokenAuth(options: TokenAuthOptions): Authorize {
  const open = new Set(options.publicActions ?? RESPONDENT_ACTIONS);
  const adminKeys = (options.adminKeys ?? []).filter(Boolean).map((k) => hash(k));
  const deny = (c: Parameters<Authorize>[0], error: string, status: 401 | 403 = 401) =>
    c.json({ error }, status, status === 401 ? { "www-authenticate": 'Bearer realm="kvesto"' } : {});

  return async (c, { action, surveyId }) => {
    if (open.has(action)) return true;
    const match = /^Bearer\s+(\S+)$/i.exec((c.req.header("authorization") ?? "").trim());
    if (!match) return deny(c, "An API token is required");
    const given = hash(match[1]!);
    if (adminKeys.some((k) => timingSafeEqual(Buffer.from(k), Buffer.from(given)))) {
      setActor(c, "admin-key");
      return true;
    }
    const parts = TOKEN.exec(match[1]!);
    const found = parts ? await options.store.findToken(parts[1]!) : null;
    if (!found || !timingSafeEqual(Buffer.from(found.hash), Buffer.from(hash(parts![2]!)))) return deny(c, "Invalid API token");
    const now = new Date();
    if (found.revokedAt) return deny(c, "This API token was revoked");
    if (found.expiresAt && Date.parse(found.expiresAt) <= now.getTime()) return deny(c, "This API token has expired");
    if (!found.actions.includes(action)) return deny(c, `This token may not ${action}`, 403);
    // A token for some surveys works only on those (so it can't list all surveys either).
    if (found.surveyIds && (!surveyId || !found.surveyIds.includes(surveyId))) return deny(c, "This token is not for this survey", 403);
    await options.store.touchToken(found.id, now.toISOString());
    setActor(c, `token:${found.id}`);
    return true;
  };
}
