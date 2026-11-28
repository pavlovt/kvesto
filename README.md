<p align="center"><img src="docs/assets/kvesto-banner.svg" alt="Kvesto: open source surveys, anywhere. Surveys from JSON." width="100%"></p>

# Kvesto

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/pavlovt/kvesto/badge)](https://scorecard.dev/viewer/?uri=github.com/pavlovt/kvesto)

Kvesto is a fully open source survey library. Define surveys as JSON and render them anywhere with a
lightweight JavaScript core. Build surveys visually in the editor and explore responses in the dashboard.

Storage is just a setting. Keep responses in the browser, plug in your own backend, or use the included Hono server
with SQLite and documented OpenAPI endpoints. Everything is MIT, including the editor and the dashboard.

> **Status:** early skeleton. The architecture, contracts and tests are in place; features are minimal. See
> [ROADMAP.md](ROADMAP.md) for what comes next.

**Documentation: https://pavlovt.github.io/kvesto/** (sources in [`docs/guide`](docs/guide)). Try the
[editor demo](https://pavlovt.github.io/kvesto/demo/).

## Quick start

```sh
npm install kvesto
```

```ts
import { mountSurvey } from "kvesto";
import "kvesto/styles.css"; // optional default theme

mountSurvey(document.getElementById("survey")!, {
  survey: {
    schemaVersion: 1, id: "hello", title: "Hello",
    pages: [{ id: "p1", elements: [{ id: "name", type: "text", title: "Your name", required: true }] }],
  },
  onComplete: ({ response }) => console.log(response.answers),
});
```

Next: [Getting started](docs/guide/getting-started.md) (storage, embedding, React and Vue),
[Survey JSON](docs/guide/survey-json.md) (question types, logic, languages, quizzes), [Results](docs/guide/results.md)
and the [Server](docs/guide/server.md).

## Packages

| Package | What it is |
| --- | --- |
| [`packages/kvesto`](packages/kvesto) | The `kvesto` npm package: one install that re-exports the core, plus a `<script>` bundle (`window.Kvesto`). |
| [`packages/schema`](packages/schema) | The survey JSON format (`schemaVersion: 1`) as Zod schemas, plus `migrateSurvey` for future format upgrades. |
| [`packages/core`](packages/core) | `createSurvey`, validation, paging, a plain-DOM renderer, `summarizeResponses`, and the `SurveyStorage` interface with three adapters. |
| [`packages/server`](packages/server) | REST API built with Hono, `@hono/zod-openapi` and Drizzle ORM on SQLite. Interactive docs at `/docs`. |
| [`packages/editor`](packages/editor) | `@kvesto/editor`: the embeddable survey editor (JSON editor, question palette, live preview) as a Svelte 5 component and a standalone bundle. |
| [`packages/dashboard`](packages/dashboard) | `@kvesto/dashboard`: the embeddable results dashboard as Svelte 5 components and a standalone bundle. |
| [`packages/export`](packages/export) | `@kvesto/export`: Excel export of responses, with no dependencies. |
| [`packages/react`](packages/react) | `@kvesto/react`: a `useSurvey` hook and a `<Survey>` component. |
| [`packages/vue`](packages/vue) | `@kvesto/vue`: a `useSurvey` composable and a `<Survey>` component. |
| [`apps/editor`](apps/editor) | SvelteKit demo app around `@kvesto/editor`. |
| [`apps/dashboard`](apps/dashboard) | SvelteKit demo app around `@kvesto/dashboard`. |
| [`apps/docs`](apps/docs) | The documentation site. It renders [`docs/guide`](docs/guide) and the package READMEs, and is deployed to GitHub Pages with the editor demo. |

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
pnpm dev:docs     # documentation site on :5175
```

The apps use `localStorage` by default. Set `VITE_KVESTO_API=http://localhost:3000` (see `.env.example` in each
app) to point them at the server.

Svelte markup is written in [BraceML](https://github.com/pavlovt/braceml) (`<template lang="braceml">`), compiled by
the `@braceml/svelte` preprocessor. `pnpm typecheck` compiles the templates first so svelte-check sees real markup.

## Security

Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md). What Kvesto treats as untrusted and
how it defends against it is in the [threat model](docs/threat-model.md).

## License

[MIT](LICENSE)
