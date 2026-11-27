import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anyAuthorize,
  createApp,
  createSqliteDb,
  drizzleRepository,
  KVESTO_ACTIONS,
  oidcLogin,
  ROLE_ACTIONS,
  ROLES,
  tokenAuth,
  type KvestoAction,
} from "../src/index.js";

const survey = { schemaVersion: 1, id: "team", title: "Team", pages: [{ id: "p", elements: [{ id: "q", type: "text", title: "Q" }] }] };
const ADMIN = "admin-key-for-tests";

function setup() {
  const repository = drizzleRepository(createSqliteDb(":memory:"));
  const app = createApp({ repository, authorize: tokenAuth({ store: repository, adminKeys: [ADMIN] }) });
  const send = (method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(`http://kvesto.test${path}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    });
  const token = async (body: Record<string, unknown>) => (await (await send("POST", "/tokens", ADMIN, { name: "t", ...body })).json()) as { token: string; id: string };
  return { app, repository, send, token };
}

/** One request that needs each admin action. */
const PROBES: [KvestoAction, string, string, unknown?][] = [
  ["survey:list", "GET", "/surveys"],
  ["survey:write", "PUT", "/surveys/team", survey],
  ["response:read", "GET", "/surveys/team/responses"],
  ["response:delete", "DELETE", "/surveys/team/responses/none"],
  ["webhook:manage", "GET", "/surveys/team/webhooks"],
  ["token:manage", "GET", "/tokens"],
];

afterEach(() => vi.useRealTimers());

describe("roles and scoped tokens", () => {
  it("lets each role do exactly its actions", async () => {
    const { send, token } = setup();
    await send("POST", "/surveys", ADMIN, survey);
    for (const role of ROLES) {
      const { token: t } = await token({ role });
      for (const [action, method, path, body] of PROBES) {
        const status = (await send(method, path, t, body)).status;
        const allowed = ROLE_ACTIONS[role].includes(action);
        expect([role, action, allowed ? status !== 403 && status !== 401 : status === 403]).toEqual([role, action, true]);
      }
    }
    expect(ROLE_ACTIONS.owner).toEqual(KVESTO_ACTIONS);
  });

  it("shows a token once and stores only its hash", async () => {
    const { send, token, repository } = setup();
    const made = await token({ role: "viewer" });
    expect(made.token).toMatch(/^kvt_\w{16}_[\w-]{43}$/);
    const list = await (await send("GET", "/tokens", ADMIN)).json();
    expect(JSON.stringify(list)).not.toContain(made.token.split("_")[2]);
    expect((await repository.findToken(made.id))!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(list.items[0]).toMatchObject({ id: made.id, actions: ROLE_ACTIONS.viewer, revokedAt: null });
  });

  it("refuses an expired token and a revoked one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { send, token } = setup();
    const short = await token({ role: "viewer", expiresInDays: 1 });
    expect((await send("GET", "/surveys", short.token)).status).toBe(200);
    vi.setSystemTime(Date.now() + 2 * 86_400_000);
    const expired = await send("GET", "/surveys", short.token);
    expect(expired.status).toBe(401);
    expect((await expired.json()).error).toContain("expired");

    const forever = await token({ role: "viewer", expiresInDays: 0 });
    expect((await send("GET", "/surveys", forever.token)).status).toBe(200);
    expect((await send("DELETE", `/tokens/${forever.id}`, ADMIN)).status).toBe(204);
    const revoked = await send("GET", "/surveys", forever.token);
    expect(revoked.status).toBe(401);
    expect((await revoked.json()).error).toContain("revoked");
    expect((await send("GET", "/surveys", forever.token.slice(0, -2) + "xx")).status).toBe(401);
  });

  it("limits a token to its surveys and its own actions", async () => {
    const { send, token } = setup();
    await send("POST", "/surveys", ADMIN, survey);
    await send("POST", "/surveys", ADMIN, { ...survey, id: "other" });
    const scoped = await token({ actions: ["response:read"], surveyIds: ["team"] });
    expect((await send("GET", "/surveys/team/responses", scoped.token)).status).toBe(200);
    expect((await send("GET", "/surveys/other/responses", scoped.token)).status).toBe(403);
    expect((await send("GET", "/surveys", scoped.token)).status).toBe(403);
    expect((await send("PUT", "/surveys/team", scoped.token, survey)).status).toBe(403);
    // Respondents need no token.
    expect((await send("POST", "/surveys/team/responses", null, { answers: { q: "hi" } })).status).toBe(201);
  });
});

describe("OpenID Connect sign-in", () => {
  const ISSUER = "https://id.test";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const idToken = (claims: Record<string, unknown>, key = privateKey) => {
    const head = `${b64({ alg: "RS256", kid: "k1", typ: "JWT" })}.${b64(claims)}`;
    return `${head}.${sign("RSA-SHA256", Buffer.from(head), key).toString("base64url")}`;
  };

  function provider(claimsFor: (nonce: string) => Record<string, unknown>) {
    let nonce = "";
    const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/.well-known/openid-configuration")) {
        return Response.json({ authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, jwks_uri: `${ISSUER}/jwks` });
      }
      if (u === `${ISSUER}/jwks`) return Response.json({ keys: [jwk] });
      if (u === `${ISSUER}/token`) {
        const form = new URLSearchParams(String(init?.body));
        if (form.get("code") !== "good-code" || !form.get("code_verifier")) return new Response("no", { status: 400 });
        return Response.json({ id_token: idToken(claimsFor(nonce)) });
      }
      return new Response("?", { status: 404 });
    });
    return { fetch, setNonce: (n: string) => (nonce = n) };
  }

  function setupLogin(claimsFor: (nonce: string) => Record<string, unknown>) {
    const p = provider(claimsFor);
    const login = oidcLogin({
      issuer: ISSUER,
      clientId: "kvesto",
      clientSecret: "s3cret",
      redirectUri: "http://kvesto.test/auth/callback",
      sessionSecret: "session-secret-for-tests",
      role: (claims) => (claims.email === "ed@example.com" ? "editor" : claims.email === "vi@example.com" ? "viewer" : null),
      fetch: p.fetch as unknown as typeof fetch,
    });
    const repository = drizzleRepository(createSqliteDb(":memory:"));
    const app = createApp({ repository, authorize: anyAuthorize(login.authorize, tokenAuth({ store: repository })) });
    app.route("/", login.routes);
    /** Signs in through the mocked provider; returns the session cookie. */
    const signIn = async (code = "good-code") => {
      const start = await app.request("http://kvesto.test/auth/login");
      expect(start.status).toBe(302);
      const to = new URL(start.headers.get("location")!);
      expect(to.origin + to.pathname).toBe(`${ISSUER}/authorize`);
      expect(to.searchParams.get("code_challenge_method")).toBe("S256");
      p.setNonce(to.searchParams.get("nonce")!);
      const flow = start.headers.get("set-cookie")!.split(";")[0]!;
      expect(start.headers.get("set-cookie")).toMatch(/HttpOnly/i);
      const back = await app.request(`http://kvesto.test/auth/callback?code=${code}&state=${to.searchParams.get("state")}`, { headers: { cookie: flow } });
      return { back, cookie: (back.headers.get("set-cookie") ?? "").split(", ").find((c) => c.startsWith("kvesto_session="))?.split(";")[0] };
    };
    return { app, signIn };
  }

  const good = (nonce: string, email = "ed@example.com") => ({ iss: ISSUER, aud: "kvesto", sub: "u1", email, nonce, exp: Math.floor(Date.now() / 1000) + 300 });

  it("signs in, sets a secure session cookie and allows the role's actions", async () => {
    const { app, signIn } = setupLogin((n) => good(n));
    const { back, cookie } = await signIn();
    expect(back.status).toBe(302);
    expect(back.headers.get("set-cookie")).toMatch(/kvesto_session=.*HttpOnly.*Secure.*SameSite=Lax/i);
    const me = await (await app.request("http://kvesto.test/auth/me", { headers: { cookie: cookie! } })).json();
    expect(me).toMatchObject({ sub: "u1", email: "ed@example.com", role: "editor" });
    const put = await app.request("http://kvesto.test/surveys/team", {
      method: "PUT",
      body: JSON.stringify(survey),
      headers: { cookie: cookie!, "content-type": "application/json", origin: "http://kvesto.test" },
    });
    expect(put.status).toBe(200);
    expect((await app.request("http://kvesto.test/tokens", { headers: { cookie: cookie! } })).status).toBe(403);
  });

  it("refuses cookie writes from another site (CSRF)", async () => {
    const { app, signIn } = setupLogin((n) => good(n));
    const { cookie } = await signIn();
    const write = (headers: Record<string, string>) =>
      app.request("http://kvesto.test/surveys/team", { method: "PUT", body: JSON.stringify(survey), headers: { cookie: cookie!, "content-type": "application/json", ...headers } });
    const evil = await write({ origin: "https://evil.test" });
    expect(evil.status).toBe(403);
    expect((await evil.json()).error).toBe("Cross-site request refused");
    expect((await write({})).status).toBe(403);
    expect((await write({ "sec-fetch-site": "same-origin" })).status).toBe(200);
    // Reading doesn't need the check.
    expect((await app.request("http://kvesto.test/surveys", { headers: { cookie: cookie!, origin: "https://evil.test" } })).status).toBe(200);
  });

  it("refuses a bad state, a bad code, a wrong nonce, audience or expiry, and an account without a role", async () => {
    const { app } = setupLogin((n) => good(n));
    expect((await app.request("http://kvesto.test/auth/callback?code=good-code&state=x")).status).toBe(400);
    expect((await setupLogin((n) => good(n)).signIn("bad-code")).back.status).toBe(401);
    expect((await setupLogin((n) => ({ ...good(n), nonce: "other" })).signIn()).back.status).toBe(401);
    expect((await setupLogin((n) => ({ ...good(n), aud: "someone-else" })).signIn()).back.status).toBe(401);
    expect((await setupLogin((n) => ({ ...good(n), exp: 1 })).signIn()).back.status).toBe(401);
    expect((await setupLogin((n) => good(n, "stranger@example.com")).signIn()).back.status).toBe(403);
  });

  it("refuses an ID token signed with another key", async () => {
    const { verifyIdToken } = await import("../src/index.js");
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const token = idToken(good("n"), other);
    await expect(verifyIdToken(token, { jwks: { keys: [jwk] }, issuer: ISSUER, clientId: "kvesto", nonce: "n" })).rejects.toThrow("signature");
    await expect(verifyIdToken(idToken(good("n")), { jwks: { keys: [jwk] }, issuer: ISSUER, clientId: "kvesto", nonce: "n" })).resolves.toMatchObject({ sub: "u1" });
  });
});
