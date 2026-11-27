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
| `grid` | `{ row: { column: value } }` | `rows` × `columns`, each column with a `cellType` (text, number, dropdown with `choices`, boolean), optional `required` and `validators` |
| `ranking` | choice values, best first | |
| `file` | `[{ name, type, size, url }]` | `accept`, `maxSize` (bytes), `maxFiles` (default 1) |

#### Panels

A `panel` groups questions (and other panels) under an optional title and description. It takes `visibleIf`, and
hiding it hides everything inside. Panels only change the layout: question ids stay unique across the survey and
answers stay flat, keyed by question id.

```json
{ "id": "pet", "type": "panel", "title": "About your pet",
  "visibleIf": { "question": "hasPet", "op": "eq", "value": true },
  "elements": [
    { "id": "petName", "type": "text", "title": "Name", "required": true },
    { "id": "petAge", "type": "rating", "title": "Age", "min": 0, "max": 20 }
  ] }
```

#### Repeating panels

Give a panel `repeat` and respondents add and remove copies of its contents, for example one per child. The answer
is stored under the panel id as a list of items, each keyed by question id:

```json
{ "id": "children", "type": "panel", "title": "Children",
  "repeat": { "min": 1, "max": 5, "addLabel": "Add a child", "itemTitle": "Child {n}" },
  "elements": [
    { "id": "name", "type": "text", "title": "Name", "required": true },
    { "id": "age", "type": "rating", "title": "Age", "min": 0, "max": 18 },
    { "id": "school", "type": "text", "title": "School",
      "visibleIf": { "question": "age", "op": "gte", "value": 6, "scope": "item" } }
  ] }
```

```json
{ "children": [{ "name": "Ana", "age": 7, "school": "Elm Street" }, { "name": "Ivo", "age": 4 }] }
```

A condition inside a repeating panel compares the same item with `"scope": "item"`, or any earlier question outside
the panel without it. Questions outside cannot refer to questions inside, since those have one answer per item. The
runner starts with `min` items; `SurveyModel` has `addItem`, `removeItem`, `setItemValue` and `getItems`, and item
errors use keys like `children.0.name`. Repeating panels cannot be nested, and cannot hold file questions yet.

#### Conditional logic

Any question takes `visibleIf` and `requiredIf`; pages and panels take `visibleIf`. A condition is plain JSON, never code:

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

#### Expressions

Wherever a condition goes, `{ "expr": "..." }` can stand in for a comparison, alone or inside `all` / `any` / `not`:

```json
{ "id": "discount", "type": "text", "title": "Discount code",
  "visibleIf": { "expr": "age({birthdate}) >= 65 or ({members} > 3 and {plan} = 'family')" } }
```

Expressions are parsed by Kvesto's own small parser into a syntax tree and evaluated over it, never with `eval`.
The schema checks that an expression parses and only refers to earlier questions.

| Syntax | |
| --- | --- |
| `{q}`, `{matrix.row}`, `{grid.row.column}` | An earlier answer. Inside a repeating panel, `{$item.q}` is the same item's answer. An unanswered question is `null`. |
| `1`, `2.5`, `'text'`, `"text"`, `true`, `false`, `null` | Literals |
| `or`, `and`, `not` | Logic, loosest first |
| `=` (`==`), `!=` (`<>`), `<`, `<=`, `>`, `>=` | Comparisons. Numeric text compares as a number; dates as `YYYY-MM-DD` text. |
| `+`, `-`, `*`, `/`, `%` | Arithmetic. `+` joins text when either side isn't a number. Division by zero gives `null`. |

Functions: `iif(cond, a, b)`, `isEmpty(x)`, `count(x)`, `sum(…)`, `avg(…)`, `min(…)`, `max(…)`, `round(x, digits)`,
`abs(x)`, `number(x)`, `length(x)`, `lower(x)`, `upper(x)`, `trim(x)`, `concat(…)`, `contains(list or text, x)`,
`today()`, `age(date)`, `dateDiff(from, to, "days" | "months" | "years")` and `year(date)`. Register your own on
both sides under the same name:

```ts
const functions = { vatValid: (code) => checkVat(String(code)) };
createSurvey({ survey, functions });                     // in the browser
createApp({ repository, authorize, functions });          // on the server
```

A survey that calls a function the runner or the server doesn't have is refused when it is loaded or saved, and an
expression that fails while it runs counts as false.

#### Answer piping

Titles, descriptions, choice labels, page and panel titles, repeat item titles and the survey's `completedText` can
show earlier answers with `{questionId}` placeholders, updated as the respondent types:

```json
{ "id": "why", "type": "comment", "title": "Why did you pick {color}, {name}?" }
```

Choices show their labels, lists are joined with commas, `{matrix.row}` and `{grid.row.column}` pick one part, and
inside a repeating panel `{$item.q}` is the same item's answer (so `"itemTitle": "Child {n}: {$item.name}"` works).
A question hidden by logic pipes as empty. Piped answers are always inserted as text, never as HTML. A placeholder
may only name an earlier question; braces around anything that isn't a question id stay as written, and `{{` and
`}}` give literal braces. For a custom UI, `model.text(raw)` does the same.

#### Validators

Any question takes a `validators` list. Each rule runs on a non-empty answer, in order, in the runner and on the
server; the first failure is shown, with the rule's optional `message` instead of the default one:

```json
{ "id": "zip", "type": "text", "title": "Postal code",
  "validators": [{ "type": "pattern", "pattern": "[0-9]{4}", "message": "Use four digits" }] }
```

| Validator | Applies to | Fields |
| --- | --- | --- |
| `pattern` | text, comment | `pattern` (must match the whole answer), `flags` (`i`, `m`, `s`, `u`) |
| `length` | text, comment | `min`, `max` characters |
| `range` | rating, text with `inputType` number or date | `min`, `max` (numbers, or `YYYY-MM-DD` for dates) |
| `count` | multiple-choice, file, matrix | `min`, `max` options picked, files attached, or rows answered |
| `email`, `url` | text | |
| `custom` | any | `name` of a function you register, optional `options` |

Custom rules are functions registered on both sides under the same name. They get the answer, the validator's
`options` and the visible answers, and return `true`, `false` or an error message:

```ts
const validators = { invite: (value) => isKnownInvite(String(value)) || "Unknown invite code" };
createSurvey({ survey, validators });                     // in the browser
createApp({ repository, authorize, validators });          // on the server
```

A `custom` validator whose function isn't registered never passes, so a missing registration can't let bad data in.

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
