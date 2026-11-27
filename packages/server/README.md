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
```

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

## License

MIT
