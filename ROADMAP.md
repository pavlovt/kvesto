# Kvesto roadmap

This is the plan for growing Kvesto from today's skeleton into a full survey toolkit, one small step at a time.
Each milestone is meant to be one focused change on `main`: it builds, type-checks and passes tests on its own, and
can ship in a patch or minor release without waiting for the next one.

Milestones marked **★** are ideas that go beyond the original feature list. They come from looking at how other
form and survey tools solve the same problems (conversational forms, headless form renderers, open source
experience-management tools, embeddable form builders) and picking the parts that fit Kvesto's goal of being easy
to embed. Only ideas are taken; no code is copied from any other project.

## Ground rules for every milestone

- **The schema leads.** Format changes land in `@kvesto/schema` first. Additive changes (new optional fields, new
  element types) stay on `schemaVersion: 1`. A change that would make an existing valid document invalid, or
  change its meaning, bumps `SURVEY_SCHEMA_VERSION` and adds a step to `migrateSurvey`.
- **Conditions and expressions are data, never code.** Nothing in a survey document is ever passed to `eval`,
  `Function` or `innerHTML`. This is what lets the server validate untrusted survey JSON safely.
- **The core stays backend-free and framework-free.** New storage needs are optional methods on `SurveyStorage`.
- **Server parity.** Anything the runner validates, the server validates too, through the same core functions
  (`validateAnswers` today). Every new route uses `createRoute` and gets a test in `packages/server/test/api.test.ts`.
- **Svelte markup is BraceML.** New editor and dashboard UI follows `AGENTS.md`.
- **Done means:** tests for the new behaviour, `pnpm build && pnpm typecheck && pnpm test` green, the README or
  package README updated, and the editor's question palette and the dashboard handling the feature (or a note in the
  milestone saying why not yet).

## Where Kvesto is today

Read from the code at v0.1.2:

- **Format** (`packages/schema/src/schemas.ts`): pages hold a flat `elements` list of ten question types (text,
  comment, single choice, multiple choice, dropdown, rating, boolean, matrix, ranking, file). Conditional logic is a
  JSON tree (`visibleIf`, `requiredIf`) of comparisons with `all`/`any`/`not`, and may only refer to earlier
  questions, so `resolveLogic` needs a single pass.
- **Validation** (`packages/core/src/validate.ts`): type checks, `required`, an email check for `inputType: "email"`,
  and file limits. There are no configurable validators.
- **Runner** (`model.ts`, `render.ts`): a headless `SurveyModel` with a Svelte-store-style `subscribe`, and a plain
  DOM renderer with English labels that can be overridden one by one. One page at a time.
- **Editor** (`packages/editor`): a JSON text area, "add question" buttons and a live preview. There is no visual
  structure, property panel or undo yet.
- **Dashboard** (`packages/dashboard`): per-question summaries from `summarizeResponses`. No filters, table view or
  export.
- **Server** (`packages/server`): CRUD for surveys, responses and files, OpenAPI docs. **No authentication**: any
  client can create, overwrite or delete surveys and read every response.

Two things in the code shape the order below:

1. Many places assume questions sit directly in `page.elements` (`pages.flatMap((p) => p.elements)` appears in the
   model, logic, validation, summary and editor). Panels turn that list into a tree, so that assumption should be
   removed once, before anything else grows on top of it.
2. The editor is a text area today. A "drag and drop editor" really means three things: an editor document model
   with undo/redo, a structure view with a property panel, and then drag and drop on top. Building it after panels
   exist means the tree UI and drag and drop are designed once, for nested content, not twice.

## Recommended order

The suggested start was **panels, validators, drag-and-drop editor**. I recommend the same three, in a slightly
different order, with one small foundation step in front and one security step early:

| # | Milestone | Why here |
| --- | --- | --- |
| M1 | Foundations: element helpers, text alias, published JSON Schema | Removes the flat-list assumption; zero behaviour change. |
| M2 | ★ Server access control | The published server has open write routes. Fix before people deploy it. |
| M3 | Validators | Smallest, self-contained, and the server enforces them for free. |
| M4 | Panels | The structural change everything else (editor, repeats) builds on. |
| M5–M6 | Repeating panels and grid questions | Finish the containers, so the editor is built against the final tree shape. Either can be pushed later if the editor matters more. |
| M7–M10 | Visual editor: document model with undo/redo, structure and property panel, drag and drop, logic builder | Needs panels in the model so the tree UI is designed once. |

After that the phases can be taken in almost any order; dependencies are listed per milestone.

---

## Phase 1 · Foundations

### M1 · Element helpers, a text alias and a published JSON Schema

- **Scope:**
  - Add `allQuestions(survey)`, `walkElements(survey, fn)` and `findElement(survey, id)` to `@kvesto/schema` and
    replace every `pages.flatMap((p) => p.elements)` in core, server, editor and dashboard with them.
  - Add `DisplayTextSchema = z.string()` and use it for every human-readable string (titles, descriptions, labels,
    placeholders). It is a plain string for now; M20 (localization) widens it in one place.
  - **★ Publish the survey format as JSON Schema** (`@kvesto/schema/survey.schema.json`, generated from Zod at build
    time). Editors such as VS Code then autocomplete and validate survey files, and non-JS backends can validate
    surveys without Kvesto.
- **Packages:** schema, core, server, editor, dashboard.
- **Schema impact:** none (v1). The JSON Schema file is a new build output.
- **Done when:** no behaviour change, all existing tests pass, a test checks the generated JSON Schema accepts the
  fixtures and rejects an invalid document, and `package.json` exports the schema file.

### M2 · ★ Server access control

- **Scope:** an `authorize(c, action)` option on `createApp`, where `action` is one of `survey:read`,
  `survey:write`, `response:create`, `response:read`, `file:upload`, `file:read`. The default stays open for local
  development but logs a startup warning. Ship an `apiKeyAuth({ keys })` helper (Bearer token for admin actions,
  public read and submit) and document how to plug in an existing session or JWT check. Add `auth` support to
  `httpStorage` (a header or a `fetch` override). Mark secured operations in the OpenAPI spec.
- **Packages:** server, core (`adapters/http.ts`).
- **Schema impact:** none.
- **Done when:** API tests cover allowed and refused calls for every route, the editor and dashboard demo apps pass a
  key from `VITE_KVESTO_API_KEY`, and the server README has an "Exposing the server" section.

## Phase 2 · Structure and validation

### M3 · Validators

- **Scope:** an optional `validators` array on every question, each with an optional custom `message`:
  - `pattern` (`pattern`, `flags`) for text and comment,
  - `length` (`min`, `max` characters),
  - `range` (`min`, `max`) for numbers, ratings and dates in text questions with `inputType: "number"` or `"date"`,
  - `count` (`min`, `max`) for multiple choice, file and answered matrix rows,
  - `email` and `url` (the current email check becomes the built-in default for `inputType: "email"`).
  - A `custom` validator (`{ "type": "custom", "name": "vatNumber" }`) that calls a function registered with
    `createSurvey({ validators: { vatNumber } })` and `createApp({ validators })`. An unregistered name is a clear
    error, not a silent pass.
- **Safety:** regex patterns are length-limited and compiled once; the schema rejects invalid patterns. The server
  runs the same validators through `validateAnswers`.
- **Packages:** schema, core, server (custom validator option), editor (palette defaults only).
- **Schema impact:** additive (v1).
- **Done when:** unit tests for each validator and each question type it applies to, a server test that rejects a
  response breaking a validator, and the renderer shows the custom message.

### M4 · Panels

- **Scope:** a new `panel` element that groups questions and can be nested:
  `{ "type": "panel", "id", "title"?, "description"?, "visibleIf"?, "elements": [...] }`.
  Hiding a panel hides everything in it. Question ids stay unique across the whole survey and **answers stay flat**,
  keyed by question id, so responses, the dashboard and the server's storage do not change. The schema's
  "earlier questions only" rule follows document order through panels. The renderer outputs `fieldset`/`legend`.
- **Packages:** schema, core (logic, validate, render, summary), editor (add panel), dashboard (group headings).
- **Schema impact:** additive (v1). `PageSchema.elements` becomes `Element[]` where `Element = Question | Panel`;
  every existing document is still valid.
- **Done when:** logic tests for nested visibility, a render test for nested fieldsets, and summary output unchanged
  for surveys without panels.

### M5 · Repeating panels

- **Scope:** a panel with `repeat: { min?, max?, addLabel?, removeLabel? }`. The respondent adds and removes copies.
  The answer is stored under the panel id as an array of answer objects:
  `{ "children": [{ "name": "Ana", "age": 7 }, { "name": "Ivo", "age": 4 }] }`.
  Conditions inside a repeat can refer to earlier questions in the same item (new optional `scope: "item"` on a
  comparison) or to anything earlier outside it. Summaries aggregate every item.
- **Depends on:** M4.
- **Packages:** schema (`AnswerValueSchema` gains an array of answer records), core, server, dashboard.
- **Schema impact:** additive (v1). The answer union grows, which is a type change for TypeScript users; note it in
  the release notes.
- **Done when:** validation, logic and summary tests for repeats, and a server round-trip test.

### M6 · Grid questions (matrix with cell inputs)

- **Scope:** a new `grid` question: rows and columns, where each column has a `cellType` (`dropdown`, `text`,
  `number`, `boolean`) and optional column choices and validators. Answer: `{ [row]: { [column]: value } }`.
  Optional `addRows: true` lets respondents add their own rows (row answers keyed by generated ids). Kept as a
  separate type so the existing `matrix` answer shape does not change.
- **Depends on:** M3 (column validators).
- **Packages:** schema, core, editor palette, dashboard.
- **Schema impact:** additive (v1).
- **Done when:** validate, render and summary tests; dashboard shows per-column summaries.

## Phase 3 · Visual editor

### M7 · Editor document model with undo and redo

- **Scope:** a pure TypeScript model inside `@kvesto/editor` (`src/lib/doc/`): commands such as `addElement`,
  `removeElement`, `moveElement(id, parentId, index)`, `updateElement(id, patch)`, `addPage`, with a command history
  for undo/redo and a selection. The JSON text area becomes a "Source" tab that edits the same model. Undo and redo
  buttons plus Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.
- **Depends on:** M4 (so moves already handle nesting).
- **Packages:** editor.
- **Schema impact:** none.
- **Done when:** the commands are unit-tested without a DOM (including undo of every command), and the editor
  component's public props do not change.

### M8 · Structure view and property panel

- **Scope:** a three-column editor: an outline of pages, panels and questions; the live preview where clicking a
  question selects it; and a property panel for the selection (title, description, required, type-specific fields,
  a choices list editor, and the validators from M3). Reordering with up/down buttons, so everything works before
  drag and drop exists and stays keyboard accessible.
- **Depends on:** M7.
- **Packages:** editor (BraceML), apps/editor.
- **Schema impact:** none.
- **Done when:** a component test edits a question through the property panel and sees the JSON change, and a
  survey can be built end to end without touching JSON.

### M9 · Drag and drop

- **Scope:** drag from the palette into a page or panel, reorder within and across pages and panels, with drop
  indicators. Built on pointer events, no drag library. Keyboard drag and drop (pick up with Space, move with arrow
  keys, drop with Space, cancel with Escape) and live-region announcements for screen readers. Every drop is one
  `moveElement` or `addElement` command, so undo just works.
- **Depends on:** M8.
- **Packages:** editor.
- **Schema impact:** none.
- **Done when:** a Playwright test drags a question into a panel and undoes it, and the keyboard path has its own test.

### M10 · Visual logic builder

- **Scope:** a condition builder in the property panel for `visibleIf`, `requiredIf` and page `visibleIf`: pick a
  question, an operator and a value, and group with all/any/not. It only offers earlier questions, which matches the
  schema rule, and shows the condition in plain words ("Shown when Role is Developer").
- **Depends on:** M8. Picks up expressions after M11.
- **Packages:** editor.
- **Schema impact:** none.
- **Done when:** component tests build each operator and a nested group, and an invalid reference cannot be created.

## Phase 4 · Expressions and dynamic content

### M11 · Expression engine

- **Scope:** a small, safe expression language in core: a hand-written parser that turns text such as
  `{age} >= 18 and {role} = 'dev'` or `sum({q1}, {q2}) * 2` into a JSON syntax tree, and an evaluator over that tree.
  Arithmetic, comparison, `and`/`or`/`not`, string and date helpers (`today()`, `age({birthdate})`, `iif()`,
  `count()`, `sum()`, `avg()`), and custom functions registered on `createSurvey` and `createApp`. Never uses
  `eval`. A condition can be written as `{ "expr": "..." }` next to the existing JSON comparisons, and the schema
  checks that it parses and only refers to earlier questions.
- **Packages:** schema (expression node, parse check), core (parser, evaluator), server (custom functions option).
- **Schema impact:** additive (v1).
- **Done when:** parser and evaluator tests (including malformed input, deep nesting limits and unknown functions),
  and existing JSON conditions behave exactly as before.

### M12 · Answer piping

- **Scope:** `{questionId}` placeholders in titles, descriptions, choice labels and the completion message, filled
  with the current answer (choice values shown as labels). Rendered as text, never as HTML. A placeholder may only
  refer to an earlier question.
- **Depends on:** M1. Formatting such as `{price:currency}` uses M11 if available, so this can also ship before it.
- **Packages:** schema (reference check), core (render), editor (insert-answer helper).
- **Schema impact:** additive (v1). Text that already contains braces keeps working; a `{{` escape is documented.
- **Done when:** render tests including a hidden referenced question (renders empty) and an escaped brace.

### M13 · Calculated values and expression fields

- **Scope:** survey-level `variables: [{ "name": "total", "expr": "..." }]` usable in conditions, piping and
  validators, an `expression` validator (`{ "type": "expression", "expr": "{end} > {start}" }`), and a read-only
  `computed` question type that shows a calculated value and can store it with the response.
- **Depends on:** M11, M3.
- **Packages:** schema, core, server, editor palette, dashboard (computed values summarised like numbers).
- **Schema impact:** additive (v1).
- **Done when:** tests for variable dependency order, cycles rejected by the schema, and server-side recomputation
  (the server recalculates computed answers rather than trusting the client).

### M14 · Triggers

- **Scope:** `triggers: [{ "when": <condition>, "action": ... }]` with actions `setValue`, `copyValue`,
  `skipToPage` and `complete`. Evaluated on every answer change in the model.
- **Depends on:** M11.
- **Packages:** schema, core, editor (trigger list in survey settings).
- **Schema impact:** additive (v1).
- **Done when:** model tests for each action, including that triggers cannot loop forever.

## Phase 5 · More question types

### M15 · Question type registry (custom question types)

- **Scope:** a public `registerQuestionType({ type, schema, render, validate, summarize, editorDefaults })` API.
  Custom types use `type` names with a prefix (for example `"x-signature"`), validated by their registered Zod schema
  at runtime. Unregistered custom types fail with a clear message. The built-in types move onto the same internal
  registry, so the next milestones dogfood it.
- **Packages:** schema (a `CustomQuestionSchema` for `x-*` types), core, editor, dashboard, server (types registered
  on `createApp`).
- **Schema impact:** additive (v1).
- **Done when:** a test package registers a custom type and it renders, validates on the server and shows in the
  dashboard.

### M16 · Content blocks

- **Scope:** non-question elements: `content` (formatted text from a small safe Markdown subset: bold, italic,
  links, lists) and `image` (`src`, `alt`, `width`). They take `visibleIf` and support piping. Raw HTML is only
  allowed when the host passes a `sanitizeHtml` function, so the default can never inject markup.
- **Depends on:** M4 (elements are no longer questions only), M15.
- **Packages:** schema, core, editor.
- **Schema impact:** additive (v1).
- **Done when:** render tests prove script and event-handler injection are escaped.

### M17 · Input question types

- **Scope:** `multi-text` (several labelled inputs, answer is an object), `slider` (`min`, `max`, `step`), `tags`
  (searchable multi-select with optional free entry; also `searchable: true` on `dropdown`), and `image-choice`
  (choices with `imageUrl`, single or multiple).
- **Depends on:** M15 (built on the registry).
- **Packages:** schema, core, editor palette, dashboard.
- **Schema impact:** additive (v1).
- **Done when:** each type has validate, render and summary tests.

### M18 · Signature

- **Scope:** a `signature` question drawn on a canvas (pointer and touch), saved as a PNG through the existing
  `uploadFile` path, so the answer is a `FileAnswer` and the server's file handling is reused.
- **Depends on:** M15.
- **Packages:** schema, core, dashboard (thumbnail).
- **Schema impact:** additive (v1).
- **Done when:** a render test with a mocked canvas and a server upload round trip.

## Phase 6 · Runner experience

### M19 · ★ One question at a time

- **Scope:** a `layout: "question"` render option (and an optional `settings.layout` hint in the survey) that shows a
  single question per screen with a progress bar, Enter to continue, number keys for choices, and auto-advance on
  single-choice answers. The model gains question-level stepping that respects logic. Pages still group questions
  for logic; this is a presentation mode.
- **Packages:** core (model stepping, render), schema (optional `settings`), editor (preview toggle).
- **Schema impact:** additive (v1).
- **Done when:** model tests for stepping across hidden questions and pages, and a keyboard-only render test.

### M20 · Localization

- **Scope:** `DisplayTextSchema` (from M1) widens to `string | { [locale]: string }`, with `locales` and
  `defaultLocale` on the survey and a `locale` option on `createSurvey`/`mountSurvey`. Built-in UI labels become
  locale packs (English first, plus Bulgarian; contributions welcome). Validation messages use the same packs. An
  editor translation tab lists every string per locale with missing ones highlighted.
- **Depends on:** M1. Easier the earlier it lands, since every later milestone adds strings.
- **Packages:** schema, core, editor, dashboard (labels in the selected locale).
- **Schema impact:** additive (v1). A plain string still means "the default locale".
- **Done when:** render tests in two locales, fallback to the default locale for missing strings, and the editor
  tab can add a locale.

### M21 · ★ Partial responses and resume

- **Scope:** save progress as the respondent goes, so drop-offs are visible and people can come back.
  - Core: an optional `SurveyStorage.saveProgress(surveyId, draft)` that returns a resume token; the model calls it
    (debounced) after page changes. `localStorageStorage` keeps drafts in the browser; `createSurvey({ resume })`
    restores answers and page.
  - Server: responses get `status: "partial" | "complete"` and `updatedAt`; `PATCH /surveys/{id}/responses/{rid}`
    with the resume token. A Drizzle migration adds the columns.
  - Dashboard: completion rate and a per-question drop-off view.
- **Packages:** schema (response status), core, server, dashboard.
- **Schema impact:** additive (v1) on the response format; database migration on the server.
- **Done when:** API tests for create, update and complete with a token, a test that a partial response cannot be
  overwritten without its token, and dashboard counts that exclude partials unless asked.

### M22 · ★ Hidden fields and prefill from the page

- **Scope:** survey-level `hiddenFields: ["source", "userId"]` filled from a `hidden` mount option or from URL query
  parameters (opt-in), stored in the response `meta.hidden` and usable in conditions and piping. Lets the host system
  link a response to its own user or campaign without a visible question.
- **Packages:** schema, core, server (stored and filterable), dashboard (filter by hidden field).
- **Schema impact:** additive (v1).
- **Done when:** tests for both sources, and that undeclared query parameters are ignored.

### M23 · Themes

- **Scope:** move `styles.css` onto CSS custom properties (`--kv-color-primary`, `--kv-radius`, `--kv-font`, …), ship
  a few presets (light, dark, compact), and accept a `theme` object on `mountSurvey` that sets the variables. An
  editor theme panel edits the variables with a live preview and exports them as JSON or CSS.
- **Packages:** core (CSS, render option), editor.
- **Schema impact:** none, or an optional `theme` object on the survey if per-survey themes are wanted.
- **Done when:** the presets render in the demo apps, and the default look is unchanged.

### M24 · Quiz mode and scoring

- **Scope:** `correctAnswer` and per-choice `score` on questions, a `settings.quiz` block (show score, show correct
  answers, pass mark) and an optional time limit per survey or page. Scores are also available as variables (M13), so
  assessment-style surveys ("your result: advanced") work without quiz mode. The server recomputes the score.
- **Depends on:** M13.
- **Packages:** schema, core, server, dashboard (score distribution).
- **Schema impact:** additive (v1).
- **Done when:** scoring tests per question type, timer tests with fake timers, and a server test that ignores a
  client-sent score.

### M25 · Accessibility audit

- **Scope:** run axe-core against rendered fixtures in the core render tests and in the editor; fix findings; add
  ARIA patterns for matrix, grid, ranking and the editor tree; document keyboard use. A baseline axe check can be
  added to CI as early as M1 and kept green from then on.
- **Packages:** core, editor, dashboard.
- **Schema impact:** none.
- **Done when:** no axe violations on the fixtures and an `ACCESSIBILITY.md` with the keyboard map.

### M26 · Framework wrappers

- **Scope:** **★ a `<kvesto-survey>` web component first** (works in any framework and in plain HTML, and is the
  biggest embedding win), then thin `@kvesto/react` (a `useSurvey` hook and a `<Survey>` component) and
  `@kvesto/vue` (a composable and a component) around `SurveyModel.subscribe` and `renderSurvey`. Angular later, if
  asked for.
- **Packages:** new `packages/react`, `packages/vue`; core (web component entry).
- **Schema impact:** none.
- **Done when:** each wrapper has a test and a README example, and they are added to the release workflow.

## Phase 7 · Results and integrations

### M27 · Dashboard table view and filters

- **Scope:** a sortable, paginated table of responses (one column per question, flattened for matrix, grid and
  repeats), filters by answer, date range, completion status and hidden fields, and filtered summaries. Server
  `GET /surveys/{id}/responses` gains `limit`, `cursor` and filter parameters so large surveys stay fast.
- **Packages:** dashboard, core (`filterResponses`), server.
- **Schema impact:** none.
- **Done when:** API tests for pagination and filters, and a dashboard test for a filtered summary.

### M28 · Export

- **Scope:** `responsesToCsv(survey, responses)` in core (stable column naming, matrix and repeat flattening, labels or
  values), a server `GET /surveys/{id}/responses.csv`, and an Excel export in a separate optional package so the
  core stays small. Print stylesheets for a survey and a single response give a PDF via the browser first; a
  generated PDF can come later.
- **Packages:** core, server, dashboard (export buttons), new optional export package.
- **Schema impact:** none.
- **Done when:** CSV snapshot tests for every question type, including commas, quotes and newlines.

### M29 · ★ Webhooks

- **Scope:** per-survey webhooks on the server (`POST/GET/DELETE /surveys/{id}/webhooks`), fired on
  `response.completed` (and `response.updated` with M21), signed with HMAC-SHA256, retried with backoff, with a
  delivery log. A `onResponse` hook on `createApp` covers in-process integrations.
- **Depends on:** M2 (webhook management is an admin action).
- **Packages:** server (routes, table, migration).
- **Schema impact:** none for surveys; database migration on the server.
- **Done when:** API tests with a mocked receiver, signature verification documented with a snippet.

### M30 · ★ Hosted embeds

- **Scope:** the server serves a minimal survey page at `/s/{id}`; an embed script offers inline (iframe with
  automatic height through `postMessage`), popup and slide-in modes; the editor shows copy-ready snippets.
- **Depends on:** M2, ideally M26 (web component).
- **Packages:** server, core (embed script), editor.
- **Schema impact:** none.
- **Done when:** a Playwright test embeds a survey in a test page and completes it.

### M31 · ★ JSON Schema interop

- **Scope:** `answersJsonSchema(survey)` produces a JSON Schema describing a valid response for that survey, so other
  backends can validate submissions without running Kvesto; `surveyFromJsonSchema(schema)` creates a draft survey from
  an existing JSON Schema (types, enums, required, min/max), so teams with schema-driven forms can start from what
  they have.
- **Depends on:** M1 (format JSON Schema), M3 (validators map to schema keywords).
- **Packages:** core.
- **Schema impact:** none.
- **Done when:** round-trip tests on the fixtures, and documented limits (logic cannot be expressed in JSON Schema).

### M32 · ★ Survey availability settings

- **Scope:** `settings.opensAt`, `settings.closesAt`, `settings.maxResponses` and an optional one-response-per-browser
  flag. The runner shows a closed message; the server refuses submissions outside the window or over the limit.
- **Depends on:** M2.
- **Packages:** schema, core, server, editor (survey settings).
- **Schema impact:** additive (v1).
- **Done when:** API tests for each limit and a runner test for the closed state.

---

## Open decisions

These do not block the first milestones, but should be settled before the one that needs them:

- **M11:** keep JSON comparisons as the canonical form and add `{ "expr": "..." }` (recommended), or store
  everything as text expressions.
- **M5:** the name of the item scope in conditions (`scope: "item"` is the working name).
- **M20:** which locales to ship beyond English and Bulgarian.
- **M28:** whether Excel export is worth a dependency, or CSV is enough at first.

## Status

| Milestone | Status |
| --- | --- |
| M1 · Foundations | Done (unreleased) |
| M2 · Server access control | Done (unreleased) |
| M3 · Validators | Done (unreleased) |
| M4 · Panels | Done (unreleased) |
| M5 – M32 | Planned |

Update this table as milestones land, with the release they shipped in.
