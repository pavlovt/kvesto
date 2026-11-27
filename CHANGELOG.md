# Changelog

All packages (`kvesto`, `@kvesto/schema`, `core`, `server`, `editor`, `dashboard`, `react`, `vue`, `export`) share one version.

## Unreleased

- Expressions (M11): `{ "expr": "{age} >= 18 and {role} = 'dev'" }` conditions, a safe parser and evaluator with
  built-in functions, and custom functions through `createSurvey({ functions })` and `createApp({ functions })`.
  The editor's logic builder can write expressions.
- Answer piping (M12): `{questionId}` placeholders in titles, descriptions, choice labels and the new
  `completedText`, rendered as text; `{{` escapes a brace. The editor can insert an earlier answer into a title.
- Calculated values (M13): survey `variables`, a read-only `computed` question the server recalculates,
  `expression` validators, and value rules on every question: `defaultValue`, `defaultExpr`, `readOnly`,
  `enableIf` and `resetIf`. Numeric text now compares as numbers in expressions.
- Triggers (M14): survey `triggers` that set or copy a value, skip to a page or submit when a condition becomes
  true, with an editor for them in the survey settings.
- Custom question types (M15): `registerQuestionType` with a schema, validation, a renderer, a dashboard summary
  and editor defaults; `x-*` types in surveys, `createApp({ questionTypes })` on the server.
- Content blocks and images (M16): `content` elements with a safe Markdown subset and answer placeholders (raw
  `html` only through a host `sanitizeHtml`), and `image` elements, both with `visibleIf` and in the editor palette.
- Input question types (M17): `multi-text`, `slider`, `tags` (searchable, optional own entries) and `image-choice`,
  plus `searchable` dropdowns, with validation, rendering, summaries and editor support.
- Signature (M18): a `signature` question drawn on a canvas and uploaded as a PNG through the file path, with
  dashboard thumbnails for image uploads.
- One question at a time (M19): `settings.layout: "question"` (or the `layout` render option) with a progress bar,
  Enter to continue, number keys and auto-advance; `nextStep` / `prevStep` on the model; a preview toggle in the
  editor. `mountSurvey` now passes every render option on (it used to drop all but `labels`).
- Localization (M20): per-locale display text with `defaultLocale` and `locales`, a `locale` option on the runner and
  dashboard, built-in labels and validation messages in 12 languages, server messages from `Accept-Language`, and an
  editor Translations tab with CSV, XLIFF and JSON import and export and AI drafts through a `translate` hook.
- Partial responses and resume (M21): `saveProgress` / `loadProgress` on storage adapters, `createSurvey({ resume })`,
  partial responses on the server with a hashed resume token (`PATCH` and `POST …/resume`), lists that leave partials
  out unless asked, and completion and drop-off in the dashboard. Database migration `0002_partial_responses`.
- Hidden fields (M22): `hiddenFields` filled from the `hidden` option or (opt-in) URL parameters, usable in conditions,
  expressions and piping, stored in `meta.hidden`, validated with on the server, and filterable by API and dashboard.
- Themes (M23): the runner's stylesheet on CSS variables with light, dark, auto, compact and contrast presets, a
  `theme` option and `settings.theme`, an editor Theme tab with CSS and JSON export, and light, dark and auto looks
  for the editor and the dashboard themselves.
- Quiz mode and scoring (M24): `correctAnswer`, `points`, partial credit and penalties, choice scores, `score()` in
  expressions, `settings.quiz` (pass mark, correct answers and feedback, manual release, time limits per survey or
  page), a server that recalculates scores, a release route, and score statistics in the dashboard.
- Accessibility audit (M25): axe-core checks on every question type and every editor tab, an error summary with links,
  errors tied to their inputs, `autocomplete` on text questions, a typed signature, announced ranking moves, 24-pixel
  targets, `lang` on the survey, and ACCESSIBILITY.md with the keyboard map and a conformance report.
- Framework wrappers (M26): a `<kvesto-survey>` custom element (`defineSurveyElement`), and new `@kvesto/react` and
  `@kvesto/vue` packages with a `<Survey>` component and a `useSurvey` hook or composable, in the release workflow.
- Dashboard table view and filters (M27): a sortable, paged table of responses with flattened columns, filters by
  date, answer, hidden field and status that also apply to the summaries, `filterResponses` / `responseColumns` /
  `responseRow` in core, and cursor paging with date and answer filters on the server.
- Export (M28): `responsesToCsv` in core, `GET /surveys/{id}/responses.csv`, a new `@kvesto/export` package with a
  dependency-free Excel writer, CSV, Excel and Print buttons and a printable single response in the dashboard, and
  print styles for surveys. Cells that would run as spreadsheet formulas are defused.

## 0.2.0

Survey format (`schemaVersion` stays 1; every change is additive, so 0.1 surveys still load):

- A published JSON Schema for survey files (`@kvesto/schema/survey.schema.json`) and helpers to walk nested elements.
- Validation rules on questions: pattern, length, range, count, email, url and custom validators, with messages.
- Panels that group questions, and repeating panels where respondents add items (conditions can use `scope: "item"`).
- Grid questions: rows with typed cells (text, number, dropdown, yes/no), each with its own rules.

Server:

- Access control: an `authorize` hook per action, plus `apiKeyAuth` for Bearer keys (`KVESTO_API_KEYS` for the CLI).

Editor:

- A Design tab with an outline, a preview that selects on click, and a property panel for every question type.
- Undo and redo for every edit, backed by a headless `SurveyDocument` model.
- Drag and drop in the outline, from the palette too, with a full keyboard mode and screen reader announcements.
- A visual logic builder for `visibleIf` and `requiredIf`, which shows each condition in plain words.

Dashboard: results for panels, repeating panels and grids.

## 0.1.2

First working release.
