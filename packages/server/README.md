# @kvesto/server

Optional REST backend for [Kvesto](https://github.com/pavlovt/kvesto) surveys: [Hono](https://hono.dev) +
[Drizzle ORM](https://orm.drizzle.team), SQLite by default, with an OpenAPI 3.1 document and interactive docs.

```sh
npm install @kvesto/server
```

## Run it standalone

```sh
npx kvesto-server                              # http://localhost:3000, docs at /docs
KVESTO_DB=./data/kvesto.db PORT=8080 npx kvesto-server
KVESTO_API_KEYS=key1,key2 npx kvesto-server     # require a key for admin actions
KVESTO_ADMIN_ORIGINS=https://admin.example.com npx kvesto-server  # sites that may call the admin API
```

## Safe defaults

- Secure headers on every response (`nosniff`, a `default-src 'none'` CSP on the API, `X-Frame-Options: DENY`
  except for the hosted survey page, HSTS over HTTPS), and a request id (`X-Request-Id`). Errors are logged under
  that id; the reply has only the id, never the error.
- CORS by route: the respondent routes (load a survey, submit, resume, upload, the hosted page) allow any origin
  (`cors`, default `"*"`); the admin routes allow only `adminCors` (default none, so only the server's own origin).
- Size limits: request bodies (5 MB for surveys, 1 MB for other JSON), and `SURVEY_LIMITS` / `ANSWER_LIMITS` from
  `@kvesto/schema` (pages, elements, panel depth, choices, string length, condition depth, list and repeat sizes),
  checked on the raw JSON before it is parsed. Lower them with `createApp({ limits })`.
- Outbound requests (webhooks) go only to public HTTPS addresses, checked again after DNS resolution, with no
  redirects followed.

## Roles, API tokens and sign-in

Bringing your own `authorize` stays the main path. For teams that don't have one, the server comes with roles
(`ROLE_ACTIONS`: owner, editor, analyst, viewer), scoped API tokens and an OpenID Connect sign-in:

```ts
const repository = drizzleRepository(createSqliteDb("kvesto.db"));
const login = oidcLogin({
  issuer: "https://accounts.example.com",
  clientId: process.env.OIDC_CLIENT_ID!,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  redirectUri: "https://surveys.example.com/auth/callback",
  sessionSecret: process.env.KVESTO_SECRET!,
  role: (claims) => (claims.email === "me@example.com" ? "owner" : null), // or read a groups claim
  trustedOrigins: ["https://admin.example.com"],
});
const app = createApp({
  repository,
  authorize: anyAuthorize(login.authorize, tokenAuth({ store: repository, adminKeys: [process.env.KVESTO_ADMIN_KEY!] })),
});
app.route("/", login.routes); // /auth/login, /auth/callback, /auth/me, /auth/logout
```

- **Tokens:** `POST /tokens` with a `name`, a `role` (or a list of `actions`), optional `surveyIds` and
  `expiresInDays` (default 90) returns `kvt_…` once; only its hash is stored. `GET /tokens` lists them and
  `DELETE /tokens/{id}` revokes one. Managing tokens needs `token:manage` (owners and admin keys).
- **Sign-in:** the authorization code flow with PKCE, state and nonce; the ID token's signature (RS256 or ES256,
  from the provider's JWKS), issuer, audience and expiry are checked. The session is a signed `HttpOnly`, `Secure`,
  `SameSite=Lax` cookie; there is no user table.
- **CSRF:** a write with the session cookie is refused unless its `Origin` is the server's own or in
  `trustedOrigins` (or, without `Origin`, `Sec-Fetch-Site` is `same-origin`). Token requests don't send cookies and
  aren't affected.

## Audit log

Every admin request (refused ones too) adds an entry: who (`token:<id>`, `user:<sub>`, `admin-key`, `api-key`, or
what your own `authorize` sets with `setActor(c, "…")`), the action, method, path, survey, the reply's status, the
client address and the request id. `GET /audit` lists them oldest first (filters `actor`, `action`, `surveyId`,
`from`, `to`; page with `after` and `limit`) and `GET /audit.csv` exports them; both need `audit:read`.
`createApp({ audit: { onAudit: (entry) => siem.send(entry) } })` forwards each entry, and `audit: false` turns the
log off.

Each entry's `hash` covers the entry and the previous hash, so changing or deleting one breaks the chain from there
on: `await app.audit.verify()` returns `{ ok: true }` or the `seq` where it breaks. Keep a copy of the latest hash
elsewhere (`onAudit` is a good place) if you need to detect the end of the log being cut off too.

## Encryption at rest

```ts
const repository = drizzleRepository(createSqliteDb("kvesto.db"), {
  encryption: { keys: { "2026-06": process.env.KEY_JUNE!, "2026-01": process.env.KEY_JAN! }, current: "2026-06" },
});
```

Answers to `pii` questions and every uploaded file are stored encrypted (AES-256-GCM, 32-byte keys in base64). Each
value records its key's id, so to rotate: add a new key and make it `current` (new values use it, old ones still
read), run `repository.reencrypt()` (or `kvesto-server reencrypt`), then drop the old key. `reencrypt` also encrypts
what was stored before encryption was on, or before a question was marked `pii`. `kvesto-server` reads the keys from
`KVESTO_ENCRYPTION_KEYS=id:base64,id:base64` (the first one is current); make a key with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

The API reads and checks answers in the clear, so this protects the database file and its backups, not a server
whose keys are taken. File answers (name, type, URL) stay readable; the files themselves are encrypted. Encrypted
answers can't be used in the `answer=` list filter.

## Uploads

Every upload's real type is read from its first bytes. A file whose content doesn't match its declared type (HTML
sent as a PNG, a program as a JPEG) is refused, and so is an image or PDF with markup near its start (a polyglot).
File names lose path parts, control characters and bidi overrides. SVG, HTML and XML are always served as downloads.

```ts
createApp({
  repository,
  uploads: {
    surveyQuota: 500 * 1024 * 1024, // bytes for all of a survey's files (413 when full)
    responseQuota: 50 * 1024 * 1024, // bytes for the files of one response
    orphanAfterSeconds: 86_400, // app.uploads.sweep() deletes older files that no response refers to
    sweepEverySeconds: 3600, // run the sweep on its own
    scanFile: async (file, bytes) => (await clamav.scan(bytes)).clean || "Refused by the virus scanner",
    signedUrls: { ttlSeconds: 3600 }, // links stop working after an hour
  },
});
```

Files that a partial response refers to are kept too, so a respondent can come back to them. With `signedUrls`, the
upload returns a link with `expires` and `signature`, an expired or unsigned link answers 403, and the response list
and the CSV export sign every file link again, so admins always get working ones.

A ClamAV `scanFile` with the `clamscan` package:

```ts
import NodeClam from "clamscan";
const clam = await new NodeClam().init({ clamdscan: { host: "127.0.0.1", port: 3310 } });
const scanFile = async (_file, bytes) => {
  const { isInfected, viruses } = await clam.scanStream(Readable.from(Buffer.from(bytes)));
  return isInfected ? `Infected: ${viruses.join(", ")}` : true;
};
```

## Rate limits and spam

```ts
createApp({
  repository,
  rateLimit: { budgets: { "response:create": { limit: 10, windowSeconds: 600 } } }, // or `true` for the defaults
  clientAddress: { trustProxy: 1 }, // one load balancer in front sets X-Forwarded-For
  verifyChallenge: turnstileChallenge(process.env.TURNSTILE_SECRET!), // or hcaptchaChallenge, recaptchaChallenge
  signingSecret: process.env.KVESTO_SECRET, // shared by all servers
});
```

Budgets (`DEFAULT_BUDGETS`) are per client address and survey for `response:create`, `response:update` (progress
saves) and `file:upload`, and per address for all admin routes. Over a budget the server answers 429 with
`Retry-After`. `X-Forwarded-For` is ignored unless `trustProxy` says how many proxies to trust, so nobody can pick
their own address. The `kvesto-server` command turns rate limits on (`KVESTO_RATE_LIMIT=off` to disable,
`KVESTO_TRUST_PROXY=1` behind a proxy, `KVESTO_SECRET` for the signing and respondent secrets).

The default store keeps counts in memory. With several servers, share them, for example in Redis:

```ts
import { Redis } from "ioredis";
const redis = new Redis();
const store: RateLimitStore = {
  async hit(key, windowMs) {
    const [[, count], [, ttl]] = (await redis.multi().incr(key).pttl(key).exec()) as [[null, number], [null, number]];
    if (ttl < 0) await redis.pexpire(key, windowMs);
    return { count, resetAt: Date.now() + (ttl < 0 ? windowMs : ttl) };
  },
};
createApp({ repository, rateLimit: { store } });
```

Surveys can add bot friction with `settings.antiSpam`, enforced by the server:

- `honeypot: true`: the runner adds a field people can't see or reach; a response that fills it in is refused.
- `minSeconds`: `GET /surveys/{id}` returns a signed `X-Kvesto-Start` time, `httpStorage` sends it back, and a
  response sooner than this is refused (a resumed partial response counts from when it was created).
- `challenge: true`: the runner's `challenge` option returns a CAPTCHA token, sent as `meta.challenge` and checked
  by `verifyChallenge`.
- `duplicateWindow`: the same answers from the same address and browser within this many seconds are refused (409).

Refusals carry `reason: "spam"` or `"duplicate"`; the fields used for the checks aren't stored.

## Mount it in your own Hono app

```ts
import { createApp, createSqliteDb, drizzleRepository } from "@kvesto/server";

parent.route("/api/kvesto", createApp({ repository: drizzleRepository(createSqliteDb("kvesto.db")) }));
```

`createApp` takes any `SurveyRepository`, so another database can be
plugged in without touching the routes. Migrations run automatically when `createSqliteDb` opens the database.

| Method | Path | |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET, POST | `/surveys` | List / create surveys |
| GET, PUT, DELETE | `/surveys/{id}` | Read / create-or-replace / delete a survey |
| GET, POST | `/surveys/{id}/responses` | List (paginated) / submit responses |
| POST | `/surveys/{id}/files` | Upload a file for a file question |
| GET | `/surveys/{id}/files/{fileId}` | Download an uploaded file |
| GET | `/openapi.json`, `/docs` | OpenAPI document and API reference |

## Exposing the server

Without an `authorize` option the API is open: anyone who can reach it can edit or delete surveys and read every
response. That is fine on localhost, and `createApp` logs a warning so it is never an accident. Before putting the
server on a network, choose who may do what.

**API keys.** `apiKeyAuth` keeps what respondents need public (read a survey, submit a response, upload a file,
fetch an uploaded file by its unguessable URL) and asks for `Authorization: Bearer <key>` for everything else:

```ts
import { apiKeyAuth, createApp } from "@kvesto/server";

createApp({ repository, authorize: apiKeyAuth({ keys: [process.env.KVESTO_ADMIN_KEY!] }) });
// Lock down respondents too (e.g. internal surveys): apiKeyAuth({ keys, publicActions: [] })
```

On the browser side, pass the key with `httpStorage({ baseUrl, headers: { authorization: "Bearer …" } })`. A key in
a browser app is visible to its users, so only do that in an admin tool you host privately.

**Your own check.** `authorize(c, { action, surveyId })` runs before every API action, with the Hono context, so it
can read your session cookie or verify a JWT. Return `true` to allow, `false` for a 403, or your own `Response`:

```ts
createApp({
  repository,
  authorize: async (c, { action, surveyId }) => {
    if (action === "survey:read" || action === "response:create") return true;
    const user = await getUser(c.req.header("cookie"));
    return user?.canManage(surveyId) ?? false;
  },
});
```

The actions are `survey:list`, `survey:read`, `survey:write` (create, replace, delete), `response:create`,
`response:read`, `file:upload` and `file:read`. `/health`, `/openapi.json` and `/docs` are always public. Pass
`authorize: openAccess` to allow everything without the warning, for example in tests.

Point the browser side at it with `httpStorage({ baseUrl })` from [`@kvesto/core`](https://www.npmjs.com/package/@kvesto/core).

## Webhooks

`POST /surveys/{id}/webhooks` with `{ "url": "https://…", "events": ["response.completed", "response.updated"] }`
returns the webhook with a `secret`, shown only that once. Each event is POSTed as JSON:

```json
{ "event": "response.completed", "surveyId": "feedback", "sentAt": "…", "response": { "id": "…", "answers": { } } }
```

with `Kvesto-Event`, `Kvesto-Delivery` (an id, the same on retries) and `Kvesto-Signature: t=<unix seconds>,v1=<hex>`,
an HMAC-SHA256 of `t.body` with the secret. Check it on the receiving side against the raw body:

```ts
import { verifyWebhook } from "@kvesto/server"; // or the same few lines in any language:
// hmac = HMAC_SHA256(secret, `${t}.${rawBody}`); compare in constant time; refuse an old t (replays)
if (!verifyWebhook(secret, req.headers["kvesto-signature"], rawBody)) return res.status(401).end();
```

A delivery that doesn't get a 2xx is retried after 10 s, 1 min, 5 min, 30 min and 2 h, then marked failed;
`GET /surveys/{id}/webhooks/{webhookId}/deliveries` shows the log. Managing webhooks is the `webhook:manage` action
(admin-only with `apiKeyAuth`). For in-process integrations, `createApp({ onResponse: (event, response, survey) => … })`.

**Outbound requests are guarded.** The server only calls public https URLs: private, loopback, link-local and cloud
metadata addresses are refused after DNS resolution, checked again before every delivery (so a name that starts
pointing inside your network is caught), and redirects are never followed. For local development pass
`webhooks: { outbound: { allowHttp: true, allowPrivate: true } }`. The same check is exported as `guardOutboundUrl`.

## License

MIT
