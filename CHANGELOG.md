# Changelog

All notable changes to Kvesto. Dates are release dates.

All packages (`kvesto`, `@kvesto/schema`, `core`, `server`, `editor`, `dashboard`, `react`, `vue`, `export`) share one version.
Milestone numbers (M1, M2, …) refer to [ROADMAP.md](ROADMAP.md).

## Unreleased

### Changed

- The editor package styles its components with `kv:`-prefixed Tailwind utilities instead of scoped `<style>` blocks
  (M80). `src/lib/editor.css` is the Tailwind source (inline theme, no Preflight, unlayered utilities); the build
  compiles it to `dist/editor.css`, which the package entry imports (now listed in `sideEffects`) and the standalone
  bundle injects. Computed styles match 0.3.0 in 18 editor states at five widths, light and dark, and the `--kv-*`
  theming API is unchanged. ([20d0054])
- The dashboard package does the same with `src/lib/dashboard.css`, compiled to `dist/dashboard.css` (M81). Computed
  styles match 0.3.0 in 21 dashboard states, including print, tokens, audit and dark. ([2823611])
- The survey form's stylesheet moves to `packages/core/src/styles.css`, a Tailwind source compiled into
  `dist/styles.css`; `@kvesto/core/styles.css` still points at it (M82). Every rule keeps its `kv-` selector, so
  specificity and user overrides are unchanged, and the output defines no utility classes and no custom properties
  beyond `--kv-*`. ([7f58412])
- The editor and dashboard demo apps load Tailwind v4 (no Preflight) for their own chrome, with unchanged computed
  styles. ([de5311d])

### Fixed

- The editor's and dashboard's light theme declares `color-scheme: only light`, so a browser's forced dark mode or a
  dark-mode extension no longer repaints it. ([bfb0c13])
- The Light / Dark / Auto choice in the editor and dashboard is saved in localStorage and restored on reload; the
  `theme` prop stays the default until a choice is made. The editor demo's page and header follow the editor's
  theme. ([bfb0c13])

### Docs

- A documentation site on GitHub Pages (`apps/docs`, SvelteKit and Tailwind) at `/kvesto`, with the editor demo at
  `/kvesto/demo`. It renders `docs/guide/*.md` and the editor, dashboard and server READMEs. The long README
  sections (survey JSON, embedding, results, server) move to `docs/guide`. ([134d5b7])
- The docs header links to the Kvesto page on pavlovt.github.io. ([a9941bc], [98a008a])
- AGENTS.md says new app styling is Tailwind, and ROADMAP.md adds Phase 17 (M80 to M82). ([de5311d])

### Tests

- End-to-end tests check that the editor's and dashboard's CSS changes nothing outside them, and that a host's
  Preflight or element reset doesn't override their utilities. ([20d0054], [2823611])

## [0.3.0] - 2026-11-27

### Added

- Expressions (M11): `{ "expr": "{age} >= 18 and {role} = 'dev'" }` conditions, a safe parser and evaluator with
  built-in functions, and custom functions through `createSurvey({ functions })` and `createApp({ functions })`.
  The editor's logic builder can write expressions. ([97d572f])
- Answer piping (M12): `{questionId}` placeholders in titles, descriptions, choice labels and the new
  `completedText`, rendered as text; `{{` escapes a brace. The editor can insert an earlier answer into a title. ([c3a48db])
- Calculated values (M13): survey `variables`, a read-only `computed` question the server recalculates,
  `expression` validators, and value rules on every question: `defaultValue`, `defaultExpr`, `readOnly`,
  `enableIf` and `resetIf`. Numeric text now compares as numbers in expressions. ([ce76e3c])
- Triggers (M14): survey `triggers` that set or copy a value, skip to a page or submit when a condition becomes
  true, with an editor for them in the survey settings. ([3521289])
- Custom question types (M15): `registerQuestionType` with a schema, validation, a renderer, a dashboard summary
  and editor defaults; `x-*` types in surveys, `createApp({ questionTypes })` on the server. ([eb2284c])
- Content blocks and images (M16): `content` elements with a safe Markdown subset and answer placeholders (raw
  `html` only through a host `sanitizeHtml`), and `image` elements, both with `visibleIf` and in the editor palette. ([1af4c1e])
- Input question types (M17): `multi-text`, `slider`, `tags` (searchable, optional own entries) and `image-choice`,
  plus `searchable` dropdowns, with validation, rendering, summaries and editor support. ([7688758])
- Signature (M18): a `signature` question drawn on a canvas and uploaded as a PNG through the file path, with
  dashboard thumbnails for image uploads. ([037c1b7])
- One question at a time (M19): `settings.layout: "question"` (or the `layout` render option) with a progress bar,
  Enter to continue, number keys and auto-advance; `nextStep` / `prevStep` on the model; a preview toggle in the
  editor. `mountSurvey` now passes every render option on (it used to drop all but `labels`). ([f4e73d9])
- Localization (M20): per-locale display text with `defaultLocale` and `locales`, a `locale` option on the runner and
  dashboard, built-in labels and validation messages in 12 languages, server messages from `Accept-Language`, and an
  editor Translations tab with CSV, XLIFF and JSON import and export and AI drafts through a `translate` hook. ([1389c29])
- Partial responses and resume (M21): `saveProgress` / `loadProgress` on storage adapters, `createSurvey({ resume })`,
  partial responses on the server with a hashed resume token (`PATCH` and `POST …/resume`), lists that leave partials
  out unless asked, and completion and drop-off in the dashboard. Database migration `0002_partial_responses`. ([e422d43])
- Hidden fields (M22): `hiddenFields` filled from the `hidden` option or (opt-in) URL parameters, usable in conditions,
  expressions and piping, stored in `meta.hidden`, validated with on the server, and filterable by API and dashboard. ([d082ffe])
- Themes (M23): the runner's stylesheet on CSS variables with light, dark, auto, compact and contrast presets, a
  `theme` option and `settings.theme`, an editor Theme tab with CSS and JSON export, and light, dark and auto looks
  for the editor and the dashboard themselves. ([cb7f7ff])
- Quiz mode and scoring (M24): `correctAnswer`, `points`, partial credit and penalties, choice scores, `score()` in
  expressions, `settings.quiz` (pass mark, correct answers and feedback, manual release, time limits per survey or
  page), a server that recalculates scores, a release route, and score statistics in the dashboard. ([5ffc90c])
- Accessibility audit (M25): axe-core checks on every question type and every editor tab, an error summary with links,
  errors tied to their inputs, `autocomplete` on text questions, a typed signature, announced ranking moves, 24-pixel
  targets, `lang` on the survey, and ACCESSIBILITY.md with the keyboard map and a conformance report. ([08cf631])
- Framework wrappers (M26): a `<kvesto-survey>` custom element (`defineSurveyElement`), and new `@kvesto/react` and
  `@kvesto/vue` packages with a `<Survey>` component and a `useSurvey` hook or composable, in the release workflow. ([e1c8531])
- Dashboard table view and filters (M27): a sortable, paged table of responses with flattened columns, filters by
  date, answer, hidden field and status that also apply to the summaries, `filterResponses` / `responseColumns` /
  `responseRow` in core, and cursor paging with date and answer filters on the server. ([912e1f9])
- Export (M28): `responsesToCsv` in core, `GET /surveys/{id}/responses.csv`, a new `@kvesto/export` package with a
  dependency-free Excel writer, CSV, Excel and Print buttons and a printable single response in the dashboard, and
  print styles for surveys. Cells that would run as spreadsheet formulas are defused. ([9d7dcdf])
- Webhooks (M29): per-survey webhooks for `response.completed` and `response.updated`, signed with HMAC-SHA256
  (`verifyWebhook`), retried with backoff, with a delivery log, an `onResponse` hook, the `webhook:manage` action,
  and `guardOutboundUrl` against server-side request forgery. Database migration `0003_webhooks`. ([1cf9e97])
- Hosted embeds (M30): a survey page at `/s/{id}` under a strict CSP, an embed script with inline (self-sizing),
  popup and slide-in modes, link and embed snippets in the editor, and a Playwright test that embeds and completes a
  survey from another origin. ([3e57e74])
- JSON Schema interop: `answersJsonSchema(survey)` for checking answers outside Kvesto, and `surveyFromJsonSchema(schema)` to start a survey from an existing schema (M31). ([8c63eba])
- Survey availability: `settings.opensAt`, `closesAt`, `maxResponses`, `oneResponsePer`, `requireRespondent`, `anonymous` and `closedMessage`, shown by the runner and enforced by the server, with `identifyRespondent` and hashed respondent keys (M32). ([c62599b])
- Security baseline: `SECURITY.md`, a threat model, CodeQL, OpenSSF Scorecard, Dependabot, `pnpm audit --prod` in CI, and GitHub Actions pinned to commit SHAs with least-privilege permissions (M33). ([8ef1db1])
- Hardened HTTP defaults: secure headers and request ids on every response, errors without internals, CORS split into respondent routes (`cors`, default `*`) and admin routes (`adminCors`, default none), body size limits, and `SURVEY_LIMITS` / `ANSWER_LIMITS` enforced by the schema and checked before parsing (M34). **Breaking:** browsers on other origins need `adminCors` to call the admin routes, and documents over the limits are refused. ([783959a])
- Rate limiting and spam protection: `createApp({ rateLimit })` with per-address budgets, 429 and `Retry-After`, a pluggable store and trusted-proxy handling; `settings.antiSpam` with a honeypot, a minimum time to complete (signed start token), CAPTCHA verification (`verifyChallenge`, Turnstile, hCaptcha and reCAPTCHA helpers) and duplicate detection (M35). ([5cbda58])
- Upload hardening: real file types read from the bytes (disguised files and polyglots refused), safe file names, SVG/HTML/XML never inline, survey and response quotas, `app.uploads.sweep()` for unused uploads, a `scanFile` hook, and optional expiring signed file URLs (M36). ([0a7ed7b])
- Privacy controls: `pii` questions masked in lists, exports and webhooks without the new `response:read-pii` action; consent checkboxes (`consent: true`, an editor preset) with the text and time recorded; stricter `settings.anonymous` with `anonymousHidden`; `settings.retentionDays` with `app.privacy.purge()`; `DELETE /surveys/{id}/responses/{responseId}` (`response:delete`); respondents download or delete their own response with its token, which every response now returns (M37). Custom `authorize` functions must handle the new actions. ([1dce4b5])
- Encryption at rest: `drizzleRepository(db, { encryption })` stores `pii` answers and uploaded files encrypted with AES-256-GCM under key ids, with rotation through `repository.reencrypt()` / `kvesto-server reencrypt` and keys from `KVESTO_ENCRYPTION_KEYS` (M38). ([f60932e])
- Roles and scoped tokens: `ROLE_ACTIONS` (owner, editor, analyst, viewer), hashed and expiring API tokens with optional survey scopes (`POST/GET /tokens`, `DELETE /tokens/{id}`, `tokenAuth`), an OpenID Connect sign-in (`oidcLogin`) with signed session cookies and CSRF checks on cookie writes, and `anyAuthorize` to combine them (M39). New `token:manage` action. ([9a340b2])
- Audit log: one hash-chained entry per admin request (actor, action, survey, status, address, request id), `GET /audit` and `GET /audit.csv` (`audit:read`), an `onAudit` hook, `setActor` for custom `authorize` functions, and `app.audit.verify()` to detect tampering (M40). ([20665cb])
- Security test suite: fast-check fuzzing of the survey schema, expressions and condition logic with fixed time budgets, an XSS corpus through every render path, an OWASP ZAP baseline scan in CI, and a release checklist in `SECURITY.md`. Pattern validators now refuse nested repetition and backreferences (`regexRisk`), which could take exponential time (M41). ([efebf4d])
- Admin UI for the server features above: the editor sets `antiSpam`, `retentionDays` and `anonymousHidden` in the survey settings; the dashboard, given `api` (the `httpStorage` options), manages API tokens, shows the audit log with filters, paging and a CSV download, deletes a response, and marks answers masked as `[redacted]`. ([d6bf6c8])

### Breaking changes

- Browsers on other origins need `adminCors` to call the admin routes, and survey and answer documents over
  `SURVEY_LIMITS` / `ANSWER_LIMITS` are refused (M34). ([783959a])
- Custom `authorize` functions must handle the new `response:read-pii` and `response:delete` actions (M37), and
  `token:manage` (M39). ([1dce4b5], [9a340b2])
- Pattern validators with nested repetition or backreferences are refused (`regexRisk`) (M41). ([efebf4d])

### Fixed

- The Svelte extension no longer reports false errors on BraceML templates. ([92f57be])

### Infrastructure

- The release workflow creates the git tag and the GitHub release, and can be run by hand. ([588ab38])
- CI gives the demo apps their own package names, and the GitHub actions move to their Node 24 majors.
  ([db31884], [afc6626])
- `@kvesto/react`, `@kvesto/vue` and `@kvesto/export` are added to the release workflow. ([e1c8531], [9d7dcdf])

### Docs

- ROADMAP.md: M33 to M73, starting with a security and privacy phase, and a competitive review of survey tools
  with M74 to M79. ([bd054d4], [46d8362], [d9c9cac])

## [0.2.0] - 2026-11-27

Milestones M1 to M10. The survey format keeps `schemaVersion` 1: every change is additive, so 0.1 surveys still load.

### Added

- A published JSON Schema for survey files, `surveyJsonSchema()` and `@kvesto/schema/survey.schema.json`; surveys
  may carry a `$schema` link (M1). ([cdafff3])
- `allQuestions`, `pageQuestions`, `walkElements` and `findElement` in `@kvesto/schema` to walk nested elements, and
  `DisplayTextSchema` for every human-readable string (M1). ([cdafff3])
- Server access control: `createApp({ authorize })` is asked before every API action and can allow, refuse with 403
  or send its own Response; `apiKeyAuth({ keys, publicActions })` keeps respondent actions public and requires a
  Bearer key for the rest; `openAccess` allows all. `kvesto-server` reads `KVESTO_API_KEYS` (M2). ([4093a26])
- Validation rules on every question: pattern, length, range, count, email, url and custom validators, each with an
  optional message. Custom validators are registered with `createSurvey({ validators })` and
  `createApp({ validators })` (M3). ([2dd8746])
- Panels that group questions and panels under an optional title and description, with `visibleIf`, shown as nested
  fieldsets and as group headings in the dashboard (M4). ([6994751])
- Repeating panels, where respondents add items (`repeat { min, max, addLabel, removeLabel, itemTitle }`). Conditions
  inside an item use `scope: "item"`, and `SurveyModel` gains `addItem`, `removeItem`, `setItemValue` and
  `getItems` (M5). ([2e07b34])
- Grid questions: rows with typed cells (text, number, dropdown, yes/no), each column with its own `required` and
  validators, with per-row and per-column summaries (M6). ([2110fb2])
- Editor: undo and redo for every edit, backed by a headless `SurveyDocument` model, with Ctrl/Cmd+Z and
  Shift+Z (M7). ([5035780])
- Editor: a Design tab with an outline, a preview that selects on click, and a property panel for every question
  type; the JSON view stays as a second tab (M8). ([4967148])
- Editor: drag and drop in the outline, from the palette too, with a full keyboard mode and screen reader
  announcements; every drop is one undo step (M9). ([d97e0c1])
- Editor: a visual logic builder for `visibleIf` and `requiredIf`, which only offers questions a condition may use and
  shows each condition in plain words (M10). ([b761c37])
- Dashboard: results for panels, repeating panels and grids. ([6994751], [2e07b34], [2110fb2])

### Changed

- Without `authorize`, the server warns at startup (M2). ([4093a26])

### Docs

- ROADMAP.md, a feature roadmap of small, independently shippable milestones. ([15e9db8])
- CHANGELOG.md. ([6c8472e])

## [0.1.2] - 2026-11-26

The first working release.

### Added

- `@kvesto/editor` and `@kvesto/dashboard`: Svelte 5 component packages built with svelte-package (BraceML compiled
  to plain Svelte first), plus a standalone bundle with `mountEditor` / `mountDashboard` for apps without a Svelte
  compiler. The SvelteKit apps are now demos that use the packages. ([b7427b0])

## 0.1.1 - 2026-11-26

### Fixed

- Every published package builds on `prepack`. The first manual publish ran without a build, so the 0.1.0 tarballs
  had no `dist` folder. ([9244dd4])

## 0.1.0 - 2026-11-26

The first version on npm: `kvesto`, `@kvesto/core`, `@kvesto/schema` and `@kvesto/server`. Its tarballs have no
`dist` folder, so it doesn't work; use 0.1.1 or later.

### Added

- `@kvesto/schema`: versioned survey JSON as shared Zod schemas, and `migrateSurvey`. ([c6c46f1])
- `@kvesto/core`: a backend-free survey runtime, a DOM renderer, a `SurveyStorage` interface with memory,
  localStorage and HTTP adapters, and response summaries. ([c6c46f1])
- `@kvesto/server`: a Hono and Drizzle (SQLite) REST API with OpenAPI 3.1 docs (Scalar at `/docs`). ([c6c46f1])
- Matrix, ranking and file question types, and `visibleIf` / `requiredIf` on questions and `visibleIf` on pages as a
  JSON condition tree (no eval) that may only reference earlier questions. ([25cb11d])
- File uploads through an optional `SurveyStorage.uploadFile` (data URL fallback), and `POST`/`GET
  /surveys/{id}/files` on the server with type and size limits. ([25cb11d])
- `validateAnswers` in core, and logic-aware response validation on the server. ([25cb11d])
- The unscoped `kvesto` package, which re-exports the core and ships a `<script>` bundle (`window.Kvesto`).
  ([0858324])
- SvelteKit editor and dashboard apps with BraceML templates: an editor palette and starter survey, and dashboard
  views for matrix, ranking and file answers. ([c6c46f1], [25cb11d])

### Fixed

- `@kvesto/server` no longer crashes when `@kvesto/schema` is imported first (Zod 4 with `.openapi`). ([0858324])

### Infrastructure

- CI, and a tag-triggered release workflow with npm trusted publishing (OIDC, provenance), RELEASING.md and release
  scripts. ([c6c46f1], [0858324])

### Docs

- A README with a banner (`docs/assets/kvesto-banner.svg`), and AGENTS.md. ([c6c46f1], [0fd13a0])

[0.3.0]: https://github.com/pavlovt/kvesto/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/pavlovt/kvesto/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/pavlovt/kvesto/releases/tag/v0.1.2

[20d0054]: https://github.com/pavlovt/kvesto/commit/20d0054
[2823611]: https://github.com/pavlovt/kvesto/commit/2823611
[7f58412]: https://github.com/pavlovt/kvesto/commit/7f58412
[de5311d]: https://github.com/pavlovt/kvesto/commit/de5311d
[bfb0c13]: https://github.com/pavlovt/kvesto/commit/bfb0c13
[134d5b7]: https://github.com/pavlovt/kvesto/commit/134d5b7
[a9941bc]: https://github.com/pavlovt/kvesto/commit/a9941bc
[98a008a]: https://github.com/pavlovt/kvesto/commit/98a008a
[97d572f]: https://github.com/pavlovt/kvesto/commit/97d572f
[c3a48db]: https://github.com/pavlovt/kvesto/commit/c3a48db
[ce76e3c]: https://github.com/pavlovt/kvesto/commit/ce76e3c
[3521289]: https://github.com/pavlovt/kvesto/commit/3521289
[eb2284c]: https://github.com/pavlovt/kvesto/commit/eb2284c
[1af4c1e]: https://github.com/pavlovt/kvesto/commit/1af4c1e
[7688758]: https://github.com/pavlovt/kvesto/commit/7688758
[037c1b7]: https://github.com/pavlovt/kvesto/commit/037c1b7
[f4e73d9]: https://github.com/pavlovt/kvesto/commit/f4e73d9
[1389c29]: https://github.com/pavlovt/kvesto/commit/1389c29
[e422d43]: https://github.com/pavlovt/kvesto/commit/e422d43
[d082ffe]: https://github.com/pavlovt/kvesto/commit/d082ffe
[cb7f7ff]: https://github.com/pavlovt/kvesto/commit/cb7f7ff
[5ffc90c]: https://github.com/pavlovt/kvesto/commit/5ffc90c
[08cf631]: https://github.com/pavlovt/kvesto/commit/08cf631
[e1c8531]: https://github.com/pavlovt/kvesto/commit/e1c8531
[912e1f9]: https://github.com/pavlovt/kvesto/commit/912e1f9
[9d7dcdf]: https://github.com/pavlovt/kvesto/commit/9d7dcdf
[1cf9e97]: https://github.com/pavlovt/kvesto/commit/1cf9e97
[3e57e74]: https://github.com/pavlovt/kvesto/commit/3e57e74
[8c63eba]: https://github.com/pavlovt/kvesto/commit/8c63eba
[c62599b]: https://github.com/pavlovt/kvesto/commit/c62599b
[8ef1db1]: https://github.com/pavlovt/kvesto/commit/8ef1db1
[783959a]: https://github.com/pavlovt/kvesto/commit/783959a
[5cbda58]: https://github.com/pavlovt/kvesto/commit/5cbda58
[0a7ed7b]: https://github.com/pavlovt/kvesto/commit/0a7ed7b
[1dce4b5]: https://github.com/pavlovt/kvesto/commit/1dce4b5
[f60932e]: https://github.com/pavlovt/kvesto/commit/f60932e
[9a340b2]: https://github.com/pavlovt/kvesto/commit/9a340b2
[20665cb]: https://github.com/pavlovt/kvesto/commit/20665cb
[efebf4d]: https://github.com/pavlovt/kvesto/commit/efebf4d
[d6bf6c8]: https://github.com/pavlovt/kvesto/commit/d6bf6c8
[92f57be]: https://github.com/pavlovt/kvesto/commit/92f57be
[588ab38]: https://github.com/pavlovt/kvesto/commit/588ab38
[db31884]: https://github.com/pavlovt/kvesto/commit/db31884
[afc6626]: https://github.com/pavlovt/kvesto/commit/afc6626
[bd054d4]: https://github.com/pavlovt/kvesto/commit/bd054d4
[46d8362]: https://github.com/pavlovt/kvesto/commit/46d8362
[d9c9cac]: https://github.com/pavlovt/kvesto/commit/d9c9cac
[cdafff3]: https://github.com/pavlovt/kvesto/commit/cdafff3
[4093a26]: https://github.com/pavlovt/kvesto/commit/4093a26
[2dd8746]: https://github.com/pavlovt/kvesto/commit/2dd8746
[6994751]: https://github.com/pavlovt/kvesto/commit/6994751
[2e07b34]: https://github.com/pavlovt/kvesto/commit/2e07b34
[2110fb2]: https://github.com/pavlovt/kvesto/commit/2110fb2
[5035780]: https://github.com/pavlovt/kvesto/commit/5035780
[4967148]: https://github.com/pavlovt/kvesto/commit/4967148
[d97e0c1]: https://github.com/pavlovt/kvesto/commit/d97e0c1
[b761c37]: https://github.com/pavlovt/kvesto/commit/b761c37
[15e9db8]: https://github.com/pavlovt/kvesto/commit/15e9db8
[6c8472e]: https://github.com/pavlovt/kvesto/commit/6c8472e
[b7427b0]: https://github.com/pavlovt/kvesto/commit/b7427b0
[9244dd4]: https://github.com/pavlovt/kvesto/commit/9244dd4
[c6c46f1]: https://github.com/pavlovt/kvesto/commit/c6c46f1
[25cb11d]: https://github.com/pavlovt/kvesto/commit/25cb11d
[0858324]: https://github.com/pavlovt/kvesto/commit/0858324
[0fd13a0]: https://github.com/pavlovt/kvesto/commit/0fd13a0
