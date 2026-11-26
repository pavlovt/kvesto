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
```

## Mount it in your own Hono app

```ts
import { createApp, createSqliteDb, drizzleRepository } from "@kvesto/server";

parent.route("/api/kvesto", createApp({ repository: drizzleRepository(createSqliteDb("kvesto.db")) }));
```

Put your own auth middleware in front of it. `createApp` takes any `SurveyRepository`, so another database can be
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

Point the browser side at it with `httpStorage({ baseUrl })` from [`@kvesto/core`](https://www.npmjs.com/package/@kvesto/core).

## License

MIT
