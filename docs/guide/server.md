# Server

`@kvesto/server` is the optional REST backend: Hono and Drizzle ORM on SQLite, with an OpenAPI 3.1 document and an
interactive API reference. Point the browser side at it with `httpStorage({ baseUrl })`. Authentication, roles,
webhooks, encryption and rate limits are in the [server reference](../../packages/server/README.md).

## Run it

```sh
npx kvesto-server                              # http://localhost:3000, docs at /docs
KVESTO_DB=./data/kvesto.db PORT=8080 npx kvesto-server
```

From a checkout of this repository, `pnpm dev:server` does the same.

## Routes

| Method | Path | |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET, POST | `/surveys` | List / create surveys |
| GET, PUT, DELETE | `/surveys/{id}` | Read / create-or-replace / delete a survey |
| GET, POST | `/surveys/{id}/responses` | List / submit responses. Lists take `limit` with `cursor` (from `nextCursor`) or `offset`, and filter with `status`, `from`, `to`, `answer=q:value` and `hidden=name:value`. |
| GET | `/s/{id}`, `/s/embed.js` | The hosted survey page and the embed script |
| GET | `/surveys/{id}/responses.csv` | Export responses as CSV (same filters; `values=true` for choice values) |
| GET, POST, DELETE | `/surveys/{id}/webhooks` … | Webhooks, signed and retried, with a delivery log |
| POST | `/surveys/{id}/files` | Upload a file for a file question (multipart: `questionId`, `file`) |
| GET | `/surveys/{id}/files/{fileId}` | Download an uploaded file |
| GET | `/openapi.json`, `/docs` | OpenAPI 3.1 document and Scalar API reference |

Responses are validated against the survey with the same rules the core uses, including conditional logic.
The server sends secure headers, allows any origin only on the respondent routes (`adminCors` lists the sites that
may call the admin routes), and refuses oversized documents and answers; see
[safe defaults](../../packages/server/README.md#safe-defaults).

## Uploads

Uploads are checked against the question's `accept` and `maxSize` and a server-wide cap (`createApp({ maxFileSize })`,
10 MB by default), and their real type is read from their first bytes: a file whose content doesn't match its type,
or an image with a page hidden in it, is refused. Names are cleaned, and files are served back as downloads unless
they are raster images, PDF or plain text (never SVG, HTML or XML inline). Quotas, a virus-scan hook, clean-up of
unused uploads and expiring file links are in the [server reference](../../packages/server/README.md#uploads).

## In your own Hono app

Mount the API inside an existing Hono app, and add your own auth middleware in front of it:

```ts
import { createApp, createSqliteDb, drizzleRepository } from "@kvesto/server";
parent.route("/api/kvesto", createApp({ repository: drizzleRepository(createSqliteDb("kvesto.db")) }));
```

`createApp` takes any `SurveyRepository`, so a Postgres or MySQL implementation (Drizzle supports both) can be
dropped in without touching the routes. Migrations live in `packages/server/drizzle`
(`pnpm --filter @kvesto/server db:generate`).

## Security

Before putting the server on a network, read [exposing the server](../../packages/server/README.md#exposing-the-server).
Report vulnerabilities privately, as described in [SECURITY.md](../../SECURITY.md). What Kvesto treats as untrusted
and how it defends against it is in the [threat model](../threat-model.md).
