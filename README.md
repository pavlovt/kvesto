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
| `computed` | worked-out value | read-only; `expr`, `decimals`, `prefix`, `suffix` (see Calculated values) |
| `multi-text` | `{ field: text }` | `items` of `{ value, label, inputType?, required? }`, one input each |
| `slider` | number | `min` (default 0), `max` (default 100), `step` (default 1), `unit`; unanswered until moved |
| `tags` | values (and typed entries) | searchable `choices`, `allowCustom`, `maxTags` |
| `image-choice` | choice value(s) | `choices` with `imageUrl`; `multiple` for several |
| `signature` | `[{ name, type, size, url }]` | drawn with a mouse, pen or finger and uploaded as one PNG like a file; `width`, `height`, `penColor`, `maxSize` (default 512 KB) |

`dropdown` also takes `searchable: true`, which lets respondents type to find a choice in a long list.

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

#### Calculated values

```json
{ "variables": [{ "name": "total", "expr": "{price} * {qty}" }],
  "pages": [{ "id": "p1", "elements": [
    { "id": "price", "type": "text", "inputType": "number", "title": "Price", "readOnly": true, "defaultValue": "12" },
    { "id": "qty", "type": "text", "inputType": "number", "title": "Quantity",
      "validators": [{ "type": "expression", "expr": "{qty} >= 1 and {qty} <= 10", "message": "Order 1 to 10" }] },
    { "id": "sum", "type": "computed", "title": "Total", "expr": "{total}", "decimals": 2, "prefix": "€" }
  ] }] }
```

- **Variables** (`variables` on the survey) are named expressions, usable in other expressions and in piped text
  as `{name}`. They may use each other in any order but not in a cycle, and an element may only use a variable whose
  questions come before it.
- **Computed questions** (`type: "computed"`) show a value worked out from `expr` and store it with the response.
  The server recalculates it and ignores what the client sent.
- **Expression rules** (`{ "type": "expression", "expr": "{end} > {start}" }`) may use the question they check.
- **Value rules** on any question: `defaultValue` (the starting answer), `defaultExpr` (worked out once, when the
  question is first shown), `readOnly` and `enableIf` (shown but not editable; the server refuses an answer that
  differs from the default), and `resetIf` (clear the answer when the condition becomes true).

#### Triggers

`triggers` on the survey run an action when their condition becomes true (not again while it stays true):

```json
{ "triggers": [
  { "when": { "question": "member", "op": "eq", "value": "yes" },
    "action": { "type": "setValue", "question": "discount", "value": "10" } },
  { "when": { "expr": "{billing} != null" }, "action": { "type": "copyValue", "from": "billing", "to": "shipping" } },
  { "when": { "question": "eligible", "op": "eq", "value": false }, "action": { "type": "skipToPage", "page": "end" } },
  { "when": { "question": "consent", "op": "eq", "value": "no" }, "action": { "type": "complete" } }
] }
```

They can use and set any question outside repeating panels (computed questions can't be set). Prefilled answers
don't fire them, and triggers that set each other stop after a few rounds, so they can't loop forever. Triggers run
in the runner; the server validates whatever answers they produced like any others.

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

#### Languages

Any text in a survey can be a plain string (in the survey's `defaultLocale`, "en" unless set) or an object per
locale. Pick the locale when creating the runner:

```json
{ "defaultLocale": "en", "locales": ["en", "de"],
  "title": { "en": "Feedback", "de": "Rückmeldung" },
  "pages": [{ "id": "p1", "elements": [
    { "id": "name", "type": "text", "title": { "en": "Your name", "de": "Ihr Name" } } ] }] }
```

```ts
mountSurvey(el, { survey, locale: "de" }); // also createSurvey({ survey, locale })
```

`detectLocale(survey, { url: location.href, languages: navigator.languages })` picks one of the survey's
`locales` from a `?lang=` URL parameter (opt-in, by passing `url`) or the browser's languages. A missing translation
falls back to the language (`pt` for `pt-BR`), then to the default locale. The runner's
buttons and the validation messages come in English, Bulgarian, German, French, Spanish, Italian, Portuguese,
Dutch, Polish, Russian, Chinese and Japanese; `addLocalePack(locale, { labels, messages })` adds or overrides one.
The server answers with messages in the first `Accept-Language` the survey offers, and the dashboard takes a
`locale` too.

**Translating.** The editor's Translations tab lists every text per language, highlights the missing ones, and
exports and imports them as CSV, XLIFF 2.0 or JSON. The JSON file says what to translate and what to keep, so it can
be handed straight to an AI tool. Pass a `translate` function to the editor to fill a language with machine
translations:

```ts
mountEditor(el, {
  survey,
  // texts by key in, translations by key out: call any AI model or translation service here.
  translate: async (texts, from, to) => myAi.translate(texts, from, to),
});
```

Machine-translated texts are marked "to review" (in `translationsToReview`) until someone confirms them. A
translation that drops or changes an answer placeholder such as `{name}` is refused and reported, on import and from
`translate` alike. The same tools work without the editor: `translationTable`, `exportTranslations`,
`importTranslations`, `translateSurvey` and `markReviewed` in `@kvesto/core`.

#### One question at a time

Set `"settings": { "layout": "question" }` on the survey, or pass `layout: "question"` to `mountSurvey` /
`renderSurvey`, to show one question (or panel, or content block) per screen with a progress bar. Enter goes on,
number keys pick the nth option of a choice question (or that value of a rating), and a single-choice, yes/no or
rating answer moves on by itself (`autoAdvance: false` turns that off). Logic still works per page; steps follow
it, so hidden questions and pages are skipped. Custom UIs can use `model.nextStep()`, `model.prevStep()`,
`state.steps` and `state.stepIndex`. `progressBar: true` adds the bar to the page layout too.

#### Hidden fields

Declare values your site passes in without a visible question, such as a campaign or your own user id:

```json
{ "hiddenFields": ["source", "userId"],
  "pages": [{ "id": "p1", "elements": [
    { "id": "code", "type": "text", "title": "Your {source} code", "visibleIf": { "question": "source", "op": "eq", "value": "newsletter" } } ] }] }
```

```ts
mountSurvey(el, { survey, hidden: { userId: currentUser.id } });
mountSurvey(el, { survey, hiddenFromUrl: location.href }); // opt-in: ?source=newsletter
```

Only declared fields are read; other URL parameters are ignored. They work in conditions, expressions and piped text
like answers, are stored in the response's `meta.hidden`, and the server uses them when it validates. Filter by
them with `GET /surveys/{id}/responses?hidden=source:newsletter`, or in the dashboard.

#### Saving progress and coming back

With a storage adapter that has `saveProgress`, the runner saves the answers so far after every page (or step) and
reports a resume token:

```ts
const model = createSurvey({ survey, storage, onProgress: (token) => rememberSomewhere(token) });
// later, maybe on another device:
const draft = await storage.loadProgress(survey.id, token);
const resumed = createSurvey({ survey, storage, resume: draft! }); // same answers, same page; completing finishes it
```

`localStorageStorage` keeps one draft per survey in the browser. `httpStorage` saves a partial response on the
server: `POST /surveys/{id}/responses` with `"status": "partial"` returns a `resumeToken`, which updates or completes
it with `PATCH /surveys/{id}/responses/{responseId}` and loads it back with `POST …/{responseId}/resume` (the
token goes in the body, never the URL). Partial answers are checked, but nothing is required until completion, and
only the token can change a partial response; a completed one can't be changed. Lists and counts leave partial
responses out unless asked (`?status=partial` or `?status=all`). The dashboard shows the completion rate and where
people stop, and can include partial responses in the results.

#### Themes

The default stylesheet is built on CSS custom properties. Pick a preset or set variables (without `--kv-`):

```ts
mountSurvey(el, { survey, theme: "dark" });             // light (default), dark, auto, compact, contrast
mountSurvey(el, { survey, theme: { preset: "auto", "color-primary": "#e11d48", radius: "0" } });
```

`auto` follows the device's light or dark setting. A survey can carry its own look in `settings.theme` (the same
shapes); the `theme` option overrides it. The variables are listed in `THEME_VARIABLES`, `themeToCss(theme)` turns a
theme into a stylesheet rule, and the old `--kv-accent` and `--kv-error` still work. The editor's Theme tab edits a
survey's theme with a live preview and exports it as CSS or JSON.

The editor and the dashboard have their own light, dark and auto looks: pass `theme: "dark"` (or `"auto"`) to
`mountEditor` / `mountDashboard`, or switch with the menu in their toolbar.

#### Quizzes and scoring

```json
{ "settings": { "quiz": { "passMark": 0.7, "showCorrect": true, "timeLimit": 600 } },
  "pages": [{ "id": "p1", "timeLimit": 120, "elements": [
    { "id": "capital", "type": "single-choice", "title": "Capital of France?", "correctAnswer": "paris",
      "choices": [{ "value": "rome", "label": "Rome" }, { "value": "paris", "label": "Paris" }],
      "feedback": { "correct": "Right!", "wrong": "It is Paris." } },
    { "id": "primes", "type": "multiple-choice", "title": "Primes", "correctAnswer": ["2", "3"], "points": 2,
      "partialCredit": true, "penalty": 0.5, "choices": [{ "value": "2", "label": "2" }, { "value": "3", "label": "3" }, { "value": "4", "label": "4" }] }
  ] }] }
```

A question scores through `correctAnswer` (worth `points`, default 1; lists and matrices can give `partialCredit`,
minus `penalty` per wrong pick), or through `score` on its choices for assessments. `score()`, `score('q1')` and
`maxScore()` work in expressions, so a variable can turn a score into a result ("advanced") without quiz mode. With
`settings.quiz` the completion screen shows the score, pass or fail against `passMark`, and with `showCorrect` the
right answers and `feedback`. `releaseScores: "manual"` keeps the score back until someone calls
`POST /surveys/{id}/responses/{responseId}/release`. `timeLimit` (whole survey, or per page) shows a countdown;
when a page's time is up the survey moves on, and when the survey's is up it submits what was answered. The server
always recalculates the score into `meta.quiz` and ignores one the client sent. The dashboard shows the average,
pass rate and score distribution.

#### Content blocks and images

Pages and panels can also hold elements that show something but take no answer:

```json
{ "id": "intro", "type": "content", "markdown": "Thanks for joining, **{name}**.\n\n- It takes 2 minutes\n- [Privacy](https://example.com/privacy)" },
{ "id": "logo", "type": "image", "src": "https://example.com/logo.png", "alt": "Example Ltd logo", "width": 160 }
```

`markdown` takes a small, safe subset: paragraphs, `**bold**`, `*italic*`, `[links](https://…)` (http, https,
mailto and relative only) and `-` or `1.` lists, plus answer placeholders. It is turned into DOM nodes, never HTML.
A block may also carry raw `html`, which is shown only if you pass a sanitizer, such as DOMPurify, to the renderer:
`mountSurvey(el, { survey, sanitizeHtml: (html) => DOMPurify.sanitize(html) })`. Otherwise the Markdown is shown.
Image `src` must be an http(s) URL, a relative path or a `data:image` URL. Both take `visibleIf`.

#### Custom question types

Register a type once, then use it in surveys as `"type": "x-…"`:

```ts
import { registerQuestionType, z } from "@kvesto/core";

registerQuestionType({
  type: "x-colour",
  label: "colour",                                             // name in the editor palette
  schema: z.looseObject({ palette: z.array(z.string()).optional() }), // checks the question's JSON
  validate: (question, value) => (/^#[0-9a-f]{6}$/.test(String(value)) ? null : "Pick a colour."),
  render: ({ value, setValue, document, id, labelId }) => {
    const input = document.createElement("input");
    Object.assign(input, { type: "color", id, value: value ?? "#000000" });
    input.setAttribute("aria-labelledby", labelId);
    input.addEventListener("input", () => setValue(input.value));
    return { element: input, update: (v) => (input.value = v ?? "#000000") };
  },
  summarize: (question, values) => ({ samples: values.map(String) }),  // dashboard
  editorDefaults: { palette: ["#ff0000"] },                            // new questions from the palette
});
```

Register the same types on the server (`createApp({ questionTypes: [colour] })`) so answers are validated there
too. A survey that uses an unregistered type, or breaks a type's `schema`, is refused when it is loaded or saved.
Without `render` the runner shows a text input; without `validate` any answer is accepted; without `summarize` the
dashboard lists the latest answers.

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
