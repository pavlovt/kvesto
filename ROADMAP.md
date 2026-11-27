# Kvesto roadmap

This is the plan for growing Kvesto from today's skeleton into a full survey toolkit, one small step at a time.
Each milestone is meant to be one focused change on `main`: it builds, type-checks and passes tests on its own, and
can ship in a patch or minor release without waiting for the next one.

> **Where we are now:** M20 (localization) is the latest finished milestone. Next up:
> M21 (partial responses and resume). The [Status](#status) table at the bottom lists every milestone.

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
  Value rules on every question: `defaultValue` (a fixed starting answer) and `defaultExpr` (computed when the
  question is first shown), `readOnly` and `enableIf` (shown but not editable), and `resetIf` (clear the answer
  when a condition becomes true, for example when an earlier choice changes). `enableIf` and `resetIf` take the
  existing JSON conditions, so that part can ship before M11.
- **Depends on:** M11, M3.
- **Packages:** schema, core, server, editor palette and property panel, dashboard (computed values summarised like
  numbers).
- **Schema impact:** additive (v1).
- **Done when:** tests for variable dependency order, cycles rejected by the schema, and server-side recomputation
  (the server recalculates computed answers rather than trusting the client); tests for defaults, `resetIf`
  clearing an answer, and the server refusing a changed answer to a read-only question.

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
  locale packs: English, Bulgarian, German, French, Spanish, Italian, Portuguese, Dutch, Polish and Russian, plus
  Chinese and Japanese if they need nothing beyond translation (contributions welcome). Validation messages use the same packs. An
  editor translation tab lists every string per locale with missing ones highlighted.
  - **Translation files:** every string exports to CSV, XLIFF and JSON and imports back, keyed by element id and
    property, with a report of strings that no longer exist, so translators can work outside the editor. The JSON
    file carries instructions, so it can be handed to an AI tool as it is.
  - **Machine-translated drafts:** an optional `translate(strings, from, to)` host hook fills a new locale with
    drafts marked "needs review" until a person confirms them, from a "Translate with AI" button in the editor.
    Kvesto bundles no translation service. A draft or an import that breaks an answer placeholder is refused.
  - **Formatting and choice of locale:** numbers, dates and piped values are formatted with `Intl` for the active
    locale; the locale can come from a `lang` URL parameter (opt-in) or the browser's language list.
- **Depends on:** M1. Easier the earlier it lands, since every later milestone adds strings.
- **Packages:** schema, core, editor, dashboard (labels in the selected locale).
- **Schema impact:** additive (v1). A plain string still means "the default locale".
- **Done when:** render tests in two locales, fallback to the default locale for missing strings, the editor
  tab can add a locale, an XLIFF export and import round trip leaves the survey unchanged, and drafts from a mocked
  `translate` hook stay flagged until reviewed.

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
  Feedback text per question for a correct and a wrong answer, partial credit on multiple choice (a score per
  correct choice and an optional penalty per wrong one), and `settings.quiz.releaseScores: "immediately" |
  "manual"`, so scores can be released after someone has reviewed the open answers.
- **Depends on:** M13.
- **Packages:** schema, core, server, dashboard (score distribution, manual release).
- **Schema impact:** additive (v1).
- **Done when:** scoring tests per question type including partial credit, timer tests with fake timers, a server
  test that ignores a client-sent score, and a manual-release round trip.

### M25 · Accessibility audit

- **Scope:** run axe-core against rendered fixtures in the core render tests and in the editor; fix findings; add
  ARIA patterns for matrix, grid, ranking and the editor tree; document keyboard use. A baseline axe check can be
  added to CI as early as M1 and kept green from then on. The target is WCAG 2.2 AA, named in the docs. Beyond
  what axe finds:
  - an optional `autocomplete` field on text questions (defaulted for email, tel and the M49 types), so browsers
    can fill personal data (WCAG 1.3.5);
  - an error summary at the top of the page after a failed submit, with links that move focus to each field;
  - targets of at least 24 by 24 CSS pixels (2.5.8), and a sticky navigation bar that never covers the focused
    field (2.4.11);
  - a high-contrast theme preset (with M23, or on its own if M25 lands first);
  - a manual pass with NVDA and VoiceOver over the fixtures before each minor release;
  - an accessibility conformance report in the VPAT format, updated per minor release, that says what was tested
    and what is known not to conform.
- **Packages:** schema (`autocomplete`), core, editor, dashboard.
- **Schema impact:** additive (v1).
- **Done when:** no axe violations on the fixtures, an `ACCESSIBILITY.md` with the keyboard map, render tests for
  the error summary and `autocomplete`, and the conformance report published with the release.

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
  Respondent identity from the host: an optional `identifyRespondent(c)` on `createApp` returns a stable id from the
  host's session or token, so `settings.oneResponsePer: "browser" | "respondent"` and `settings.requireRespondent`
  (signed-in respondents only) are enforced by the server, not only in the browser. With `settings.anonymous`
  (M37) only a salted hash of the id is kept, enough to enforce the limit.
- **Depends on:** M2.
- **Packages:** schema, core, server, editor (survey settings).
- **Schema impact:** additive (v1).
- **Done when:** API tests for each limit, a second response from the same respondent refused, an anonymous survey
  that stores only the hash, and a runner test for the closed state.

---

# Beyond M32

These phases come from a second review of what form, survey and experience-management tools offer that M1–M32 does
not. Security and privacy come first: Kvesto is meant to be embedded in other systems and to collect personal
data from the public internet, so the defaults have to be safe before the feature list grows further. Several of
the security milestones are small and can be pulled in earlier, between any two milestones above.

Effort is rough: **S** is about one milestone-sized change, **M** a few, **L** a phase of its own.

## Recommended order after M32

| # | Milestone | Why here |
| --- | --- | --- |
| M33–M35 | Security baseline, hardened HTTP defaults, abuse protection | Cheap, and they protect every deployment. M33 and M34 can start right away. |
| M36–M38 | Upload hardening, privacy controls, encryption | Needed before people collect sensitive data with Kvesto. |
| M39–M41 | Roles and SSO, audit log, security testing | Turns the server from "API keys" into something a team can run. |
| M42–M47 | Flow and logic | The most requested survey-design features; most are small. |
| M48–M73 | The rest | Any order; dependencies are listed per milestone. |
| M74–M79 | Gaps from the competitive review | See [Beyond M73](#beyond-m73). M74 and M77 are small and can be pulled in early. |

## Phase 8 · Security and privacy

What exists today: access control through `authorize` (M2) with constant-time key comparison, body size limits,
file size and `accept` checks, and file responses served with `nosniff`, a sandboxing CSP and `attachment` for
non-inline types. Regex validators are length-limited (M3). The milestones below build on that.

### M33 · ★ Security baseline and disclosure process

- **Scope:** a `SECURITY.md` with a private reporting channel and supported versions; a short `docs/threat-model.md`
  (untrusted survey JSON, untrusted answers and files, public submit routes, admin routes, the embedding page);
  Dependabot or Renovate for npm and GitHub Actions; CodeQL; `pnpm audit --prod` in CI that fails on high
  severity; GitHub Actions pinned to commit SHAs with least-privilege `permissions:`; secret scanning and push
  protection; an OpenSSF Scorecard badge. npm provenance is already on.
- **Packages:** repository and CI only.
- **Schema impact:** none.
- **Effort:** S.
- **Done when:** CI runs the new checks on every push, and the README links `SECURITY.md`.

### M34 · ★ Hardened HTTP defaults and document limits

- **Scope:**
  - Secure headers on every server response (`secureHeaders` from Hono: HSTS when behind HTTPS, `nosniff`,
    `Referrer-Policy`, a strict CSP for the hosted page from M30).
  - CORS split by route: respondent routes keep `*` so embedding works, admin routes need an explicit origin list.
    A startup warning when admin routes are reachable from any origin.
  - Limits that stop denial of service through huge or deeply nested documents: maximum pages, elements, nesting
    depth, choices, string length and condition depth, enforced by the schema and configurable on `createApp`.
    The same limits apply to answers (string length, array sizes, repeat items).
  - Error responses never include stack traces or database messages; a request id is returned instead and logged.
  - A shared `guardOutboundUrl` helper for every request the server makes (webhooks in M29, remote choices in M45):
    HTTPS only by default, private, loopback and link-local addresses blocked after DNS resolution, redirects
    re-checked. This closes server-side request forgery before those features ship.
- **Packages:** schema (limits), server.
- **Schema impact:** additive in spirit, but very large documents that were accepted before will be refused. Ship
  the limits generous and note them in the release notes.
- **Effort:** M.
- **Done when:** API tests for headers, CORS per route, each limit, and the URL guard against private ranges,
  DNS rebinding and redirects.

### M35 · ★ Rate limiting and spam protection

- **Scope:**
  - A `rateLimit` option on `createApp` with a small store interface (in-memory default, a Redis example in the
    docs), keyed by IP and survey, with separate budgets for `response:create`, `file:upload` and admin routes.
    Returns 429 with `Retry-After`. Trusted proxy configuration so `X-Forwarded-For` cannot be spoofed.
  - Bot friction in the runner and enforced by the server: a honeypot field, a minimum time to complete, and a
    `verifyChallenge(c, token)` hook with helpers for common CAPTCHA services (all optional).
  - Optional duplicate detection (same answers and fingerprint within a window).
- **Depends on:** M2. Works best with M32 (one response per browser).
- **Packages:** server, core (honeypot and timing fields), schema (optional `settings.antiSpam`).
- **Schema impact:** additive (v1).
- **Effort:** M.
- **Done when:** API tests for 429s and `Retry-After`, honeypot and too-fast submissions refused, and a mocked
  challenge verifier.

### M36 · ★ Upload hardening

- **Scope:** check a file's real type from its first bytes and refuse a mismatch with `accept` or the declared
  type; never serve SVG, HTML or XML inline; normalise file names (no path parts, control characters or bidi
  overrides); per-survey and per-response storage quotas; delete uploads that no completed response refers to after
  a configurable time; a `scanFile(file, bytes)` hook for antivirus (a ClamAV example in the docs); optional signed,
  short-lived file URLs instead of permanent unguessable ids.
- **Depends on:** M21 (partial responses) for the orphan rule; M35 for upload rate limits.
- **Packages:** server, core (`httpStorage` follows signed URLs).
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** tests for a disguised file, a polyglot, a hostile file name, a quota hit, orphan clean-up and an
  expired signed URL.

### M37 · ★ Privacy controls (GDPR)

- **Scope:**
  - `settings.anonymous`: the server stores no IP address, user agent or hidden fields that identify the person.
  - A `pii: true` flag on questions. PII answers are masked in the dashboard, exports and webhooks unless the
    caller has a new `response:read-pii` action.
  - `settings.retentionDays` with a purge job, plus `DELETE /surveys/{id}/responses/{rid}`.
  - Respondent rights: with the resume token (M21) or an emailed link, a respondent can download or delete their
    own response.
  - A consent question preset that blocks submission until accepted and records the consent text and time.
- **Depends on:** M2, M21; M28 and M29 respect the masking.
- **Packages:** schema, server, dashboard, core (consent preset).
- **Schema impact:** additive (v1). A new `KvestoAction` value; `apiKeyAuth` treats it as admin-only, and custom
  `authorize` functions must handle it (noted in the release notes).
- **Effort:** M.
- **Done when:** tests that anonymous mode stores nothing identifying, that masking holds in every output, and
  that the purge job deletes responses and their files.

### M38 · ★ Encryption of answers

- **Scope:** field-level encryption at rest for PII answers and uploaded files, with keys passed to `createApp`
  (an environment variable in `serve.ts`), key ids stored with each value so keys can be rotated, and a re-encrypt
  command. Stretch goal: end-to-end mode, where the runner encrypts answers with the survey's public key and only
  the dashboard, holding the private key, can read them; the server then stores ciphertext only and cannot
  validate those fields, which the docs must state plainly.
- **Depends on:** M37 (`pii` flag).
- **Packages:** server; core and dashboard for the end-to-end mode.
- **Schema impact:** additive (v1), an optional `encryption` block for the public key.
- **Effort:** M, L with end-to-end mode.
- **Done when:** a test reads the database file directly and finds no plaintext PII, and a rotation test.

### M39 · ★ Users, roles, scoped tokens and SSO

- **Scope:** optional built-in identity for teams that do not bring their own: users, workspaces and roles
  (owner, editor, analyst, viewer) mapped onto `KvestoAction`s, per survey or per workspace. Finer actions
  (`survey:publish`, `response:delete`, `webhook:manage`). API tokens with scopes, expiry and a name, stored hashed
  and shown once. An OpenID Connect login helper; SAML through an adapter. Session cookies are `HttpOnly`,
  `Secure`, `SameSite`, with CSRF protection on cookie-authenticated writes. Bringing your own `authorize` stays
  the main path; this is a ready-made one.
- **Depends on:** M2.
- **Packages:** server (tables, migrations, routes), dashboard and editor (login, token management).
- **Schema impact:** none for surveys; database migration on the server.
- **Effort:** L.
- **Done when:** API tests for each role against each action, token expiry and revocation, CSRF refusal, and an
  OIDC flow against a mocked provider.

### M40 · ★ Audit log

- **Scope:** an append-only log of admin actions (actor, action, survey, time, IP, request id), written for every
  admin route; `GET /audit` with filters and export; an `onAudit` hook to forward events to a SIEM. Optional hash
  chaining so tampering is detectable.
- **Depends on:** M2 (actor from the key name), better with M39.
- **Packages:** server, dashboard (audit view).
- **Schema impact:** none; database migration.
- **Effort:** S–M.
- **Done when:** every admin route writes one entry (a test walks the route list), and a broken chain is detected.

### M41 · ★ Security test suite

- **Scope:** property-based fuzzing (fast-check) of the survey schema, the condition evaluator and the expression
  parser (M11) for crashes and runaway time; a ReDoS check on regex validators; an XSS corpus run against the
  renderer, piping (M12) and content blocks (M16); an OWASP ZAP baseline scan against the demo server in CI; a
  release checklist in `SECURITY.md`.
- **Depends on:** M11, M12, M16 for their parts; the rest can start at once.
- **Packages:** tests and CI.
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** the fuzzers run in CI with a fixed time budget, and the XSS corpus passes on every render path.

## Phase 9 · Flow and logic

### M42 · Randomization

- **Scope:** `choicesOrder: "random" | "asc" | "desc"` with `pinned` choices (such as "Other" or "None"),
  `randomize: true` on pages and panels for question order, `settings.randomizePages`, and random A/B groups
  (`randomGroup` on pages or panels: each respondent sees one). The order is seeded per response and stored in
  `meta`, so analysis can reproduce what each person saw.
- **Packages:** schema, core, server (stores and validates the seed), dashboard (results per A/B group).
- **Schema impact:** additive (v1).
- **Effort:** S–M.
- **Done when:** seeded order tests, and pinned choices stay in place.

### M43 · Choice carry-forward

- **Scope:** `choicesFrom: { question, filter: "selected" | "unselected" | "all" }` builds a question's choices
  from an earlier choice, ranking or matrix question.
- **Packages:** schema (reference check), core, editor.
- **Schema impact:** additive (v1).
- **Effort:** S.
- **Done when:** tests for each filter and for a hidden source question.

### M44 · Loop and merge

- **Scope:** a repeating panel driven by an earlier question's selected choices (`repeat: { from: "brands" }`): one
  item per selected choice, with the choice available for piping inside the item.
- **Depends on:** M5, M12, M43.
- **Packages:** schema, core, dashboard.
- **Schema impact:** additive (v1).
- **Effort:** M.
- **Done when:** answers keep their item key when choices are added or removed.

### M45 · Remote and cascading choices

- **Scope:** `choicesFrom: { source: "countries", dependsOn?: ["region"] }`, where the host registers named sources
  with `createSurvey({ choiceSources })`, so the core stays fetch-free. An optional server proxy fetches allowlisted
  URLs through `guardOutboundUrl` (M34) and caches them. Cascading dropdowns reset when a parent changes.
- **Depends on:** M34.
- **Packages:** schema, core, server, editor.
- **Schema impact:** additive (v1).
- **Effort:** M.
- **Done when:** tests for cascades, stale answers cleared, and the proxy refusing non-allowlisted URLs.

### M46 · Quotas

- **Scope:** `quotas: [{ name, when, limit, action: "end" | "skipToPage" }]`, counted and enforced by the server
  atomically, with an end screen per quota and quota progress in the dashboard.
- **Depends on:** M11, M32.
- **Packages:** schema, core, server, dashboard.
- **Schema impact:** additive (v1).
- **Effort:** M.
- **Done when:** a concurrency test cannot overfill a quota.

### M47 · Start screen, end screens and redirects

- **Scope:** an optional start screen before the first page (title, description, image, a start button and an
  estimated time to complete worked out from the visible questions), several completion screens chosen by
  condition, and an optional redirect URL with piped answers and hidden fields (M22). Redirect hosts must be on a
  per-survey allowlist, so a survey cannot become an open redirect.
- **Depends on:** M12.
- **Packages:** schema, core, editor.
- **Schema impact:** additive (v1).
- **Effort:** S.
- **Done when:** tests for the start screen, screen selection, URL encoding of piped values, and a refused host.

## Phase 10 · Question types and respondent experience

### M48 · Score presets

- **Scope:** palette presets for NPS (0–10), CSAT, CES and Likert scales built on `rating`, with
  `settings.metric` so the dashboard computes the standard score (promoters minus detractors, top-two box).
- **Packages:** core, editor, dashboard.
- **Schema impact:** additive (v1).
- **Effort:** S.
- **Done when:** summary tests for each metric.

### M49 · Date, time, phone, address and masked inputs

- **Scope:** `date` and `time` with min/max (validated by M3's `range`), `phone` with country codes, and `address`
  (a multi-text with structured parts and an optional `addressLookup` host hook for autocomplete). Input masks on
  text questions: `mask` of type `pattern` (`"99-999"`), `number` (decimals, thousands separator), `currency` or
  `date`. A mask only shapes typing: the stored answer is the unmasked value (a number for number and currency
  masks), so validators and exports never see separators. Masks follow the locale (M20) when one is set.
- **Depends on:** M15, M17.
- **Packages:** schema, core, editor, dashboard.
- **Schema impact:** additive (v1).
- **Effort:** M.
- **Done when:** validate, render and summary tests, including time zones for `date`, and mask tests for typing,
  pasting, deleting and the stored unmasked value.

### M50 · Review, display mode and after-submit options

- **Scope:** an optional review page before submit; `mode: "display"` that renders a stored response read-only
  (for host back offices and printing); `settings.allowEdit` so a respondent can edit with their token; an
  optional emailed copy of the response through a `sendMail` hook on the server. The same hook sends notification
  emails: a per-survey list of owner addresses told about each completed response (a link to it, with answers only
  as M37's masking allows), and an autoresponder to an email answer with a custom message.
- **Depends on:** M21.
- **Packages:** core, server, schema.
- **Schema impact:** additive (v1).
- **Effort:** M.
- **Done when:** render tests for display mode on every question type, an edit round trip, and a test that PII
  never reaches an owner notification unmasked.

### M51 · Right-to-left layout

- **Scope:** `dir` follows the locale (Arabic, Hebrew, Persian), CSS moves to logical properties, and ranking,
  sliders and matrices mirror correctly.
- **Depends on:** M20, M23.
- **Packages:** core, editor, dashboard.
- **Schema impact:** none.
- **Effort:** S.
- **Done when:** visual snapshot tests in an RTL locale.

### M52 · Offline-first collection

- **Scope:** responses are queued in IndexedDB while offline and sent when the connection returns, with an
  idempotency key so a retry never creates a duplicate; a service worker for the hosted page (M30) so a survey can
  be taken without a connection after the first load. A kiosk mode (`mode: "kiosk"`) for shared devices at events
  and front desks: the survey restarts after completion, clears the answers after a set time without input (with a
  warning first), and never offers to resume someone else's draft.
- **Depends on:** M21, M30.
- **Packages:** core (an `offlineQueue` storage wrapper, kiosk mode), server (idempotency keys).
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** a Playwright test completes a survey offline and syncs it once, and a kiosk test shows that the next
  respondent never sees the previous one's answers.

### M53 · Payments and scheduling

- **Scope:** optional packages for a payment question (a checkout session created by the server, the payment
  status confirmed through the provider's webhook, never trusted from the client) and a scheduling question that
  embeds a booking widget and stores the booking id.
- **Depends on:** M15, M29.
- **Packages:** new optional packages, server.
- **Schema impact:** additive (v1) through custom types.
- **Effort:** M.
- **Done when:** tests with mocked providers, including a forged client-side "paid" status refused.

### M54 · Audio and video answers

- **Scope:** record with `MediaRecorder`, with a duration limit and re-record, uploaded through `uploadFile`, so all
  of M36's upload checks apply.
- **Depends on:** M15, M36.
- **Packages:** core, dashboard (player).
- **Schema impact:** additive (v1).
- **Effort:** M.
- **Done when:** render tests with a mocked recorder and a size-limit test.

### M55 · Research question types

- **Scope:** constant sum (points across options, must total N), image hotspot (click regions on an image),
  card sort (drag cards into groups) and MaxDiff (best and worst from rotating sets, with a dashboard score).
- **Depends on:** M15, M9 (drag interactions).
- **Packages:** schema, core, dashboard.
- **Schema impact:** additive (v1).
- **Effort:** L.
- **Done when:** each type has validate, render, keyboard and summary tests.

## Phase 11 · Distribution

### M56 · Invitations and reminders

- **Scope:** contact lists, personal single-use links (tokens stored hashed), a `sendMessage` adapter with email
  (SMTP example) and SMS (one provider example) channels,
  scheduled reminders to people who have not finished, unsubscribe handling, and response rates per list.
- **Depends on:** M21, M39.
- **Packages:** server, dashboard.
- **Schema impact:** none; database migration.
- **Effort:** L.
- **Done when:** API tests for token reuse refused, reminders skipping finished contacts, and unsubscribe.

### M57 · In-app targeting

- **Scope:** an `@kvesto/intercept` package that shows a survey when the host app fires an event, a URL matches or a
  user is in a segment, with sampling, frequency caps and "don't show again", plus a global waiting period across
  all surveys for the same user (for example at most one survey every 14 days) that a survey can override. Rules can
  live in the survey or on the server.
- **Depends on:** M26, M22.
- **Packages:** new package, schema (`targeting`), server (rule evaluation).
- **Schema impact:** additive (v1).
- **Effort:** L.
- **Done when:** tests for each trigger, caps across page loads, and sampling with a fixed seed.

### M58 · Share helpers

- **Scope:** QR codes for survey links in the editor, social preview meta tags on `/s/{id}`, and short links.
- **Depends on:** M30.
- **Packages:** editor, server.
- **Schema impact:** none.
- **Effort:** S.
- **Done when:** the QR code decodes to the survey link in a test.

## Phase 12 · Analytics

### M59 · Cross-tabs, timing and funnels

- **Scope:** cross-tabulate any two questions, compare segments side by side, time spent per question and page,
  and a funnel of where people stop (building on M21's drop-off data). Significance tests on cross-tabs
  (chi-square for the table, column-proportion tests marking cells that differ), the base size on every chart, and
  trends over time for score metrics (M48) by day, week or month.
- **Depends on:** M21, M27; M48 for score trends.
- **Packages:** core (`crossTab`), dashboard, core runner (timing in `meta`).
- **Schema impact:** additive on the response `meta`.
- **Effort:** M.
- **Done when:** cross-tab tests for every choice-like type, and test statistics checked against published worked
  examples.

### M60 · Open text analysis

- **Scope:** word and phrase frequency with stop words per locale, and an optional `analyzeText` host hook for
  sentiment or topic tagging (Kvesto bundles no AI provider; the hook receives answers already masked by M37).
- **Depends on:** M20, M37.
- **Packages:** core, dashboard.
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** frequency tests in two locales and a mocked hook.

### M61 · Saved and shared reports

- **Scope:** save a dashboard view (filters, charts, cross-tabs) and share it read-only through a scoped, expiring
  token that can never see PII or raw responses unless granted. An anonymity threshold: any breakdown, filter or
  cross-tab with fewer than N responses (default 5, set per survey) is hidden in shared reports, so a small segment
  cannot single out a person.
- **Depends on:** M27, M37, M39.
- **Packages:** server, dashboard.
- **Schema impact:** none; database migration.
- **Effort:** M.
- **Done when:** API tests that a report token cannot reach anything outside its report, and that a segment below the
  threshold is never returned.

### M62 · Statistical exports

- **Scope:** exports for SPSS (`.sav` with value labels), R and Stata, and optional response weights.
- **Depends on:** M28.
- **Packages:** the optional export package.
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** exported files round-trip through an open source reader in tests.

## Phase 13 · Authoring

### M63 · Survey versions

- **Scope:** draft and published states, each publish an immutable version, responses tied to the version they
  answered, a diff between versions in the editor, and rollback.
- **Depends on:** M2 (`survey:publish` from M39 if present).
- **Packages:** server, editor, dashboard (results per version or merged).
- **Schema impact:** additive on the response (`surveyVersion`); database migration.
- **Effort:** M.
- **Done when:** editing a published survey never changes what earlier responses refer to.

### M64 · Templates and question library

- **Scope:** a set of starter surveys (feedback, NPS, event registration, job application), and a per-workspace
  library of saved questions and panels to reuse.
- **Depends on:** M8.
- **Packages:** editor, server (library storage).
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** every template passes schema validation and the axe checks from M25.

### M65 · AI-assisted authoring

- **Scope:** "describe your survey" and "suggest questions" in the editor through a host-provided `generate`
  function. The output is always parsed and validated by the schema before it enters the document, as one undoable
  command.
- **Depends on:** M7, M8.
- **Packages:** editor.
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** a test with a mocked generator, including invalid output rejected.

### M66 · Importers

- **Scope:** import from XLSForm, plain spreadsheet question lists, and the export formats of common form builders,
  into a draft survey with a report of anything that could not be mapped.
- **Packages:** a new optional import package, editor (import dialog).
- **Schema impact:** none.
- **Effort:** M per format.
- **Done when:** fixture-based tests per format.

### M67 · Collaborative editing

- **Scope:** comments on elements, and live co-editing on the editor's command model (M7) with a sync adapter.
- **Depends on:** M7, M39.
- **Packages:** editor, server.
- **Schema impact:** none.
- **Effort:** L.
- **Done when:** two editors converge in a test after concurrent edits.

## Phase 14 · Platform and developer experience

### M68 · Database and file storage adapters

- **Scope:** Postgres and MySQL alongside SQLite through Drizzle, and S3-compatible file storage, with the same
  repository test suite run against each.
- **Packages:** server.
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** CI runs the repository tests against each database in containers.

### M69 · Integrations

- **Scope:** small optional packages on top of webhooks (M29): Google Sheets, Slack, and generic automation tools,
  each respecting M37's PII masking.
- **Depends on:** M29, M37.
- **Packages:** new optional packages.
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** each has tests with a mocked API.

### M70 · UI kits and a Svelte wrapper

- **Scope:** renderer themes that output Tailwind and shadcn/ui markup, and `@kvesto/svelte` next to the React and
  Vue wrappers from M26.
- **Depends on:** M23, M26.
- **Packages:** new packages.
- **Schema impact:** none.
- **Effort:** M.
- **Done when:** each renders the fixtures with no axe violations.

### M71 · Typed answers

- **Scope:** `defineSurvey(... as const)` and `InferAnswers<typeof survey>`, so a host app gets a TypeScript type
  for the answers of a specific survey, including choices as literal unions and repeats as arrays.
- **Packages:** schema, core.
- **Schema impact:** none.
- **Effort:** S–M.
- **Done when:** type tests (`expectTypeOf`) for every question type.

### M72 · CLI and survey lint

- **Scope:** `kvesto validate|lint|serve|export`. Lint rules for things the schema allows but people regret:
  images without alt text, unreachable pages, conditions that can never be true, required questions behind hidden
  panels, very long surveys. The rules live in core, so the editor runs the same rules live as an issues panel
  (each issue links to its element), with a few survey-design hints on top: unbalanced rating scales, multiple-choice
  questions with no "none" or "other" option, and matrices too wide for a phone.
- **Depends on:** M11 for the logic rules.
- **Packages:** core (rules), a new `kvesto` CLI entry, editor (issues panel).
- **Schema impact:** none.
- **Effort:** S–M.
- **Done when:** each rule has a fixture that triggers it and one that does not, and the editor and the CLI report the
  same issues for the same survey.

### M73 · ★ MCP server

- **Scope:** a Model Context Protocol server so AI agents can create and edit surveys, read summaries and list
  responses, using M39's scoped tokens and M37's masking, with every write going through the same schema
  validation and audit log (M40).
- **Depends on:** M37, M39, M40.
- **Packages:** a new package.
- **Schema impact:** none.
- **Effort:** S–M.
- **Done when:** tests that a read-only token cannot write and PII stays masked.

---

# Beyond M73

These come from a review of open-source survey libraries, form builders and hosted survey products
([docs/competitive-review.md](docs/competitive-review.md)), checked against M1–M73. Most of what that review found
was already planned; the review's smaller findings were added to existing milestones (M13, M20, M24, M25, M32, M47,
M49, M50, M52, M56, M57, M59, M61, M72). The milestones below cover what did not fit anywhere: the choice model,
the parts of the containers that are still missing, field data capture, and what happens to a response after it
arrives.

## Recommended order after M73

| # | Milestone | Why here |
| --- | --- | --- |
| M74–M75 | Choice options, finishing the containers | They change the answer model, so they should land before the editor, dashboard and exports build more on the current shapes. M74 can start right away. |
| M77 | Test responses | Small, and every later dashboard and analytics milestone is easier to test with generated data. |
| M76 | Location, scanning and photo capture | Most useful together with offline collection (M52). |
| M78–M79 | Response management, quality flags | After the table view and filters (M27); M79 also needs the timings from M59. |

## Phase 15 · Answers and capture

### M74 · ★ Choice options and per-choice logic

- **Scope:**
  - `other: { label?, required? }` on single choice, multiple choice and dropdown adds an "Other" choice with a
    text box. The choice value stays in the answer as today; the text is stored under the reserved key
    `<questionId>.other` (question ids cannot contain dots, so it cannot clash). This is the recommended option in
    "Open decisions".
  - `exclusive: true` on a choice ("None of the above", "Prefer not to say"): picking it clears the other choices
    and the other way round, and validation refuses an answer that combines it with anything else.
  - `selectAll: true` on multiple choice adds a "Select all" control. It is not stored as a value.
  - `visibleIf` and `enableIf` on single choices and on matrix rows and columns, with the existing JSON conditions.
    A choice that becomes hidden is removed from the answer, and the server refuses an answer that picks a hidden
    choice.
  - Survey-level `choiceLists: { "countries": [...] }`, referenced as `choices: { "list": "countries" }`, so a long
    list is defined and translated once.
  - A `columns` layout hint for long choice lists.
- **Depends on:** M4 (done). Works with M42 (a pinned choice can also be exclusive), M43 and M20.
- **Packages:** schema, core (logic, validate, render, summary), server (validation through `validateAnswers`),
  editor (property panel), dashboard ("Other" texts listed under the chart).
- **Schema impact:** additive (v1). A new reserved answer key, noted in the release notes.
- **Effort:** M.
- **Done when:** runner and server tests for exclusive and hidden choices, a render test for "Other" with a required
  text, a shared list used by two questions, and summaries that list "Other" texts.

### M75 · Finishing the containers

- **Scope:** the parts of repeating panels and grids that are still missing:
  - repeating panels inside repeating panels, where `scope: "item"` means the innermost item and a new
    `scope: "parent"` means the enclosing one;
  - file questions inside repeats, with uploads keyed by item and M36's orphan rules applied to removed items;
  - respondent-added grid rows (`addRows`, `minRows`, `maxRows`, rows keyed by generated ids);
  - `layout: "table"` on a repeating panel, which shows each item as a row with one column per question;
  - `repeat.count`, which sets the number of items from an earlier answer (a number question, or an expression
    with M11).
- **Depends on:** M5, M6 (done); M11 for count expressions.
- **Packages:** schema, core, server, editor, dashboard (nested flattening in summaries, the table view and exports).
- **Schema impact:** additive (v1). The answer union nests one level deeper, which is a type change for
  TypeScript users; note it in the release notes.
- **Effort:** M.
- **Done when:** validation, logic and summary tests for two levels of repeats, a server round trip with a file
  inside a repeat, and a keyboard test for adding and removing grid rows.

### M76 · Location, scanning and photo capture

- **Scope:**
  - A `location` question with `mode: "point" | "path" | "area"`. A point comes from the Geolocation API, with
    its accuracy and an optional minimum accuracy, or from a pin dropped on a map; paths and areas are drawn on a
    map. The map comes from a host-provided `mapAdapter`, so the core bundles no map library and calls no tile
    server. The answer is a GeoJSON geometry plus the accuracy.
  - A `barcode` question that scans with the BarcodeDetector API where the browser has it, and otherwise falls back
    to a host `scanBarcode` hook or typed entry. The answer is the text and the barcode format.
  - Photo capture on file questions: `capture: "environment" | "user"` opens the camera on phones, and an optional
    `maxImageWidth` downsizes the photo in the browser before upload.
  - Dashboard: a map of location answers through the same adapter, and GeoJSON export.
  - Privacy: location answers count as PII by default (M37), and the runner only asks for the position when the
    question is shown.
- **Depends on:** M15, M36 (photo uploads), M37; best with M52 (offline).
- **Packages:** schema, core, dashboard, the optional export package (GeoJSON).
- **Schema impact:** additive (v1).
- **Effort:** M.
- **Done when:** tests with a mocked Geolocation API (refused, too inaccurate, success), a mocked BarcodeDetector
  plus the typed fallback, the server rejecting invalid GeoJSON, and a downsizing test.

## Phase 16 · Response operations

### M77 · ★ Test responses

- **Scope:** `generateResponses(survey, { count, seed })` in core creates random responses that follow the survey's
  logic and validators, using the same answer generators as the fuzzers in M41. Responses can carry
  `meta.test: true`; editor previews and generated responses always do. Summaries, the table view, exports, quotas
  and availability limits leave test responses out by default (with a toggle to show them), and webhooks only send
  them when a webhook opts in. `DELETE /surveys/{id}/responses?test=true` removes them all. The editor gets a
  "Fill with test data" action that submits generated responses to the server as an admin action.
- **Depends on:** M27 (filters); M11 so generated answers also satisfy expression conditions.
- **Packages:** core, server, editor, dashboard.
- **Schema impact:** additive on the response `meta`.
- **Effort:** S–M.
- **Done when:** a property test that every generated response passes `validateAnswers` for every fixture, tests
  that test responses stay out of summaries, quotas and limits, and a bulk delete that leaves real responses alone.

### M78 · ★ Response management and approvals

- **Scope:**
  - Per response: a review status (`new`, `in-review`, `approved`, `rejected`, plus custom statuses per survey), an
    assignee, tags and internal notes. They are stored next to the response, not in `answers`, so the response
    itself does not change. All of them can be filtered on in the table view (M27).
  - Admin edits: correcting an answer creates a revision (who, when, before and after), validated with
    `validateAnswers`. The original stays retrievable, and exports can use the original or the current answers.
    Edits are off unless a survey turns them on.
  - Approval steps: `settings.workflow: [{ "name", "approvers", "when"? }]`. Each step approves or rejects with a
    comment, sends notifications through `sendMail` (M50) and a `response.reviewed` webhook, and can send a message
    back to the respondent.
  - New actions `response:review` and `response:edit`.
- **Depends on:** M2, M27, M40 (every change is audited); M39 for users as assignees and approvers; M50 for mail.
- **Packages:** schema (workflow settings, actions), server (tables, routes, migration), dashboard (review panel).
- **Schema impact:** additive (v1). New `KvestoAction` values: `apiKeyAuth` treats them as admin-only, and custom
  `authorize` functions must handle them (noted in the release notes). Database migration on the server.
- **Effort:** M–L.
- **Done when:** API tests for each status change and for refusal without the action, a revision round trip that
  keeps the original, a two-step approval workflow, and an audit entry for every change.

### M79 · ★ Response quality flags

- **Scope:** the server computes flags for each completed response and stores them in `meta.quality`:
  - `speeder`: completed in less than a set fraction of the survey's median time (timings from M59);
  - `straightline`: the same column picked in a matrix or grid across at least N rows;
  - `duplicate`: the same answers as another response within a time window (using M35's fingerprint);
  - `lowEffort`: very short, repeated-character or identical open-text answers across questions;
  - `attentionFailed`: a question marked `attentionCheck: { "expected": ... }` answered otherwise;
  - the honeypot and challenge results from M35.

  Flags never block a submission. The dashboard shows them and can filter on them (M27), and exports can leave
  flagged responses out. Thresholds are set per survey in `settings.quality`, and a recompute command updates the
  flags, because the median moves as responses arrive. The flag functions are pure and live in core.
- **Depends on:** M27, M35, M59 (timings).
- **Packages:** schema, core (flag functions), server, dashboard.
- **Schema impact:** additive (v1).
- **Effort:** M.
- **Done when:** for each flag, a response that triggers it and one that does not, and a recompute that changes the
  speeder flags when the median moves.

---

## Open decisions

These do not block the first milestones, but should be settled before the one that needs them:

- **M11:** keep JSON comparisons as the canonical form and add `{ "expr": "..." }` (recommended), or store
  everything as text expressions.
- **M34:** the default document and answer limits.
- **M38:** whether end-to-end encryption is worth giving up server-side validation for those fields.
- **M39:** ship built-in users and roles, or only document how to plug in an existing identity provider.
- **M74:** store the "Other" text under a reserved `<questionId>.other` key (recommended, since existing answer
  shapes stay the same), or turn the answer into an object `{ value, other }`.
- **M78:** whether admin edits to answers are allowed at all, or only per survey (recommended: off unless a survey
  turns them on, because edited research data has to be disclosed).
- **M79:** the default thresholds for speeders and straight-lining.

Decided:

- **M5:** the item scope in conditions is `scope: "item"`.
- **M20:** ship English, Bulgarian, the major European languages (German, French, Spanish, Italian, Portuguese,
  Dutch, Polish), Russian, and Chinese and Japanese if they don't need extra work beyond translation.
- **M28:** include Excel export (in its own optional package), alongside CSV.

## Status

| Milestone | Status |
| --- | --- |
| M1 · Foundations | Done (0.2.0) |
| M2 · Server access control | Done (0.2.0) |
| M3 · Validators | Done (0.2.0) |
| M4 · Panels | Done (0.2.0) |
| M5 · Repeating panels | Done (0.2.0). Not yet: nested repeats, file questions inside repeats |
| M6 · Grid questions | Done (0.2.0). Not yet: respondent-added rows |
| M7 · Editor document model, undo and redo | Done (0.2.0) |
| M8 · Structure view and property panel | Done (0.2.0) |
| M9 · Drag and drop | Done (0.2.0). Not yet: auto-scroll while dragging, dragging in the preview |
| M10 · Visual logic builder | Done (0.2.0) |
| M11 · Expression engine | Done (unreleased) |
| M12 · Answer piping | Done (unreleased) |
| M13 · Calculated values and expression fields | Done (unreleased) |
| M14 · Triggers | Done (unreleased) |
| M15 · Question type registry (custom question types) | Done (unreleased). Not yet: the built-in types still have their own code paths instead of being registered the same way |
| M16 · Content blocks | Done (unreleased) |
| M17 · Input question types | Done (unreleased). Built in to the schema rather than through the registry, so they get JSON Schema and server checks like the other built-ins |
| M18 · Signature | Done (unreleased). Not yet: a keyboard alternative to drawing (planned with the accessibility audit, M25) |
| M19 · One question at a time | Done (unreleased) |
| M20 · Localization | Done (unreleased). Not yet: Intl number and date formatting of piped values; rarely shown messages for malformed answers stay English |
| M21 – M79 | Planned |

Update this table as milestones land, with the release they shipped in.
