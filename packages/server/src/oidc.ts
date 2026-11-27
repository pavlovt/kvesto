/**
 * Sign-in with OpenID Connect, kept in a signed session cookie (no user
 * table), and an `authorize` for those sessions with CSRF protection on
 * writes. Mount the routes next to the API: `app.route("/", login.routes)`.
 */
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify, type JsonWebKey } from "node:crypto";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { RESPONDENT_ACTIONS, type Authorize } from "./auth.js";
import { ROLE_ACTIONS, type Role } from "./tokens.js";
import { setActor } from "./audit.js";

export interface OidcOptions {
  /** The provider's issuer URL; its `/.well-known/openid-configuration` is read. */
  issuer: string;
  clientId: string;
  clientSecret?: string;
  /** This server's callback URL, registered with the provider (ends in `/auth/callback`). */
  redirectUri: string;
  scopes?: string[];
  /** The role for a signed-in person, from the ID token's claims (email, groups…); null refuses them. */
  role: (claims: Record<string, unknown>) => Role | null | Promise<Role | null>;
  /** Signs the session cookie: a long random string. */
  sessionSecret: string;
  /** How long a session lasts. Default 8 hours. */
  sessionSeconds?: number;
  /** Where to go after signing in. Default "/". */
  afterLogin?: string;
  /** Origins (besides the server's own) whose pages may write with the session, such as the editor's. */
  trustedOrigins?: string[];
  fetch?: typeof fetch;
}

export interface Session {
  sub: string;
  email?: string;
  name?: string;
  role: Role;
  exp: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const SESSION = "kvesto_session";
const FLOW = "kvesto_oidc";

function signed(secret: string, value: object): string {
  const body = b64(JSON.stringify(value));
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
function unsigned<T>(secret: string, cookie: string | undefined): T | null {
  if (!cookie) return null;
  const [body = "", sig = ""] = cookie.split(".");
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("base64url"));
  if (expected.length !== sig.length || !timingSafeEqual(expected, Buffer.from(sig))) return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    return typeof value.exp === "number" && value.exp * 1000 > Date.now() ? value : null;
  } catch {
    return null;
  }
}

/** Checks an ID token's signature against the provider's keys, and its issuer, audience, expiry and nonce. */
export async function verifyIdToken(
  token: string,
  { jwks, issuer, clientId, nonce, now = Date.now() }: { jwks: { keys: (JsonWebKey & { kid?: string })[] }; issuer: string; clientId: string; nonce: string; now?: number },
): Promise<Record<string, unknown>> {
  const [h = "", p = "", s = ""] = token.split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg?: string; kid?: string };
  const algs: Record<string, string> = { RS256: "RSA-SHA256", ES256: "SHA256" };
  if (!header.alg || !algs[header.alg]) throw new Error(`ID token algorithm ${header.alg} is not allowed`);
  const jwk = jwks.keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) throw new Error("No provider key for the ID token");
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const ok = verify(algs[header.alg]!, Buffer.from(`${h}.${p}`), header.alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("The ID token's signature is wrong");
  const claims = JSON.parse(Buffer.from(p, "base64url").toString()) as Record<string, unknown>;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== issuer) throw new Error("The ID token is from another issuer");
  if (!aud.includes(clientId)) throw new Error("The ID token is for another client");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) throw new Error("The ID token has expired");
  if (claims.nonce !== nonce) throw new Error("The ID token's nonce doesn't match");
  return claims;
}

/** The session in the request's cookie, if it is valid. */
export function sessionOf(c: Context, secret: string): Session | null {
  return unsigned<Session>(secret, getCookie(c, SESSION));
}

/**
 * Whether a write with cookies comes from a page that may make it: the `Origin` (or, without one,
 * `Sec-Fetch-Site: same-origin`) must be this server's or a trusted origin.
 */
export function sameOriginWrite(c: Context, trusted: readonly string[] = []): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return true;
  const origin = c.req.header("origin");
  if (origin) return origin === new URL(c.req.url).origin || trusted.includes(origin);
  return c.req.header("sec-fetch-site") === "same-origin";
}

export function oidcLogin(options: OidcOptions): { routes: Hono; authorize: Authorize } {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const issuer = options.issuer.replace(/\/+$/, "");
  let discovery: Promise<{ authorization_endpoint: string; token_endpoint: string; jwks_uri: string; end_session_endpoint?: string }> | null = null;
  const discover = () =>
    (discovery ??= doFetch(`${issuer}/.well-known/openid-configuration`).then(async (r) => {
      if (!r.ok) throw new Error(`OpenID discovery failed: HTTP ${r.status}`);
      return r.json();
    })).catch((e) => {
      discovery = null;
      throw e;
    });
  const cookie = { httpOnly: true, secure: true, sameSite: "Lax" as const, path: "/" };
  const routes = new Hono();

  routes.get("/auth/login", async (c) => {
    const config = await discover();
    const state = b64(randomBytes(16));
    const nonce = b64(randomBytes(16));
    const verifier = b64(randomBytes(32));
    setCookie(c, FLOW, signed(options.sessionSecret, { state, nonce, verifier, exp: Math.floor(Date.now() / 1000) + 600 }), { ...cookie, maxAge: 600 });
    const url = new URL(config.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      scope: (options.scopes ?? ["openid", "email", "profile"]).join(" "),
      state,
      nonce,
      code_challenge: b64(createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
    }).toString();
    return c.redirect(url.toString(), 302);
  });

  routes.get("/auth/callback", async (c) => {
    const flow = unsigned<{ state: string; nonce: string; verifier: string }>(options.sessionSecret, getCookie(c, FLOW));
    deleteCookie(c, FLOW, { path: "/" });
    const code = c.req.query("code");
    if (!flow || !code || c.req.query("state") !== flow.state) return c.json({ error: "The sign-in expired or was tampered with; try again" }, 400);
    const config = await discover();
    const tokenRes = await doFetch(config.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: options.redirectUri,
        client_id: options.clientId,
        ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
        code_verifier: flow.verifier,
      }),
    });
    if (!tokenRes.ok) return c.json({ error: "The provider refused the sign-in" }, 401);
    const { id_token } = (await tokenRes.json()) as { id_token?: string };
    if (!id_token) return c.json({ error: "The provider sent no ID token" }, 401);
    let claims: Record<string, unknown>;
    try {
      const jwks = (await (await doFetch(config.jwks_uri)).json()) as { keys: JsonWebKey[] };
      claims = await verifyIdToken(id_token, { jwks, issuer, clientId: options.clientId, nonce: flow.nonce });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Invalid ID token" }, 401);
    }
    const role = await options.role(claims);
    if (!role) return c.json({ error: "This account has no access" }, 403);
    const seconds = options.sessionSeconds ?? 8 * 3600;
    const session: Session = {
      sub: String(claims.sub),
      ...(typeof claims.email === "string" ? { email: claims.email } : {}),
      ...(typeof claims.name === "string" ? { name: claims.name } : {}),
      role,
      exp: Math.floor(Date.now() / 1000) + seconds,
    };
    setCookie(c, SESSION, signed(options.sessionSecret, session), { ...cookie, maxAge: seconds });
    return c.redirect(options.afterLogin ?? "/", 302);
  });

  routes.get("/auth/me", (c) => {
    const session = sessionOf(c, options.sessionSecret);
    return session ? c.json(session) : c.json({ error: "Not signed in" }, 401);
  });

  routes.post("/auth/logout", (c) => {
    if (!sameOriginWrite(c, options.trustedOrigins)) return c.json({ error: "Cross-site request refused" }, 403);
    deleteCookie(c, SESSION, { path: "/" });
    return c.body(null, 204);
  });

  const authorize: Authorize = (c, { action }) => {
    if (RESPONDENT_ACTIONS.includes(action)) return true;
    const session = sessionOf(c, options.sessionSecret);
    if (!session) return c.json({ error: "Please sign in" }, 401);
    // The cookie goes along with any request to this server, so writes must come from a page allowed to make them.
    setActor(c, `user:${session.sub}`);
    if (!sameOriginWrite(c, options.trustedOrigins)) return c.json({ error: "Cross-site request refused" }, 403);
    return ROLE_ACTIONS[session.role].includes(action);
  };
  return { routes, authorize };
}

/** Tries each `authorize` in turn: the first that allows the request wins; otherwise the first refusal is sent. */
export function anyAuthorize(...checks: Authorize[]): Authorize {
  return async (c, request) => {
    let first: boolean | Response | undefined;
    for (const check of checks) {
      const verdict = await check(c, request);
      if (verdict === true) return true;
      first ??= verdict;
    }
    return first ?? false;
  };
}
