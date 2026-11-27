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
