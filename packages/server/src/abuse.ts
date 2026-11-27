/**
 * Abuse protection: rate limits, the client's address, CAPTCHA verifiers, and
 * signed "loaded at" tokens for the minimum time to complete.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";

/** Counts hits per key in fixed windows. Implement it on Redis (or anything shared) when you run several servers. */
export interface RateLimitStore {
  /** Count one hit for `key` and return the count in the current window and when the window ends (ms since epoch). */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> | { count: number; resetAt: number };
}

/** The default store: in this process's memory. Fine for one server. */
export function memoryRateLimitStore(): RateLimitStore & { size(): number } {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let sweptAt = 0;
  return {
    hit(key, windowMs) {
      const now = Date.now();
      // Drop expired windows now and then, so the map can't grow without bound.
      if (now - sweptAt > 60_000) {
        sweptAt = now;
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      }
      const w = windows.get(key);
      if (!w || w.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs };
        windows.set(key, fresh);
        return fresh;
      }
      w.count++;
      return w;
    },
    size: () => windows.size,
  };
}

export interface Budget {
  /** Requests allowed per window. */
  limit: number;
  /** The window in seconds. */
  windowSeconds: number;
}

export type BudgetName = "response:create" | "response:update" | "file:upload" | "admin";

export const DEFAULT_BUDGETS: Record<BudgetName, Budget> = {
  // Per address and survey.
  "response:create": { limit: 20, windowSeconds: 600 },
  // Progress saves happen after every page.
  "response:update": { limit: 300, windowSeconds: 600 },
  "file:upload": { limit: 30, windowSeconds: 600 },
  // Per address, over all admin routes.
  admin: { limit: 600, windowSeconds: 60 },
};

export interface RateLimitOptions {
  store?: RateLimitStore;
  /** Change some budgets; the rest keep their defaults. */
  budgets?: Partial<Record<BudgetName, Budget>>;
}

export interface ClientAddressOptions {
  /**
   * How many proxies in front of the server you trust to set `X-Forwarded-For` (a load balancer: 1). Default 0:
   * the header is ignored, so nobody can pick their own address with it.
   */
  trustProxy?: number;
  /** Work out the address yourself (from your platform's request object). Wins over `trustProxy`. */
  clientIp?: (c: Context) => string | undefined;
}

/** The client's address: from `X-Forwarded-For` only through trusted proxies, else the socket. */
export function clientAddress(c: Context, options: ClientAddressOptions = {}): string {
  const own = options.clientIp?.(c);
  if (own) return own;
  const hops = options.trustProxy ?? 0;
  if (hops > 0) {
    const forwarded = (c.req.header("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    // Each trusted proxy appends the address it saw, so the client is `hops` entries from the right.
    const ip = forwarded[Math.max(0, forwarded.length - hops)];
    if (ip) return ip;
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}

/** Checks a CAPTCHA token. Return true to let the response through. */
export type VerifyChallenge = (c: Context, token: string, ip: string) => boolean | Promise<boolean>;

/**
 * A verifier for a "siteverify" style service: posts `secret`, `response` and `remoteip` as a form and reads
 * `{ success }`. The presets below fill in the address for each service.
 */
export function siteVerifyChallenge({ url, secret, fetch: doFetch = globalThis.fetch }: { url: string; secret: string; fetch?: typeof fetch }): VerifyChallenge {
  return async (_c, token, ip) => {
    try {
      const body = new URLSearchParams({ secret, response: token, ...(ip !== "unknown" ? { remoteip: ip } : {}) });
      const res = await doFetch(url, { method: "POST", body, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return false;
      return ((await res.json()) as { success?: unknown }).success === true;
    } catch {
      return false;
    }
  };
}
export const turnstileChallenge = (secret: string, f?: typeof fetch) =>
  siteVerifyChallenge({ url: "https://challenges.cloudflare.com/turnstile/v0/siteverify", secret, fetch: f });
export const hcaptchaChallenge = (secret: string, f?: typeof fetch) => siteVerifyChallenge({ url: "https://api.hcaptcha.com/siteverify", secret, fetch: f });
export const recaptchaChallenge = (secret: string, f?: typeof fetch) =>
  siteVerifyChallenge({ url: "https://www.google.com/recaptcha/api/siteverify", secret, fetch: f });

/** A signed "survey loaded at" token: `time.signature`. */
export function startToken(secret: string, surveyId: string, now = Date.now()): string {
  const sig = createHmac("sha256", secret).update(`start\0${surveyId}\0${now}`).digest("base64url");
  return `${now}.${sig}`;
}

/** When the survey was loaded, if `token` is a valid start token for it. */
export function startTime(secret: string, surveyId: string, token: unknown): number | null {
  if (typeof token !== "string" || token.length > 100) return null;
  const [time, sig = ""] = token.split(".");
  const at = Number(time);
  if (!Number.isSafeInteger(at)) return null;
  const expected = Buffer.from(startToken(secret, surveyId, at).split(".")[1]!);
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? at : null;
}
