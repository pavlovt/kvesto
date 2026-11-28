# Getting started

Kvesto is a fully open source survey library. Define surveys as JSON and render them anywhere with a lightweight
JavaScript core. Build surveys visually in the editor and explore responses in the dashboard.

Storage is just a setting. Keep responses in the browser, plug in your own backend, or use the included Hono server
with SQLite and documented OpenAPI endpoints. Everything is MIT, including the editor and the dashboard.

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
<div id="survey"></div>
<script src="https://cdn.jsdelivr.net/npm/kvesto@0.1/dist/kvesto.min.js"></script>
<script>
  Kvesto.mountSurvey(document.getElementById("survey"), {
    survey: { schemaVersion: 1, id: "hello", title: "Hello", pages: [{ id: "p1", elements: [
      { id: "name", type: "text", title: "Your name", required: true }
    ] }] },
    onComplete: ({ response }) => console.log(response.answers),
  });
</script>
```

The bundle exposes the whole core API as `window.Kvesto`. `kvesto` re-exports `@kvesto/core`, so the examples below
work with either import.

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

@kvesto/editor, @kvesto/dashboard (Svelte components) use the core with whichever adapter is configured.
```

| Package | What it is |
| --- | --- |
| `kvesto` | One install that re-exports the core, plus a `<script>` bundle (`window.Kvesto`). |
| `@kvesto/schema` | The survey JSON format (`schemaVersion: 1`) as Zod schemas, plus `migrateSurvey` for format upgrades. |
| `@kvesto/core` | `createSurvey`, validation, paging, a plain-DOM renderer, `summarizeResponses`, and the `SurveyStorage` interface with three adapters. |
| `@kvesto/server` | REST API built with Hono, `@hono/zod-openapi` and Drizzle ORM on SQLite. Interactive docs at `/docs`. |
| `@kvesto/editor` | The embeddable survey editor as a Svelte 5 component and a standalone bundle. |
| `@kvesto/dashboard` | The embeddable results dashboard as Svelte 5 components and a standalone bundle. |
| `@kvesto/export` | Excel export of responses, with no dependencies. |
| `@kvesto/react` | A `useSurvey` hook and a `<Survey>` component. |
| `@kvesto/vue` | A `useSurvey` composable and a `<Survey>` component. |

## Storage is configuration

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

### Hosted on the Kvesto server

The server serves each survey as a page at `/s/{id}` (with `?lang=`, `?layout=question`, `?theme=` and declared
hidden fields as URL parameters), and an embed script for any website:

```html
<div data-kvesto-survey="customer-feedback"></div>                                <!-- inline, sizes itself -->
<div data-kvesto-survey="customer-feedback" data-mode="popup" data-label="Feedback"></div>  <!-- a button -->
<div data-kvesto-survey="customer-feedback" data-mode="slide-in"></div>          <!-- a corner panel -->
<script src="https://example.com/api/s/embed.js" async></script>
```

The page runs with a strict Content Security Policy and no inline script; the frame only ever tells the page around
it its height and that it is done, never the answers, and the embed script only listens to frames it made on the
server's origin. `window.KvestoEmbed.inline(el, id)`, `.popup(id)` and `.slideIn(id)` do the same from script, and
the editor's Theme tab shows the snippets when you pass it `publicUrl`.

### In plain HTML or any framework: `<kvesto-survey>`

```html
<script type="module">
  import { defineSurveyElement } from "https://cdn.jsdelivr.net/npm/kvesto/dist/index.js";
  defineSurveyElement();
</script>
<kvesto-survey api="https://example.com/api" survey-id="customer-feedback" locale="de" theme="auto"></kvesto-survey>
```

The element also takes the survey as an inline `<script type="application/json">` child or as its `survey`
property, any other option as its `options` property, and fires `kvesto-complete` and `kvesto-change` events. It
renders into its own children, so your stylesheets apply.

### React

```sh
npm install @kvesto/react @kvesto/core react
```

```tsx
import { Survey, useSurvey } from "@kvesto/react";
import "@kvesto/core/styles.css";

// The bundled renderer, in a component. Every createSurvey and render option is a prop.
export function Feedback() {
  return <Survey survey={survey} theme="auto" onComplete={({ response }) => save(response)} />;
}

// Or your own UI on the headless model, re-rendering as answers change.
export function Custom() {
  const { model, state } = useSurvey({ survey });
  return (
    <form onSubmit={(e) => (e.preventDefault(), model.complete())}>
      {state.questions.map((q) => (
        <label key={q.id}>
          {String(q.title)}
          <input value={String(state.answers[q.id] ?? "")} onChange={(e) => model.setValue(q.id, e.target.value)} />
        </label>
      ))}
    </form>
  );
}
```

Pass a stable `survey` object: a new one rebuilds the survey.

### Vue

```sh
npm install @kvesto/vue @kvesto/core vue
```

```vue
<script setup lang="ts">
import { Survey, useSurvey } from "@kvesto/vue";
import "@kvesto/core/styles.css";

// Or a custom UI: `state` is a shallow ref that updates on every change.
const { model, state } = useSurvey({ survey });
</script>

<template>
  <Survey :survey="survey" :options="{ locale: 'de' }" :render="{ theme: 'auto' }" @complete="save" />
</template>
```

`options` takes any `createSurvey` option and `render` any render option.

## Next steps

- [Survey JSON](survey-json.md): question types, logic, expressions, languages, quizzes and the rest of the format.
- [Editor](../../packages/editor/README.md) and [dashboard](../../packages/dashboard/README.md): build surveys
  visually and explore the results, embedded in your own app.
- [Server](server.md): the REST API, hosting and security.
- [Accessibility](../../ACCESSIBILITY.md): the keyboard map and the WCAG conformance report.
