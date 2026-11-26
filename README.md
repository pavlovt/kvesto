<p align="center"><img src="docs/assets/kvesto-banner.svg" alt="Kvesto: open source surveys, anywhere. Surveys from JSON." width="100%"></p>

# Kvesto

Kvesto is a fully open source survey library. Define surveys as JSON and render them anywhere with a
lightweight JavaScript core. Build surveys visually in the editor and explore responses in the dashboard.

Storage is just a setting. Keep responses in the browser, plug in your own backend, or use the included Hono server
with SQLite and documented OpenAPI endpoints. Everything is MIT, including the editor and the dashboard.

> **Status:** early skeleton. The architecture, contracts and tests are in place; features are minimal. See
> [ROADMAP.md](ROADMAP.md) for what comes next.

## Architecture

```
@kvesto/schema   Zod schemas for the versioned survey JSON (shared by core, server and the OpenAPI spec)
      │
@kvesto/core     createSurvey({ survey, storage? }), validation, paging, DOM renderer
      │          no backend and no framework required
      │
      ├── memoryStorage()          in-memory (tests, previews)
      ├── localStorageStorage()    responses stay in the browser
      └── httpStorage({ baseUrl }) ──REST + OpenAPI──▶ @kvesto/server (Hono + Drizzle, SQLite by default)

@kvesto/editor, @kvesto/dashboard (Svelte components) use the core with whichever adapter is configured;
apps/editor and apps/dashboard are SvelteKit demos around them.
```

| Package | What it is |
| --- | --- |
| [`packages/kvesto`](packages/kvesto) | The `kvesto` npm package: one install that re-exports the core, plus a `<script>` bundle (`window.Kvesto`). |
| [`packages/schema`](packages/schema) | The survey JSON format (`schemaVersion: 1`) as Zod schemas, plus `migrateSurvey` for future format upgrades. |
| [`packages/core`](packages/core) | `createSurvey`, validation, paging, a plain-DOM renderer, `summarizeResponses`, and the `SurveyStorage` interface with three adapters. |
| [`packages/server`](packages/server) | REST API built with Hono, `@hono/zod-openapi` and Drizzle ORM on SQLite. Interactive docs at `/docs`. |
| [`packages/editor`](packages/editor) | `@kvesto/editor`: the embeddable survey editor (JSON editor, question palette, live preview) as a Svelte 5 component and a standalone bundle. |
| [`packages/dashboard`](packages/dashboard) | `@kvesto/dashboard`: the embeddable results dashboard as Svelte 5 components and a standalone bundle. |
| [`apps/editor`](apps/editor) | SvelteKit demo app around `@kvesto/editor`. |
| [`apps/dashboard`](apps/dashboard) | SvelteKit demo app around `@kvesto/dashboard`. |

### Storage is configuration

The core never talks to a server on its own. It accepts any object that implements `SurveyStorage`:

```ts
interface SurveyStorage {
  loadSurvey(id: string): Promise<Survey | null>;
  saveSurvey(survey: Survey): Promise<Survey>;
  saveResponse(surveyId: string, response: ResponseInput): Promise<SurveyResponse>;
  listSurveys?(): Promise<SurveySummary[]>;          // editor and dashboard
  listResponses?(surveyId: string): Promise<SurveyResponse[]>;
  deleteSurvey?(id: string): Promise<void>;
}
```

Bundled adapters: `memoryStorage()`, `localStorageStorage()`, and `httpStorage({ baseUrl })` for the Kvesto server
(or any backend that speaks the same OpenAPI contract). Pass no storage at all and you get the response in `onComplete`.

## Install

```sh
npm install kvesto            # core + survey format, plus a <script> bundle
npm install @kvesto/server    # optional REST backend
npm install @kvesto/editor    # embeddable survey editor (Svelte component or standalone)
npm install @kvesto/dashboard # embeddable results dashboard (Svelte component or standalone)
```

Or without a build step:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/kvesto@0.1/styles.css" />
<script src="https://cdn.jsdelivr.net/npm/kvesto@0.1/dist/kvesto.min.js"></script>
<script>Kvesto.mountSurvey(document.getElementById("survey"), { survey, onComplete: console.log });</script>
```

`kvesto` re-exports `@kvesto/core`, so the examples below work with either import. Releases are described in
[RELEASING.md](RELEASING.md).

## Embedding a survey

```ts
import { mountSurvey } from "@kvesto/core";
import "@kvesto/core/styles.css"; // optional default theme

// 1. No backend: handle the answers yourself.
mountSurvey(document.getElementById("survey")!, {
  survey: mySurvey, // survey JSON object
  onComplete: ({ response }) => console.log(response.answers),
});

// 2. With the Kvesto server (or anything implementing the same REST contract).
import { httpStorage, loadSurvey, renderSurvey } from "@kvesto/core";
const storage = httpStorage({ baseUrl: "https://example.com/api" });
renderSurvey(el, await loadSurvey("customer-feedback", { storage }));
```

`SurveyModel` is DOM-free and its `subscribe` follows the Svelte store contract, so you can drive your own UI in
React, Vue or Svelte instead of using the bundled renderer.

### Survey JSON

```json
{
  "schemaVersion": 1,
  "id": "customer-feedback",
  "title": "Customer feedback",
  "pages": [
    {
      "id": "p1",
      "elements": [
        { "id": "email", "type": "text", "inputType": "email", "title": "Your email", "required": true },
        { "id": "nps", "type": "rating", "title": "How likely are you to recommend us?", "min": 0, "max": 10 },
        { "id": "role", "type": "single-choice", "title": "Your role",
          "choices": [{ "value": "dev", "label": "Developer" }, { "value": "pm", "label": "Product manager" }] }
      ]
    }
  ]
}
```

| Type | Answer | Notes |
| --- | --- | --- |
| `text`, `comment` | string | `text` takes `inputType`: email, number, date, url, tel |
| `single-choice`, `dropdown` | choice value | |
| `multiple-choice` | choice values | |
| `rating` | number | `min` (default 1) to `max` (default 5) |
| `boolean` | true / false | optional `labelTrue`, `labelFalse` |
| `matrix` | `{ row: column }` | `rows` × `columns` grid; `multiple: true` allows several columns per row (`{ row: [columns] }`); `required` means every row |
| `ranking` | choice values, best first | |
| `file` | `[{ name, type, size, url }]` | `accept`, `maxSize` (bytes), `maxFiles` (default 1) |

#### Conditional logic

Any question takes `visibleIf` and `requiredIf`; a page takes `visibleIf`. A condition is plain JSON, never code:

```json
{ "id": "why", "type": "comment", "title": "What went wrong?",
  "visibleIf": { "any": [
    { "question": "nps", "op": "lte", "value": 6 },
    { "question": "quality", "row": "support", "op": "eq", "value": "poor" }
  ] } }
```

Operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `notContains`, `in`, `notIn`, `empty`, `notEmpty`.
Combine them with `all`, `any` and `not`. Use `row` to test one row of a matrix. A condition can only refer to
questions that come earlier in the survey (a page condition: questions on earlier pages), which rules out cycles.
Hidden questions are skipped by validation, hidden pages by navigation, and answers to hidden questions are left
out of the response.

#### File uploads

Files are stored by the storage adapter's optional `uploadFile` as soon as the respondent picks them. `httpStorage`
sends them to the server; `memoryStorage`, `localStorageStorage` and runs without storage embed them in the answer
as base64 `data:` URLs (set `maxSize`: browsers cap localStorage at a few MB).

## The server

```sh
pnpm --filter @kvesto/server dev        # http://localhost:3000, docs at /docs
KVESTO_DB=./data/kvesto.db PORT=8080 pnpm --filter @kvesto/server start
```

| Method | Path | |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET, POST | `/surveys` | List / create surveys |
| GET, PUT, DELETE | `/surveys/{id}` | Read / create-or-replace / delete a survey |
| GET, POST | `/surveys/{id}/responses` | List (paginated) / submit responses |
| POST | `/surveys/{id}/files` | Upload a file for a file question (multipart: `questionId`, `file`) |
| GET | `/surveys/{id}/files/{fileId}` | Download an uploaded file |
| GET | `/openapi.json`, `/docs` | OpenAPI 3.1 document and Scalar API reference |

Responses are validated against the survey with the same rules the core uses, including conditional logic.
Uploads are checked against the question's `accept` and `maxSize` and a server-wide cap (`createApp({ maxFileSize })`,
10 MB by default), stored in the database, and served back as downloads unless they are images, PDF or plain text.
To mount the API inside an existing
Hono app (and add your own auth middleware in front of it):

```ts
import { createApp, createSqliteDb, drizzleRepository } from "@kvesto/server";
parent.route("/api/kvesto", createApp({ repository: drizzleRepository(createSqliteDb("kvesto.db")) }));
```

`createApp` takes any `SurveyRepository`, so a Postgres or MySQL implementation (Drizzle supports both) can be
dropped in without touching the routes. Migrations live in `packages/server/drizzle` (`pnpm --filter @kvesto/server db:generate`).

## Development

Requires Node 20+ and pnpm 10.

```sh
pnpm install
pnpm build        # all packages and apps
pnpm typecheck
pnpm test         # schema, core (incl. DOM rendering) and API tests
pnpm dev:server   # API on :3000
pnpm dev:editor   # editor on :5173
pnpm dev:dashboard
```

The apps use `localStorage` by default. Set `VITE_KVESTO_API=http://localhost:3000` (see `.env.example` in each
app) to point them at the server.

Svelte markup is written in [BraceML](https://github.com/pavlovt/braceml) (`<template lang="braceml">`), compiled by
the `@braceml/svelte` preprocessor. `pnpm typecheck` compiles the templates first so svelte-check sees real markup.

## License

[MIT](LICENSE)
