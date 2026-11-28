# Survey JSON

A survey is a JSON document in a versioned format (`schemaVersion: 1`). The format is defined once, as Zod schemas in
[`@kvesto/schema`](../../packages/schema/README.md), and shared by the runner, the server and the OpenAPI document.

## A first survey

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

## Question types

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

## Checking a survey

```ts
import { SurveySchema, migrateSurvey } from "@kvesto/schema";

SurveySchema.parse(json);           // validate a survey in the current format
const survey = migrateSurvey(json); // or upgrade an older schemaVersion, then validate
```

The format is also published as a JSON Schema (draft 2020-12). Point a survey file at it to get autocompletion and
checks in editors such as VS Code:

```json
{ "$schema": "https://cdn.jsdelivr.net/npm/@kvesto/schema/dist/survey.schema.json", "schemaVersion": 1, "id": "feedback", "title": "Feedback", "pages": [{ "id": "p1", "elements": [] }] }
```

To walk a survey in your own code, use `allQuestions(survey)`, `pageQuestions(page)`, `walkElements(survey, fn)` and
`findElement(survey, id)` instead of reading `page.elements`, so panels are included.

## Panels

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

## Repeating panels

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

## Conditional logic

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

## Expressions

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

## Answer piping

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

## Calculated values

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

## Triggers

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

## Validators

Any question takes a `validators` list. Each rule runs on a non-empty answer, in order, in the runner and on the
server; the first failure is shown, with the rule's optional `message` instead of the default one:

```json
{ "id": "zip", "type": "text", "title": "Postal code",
  "validators": [{ "type": "pattern", "pattern": "[0-9]{4}", "message": "Use four digits" }] }
```

| Validator | Applies to | Fields |
| --- | --- | --- |
| `pattern` | text, comment | `pattern` (must match the whole answer; nested repetition such as `(a+)+` and backreferences are refused, as they can take forever), `flags` (`i`, `m`, `s`, `u`) |
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

## Languages

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

## One question at a time

Set `"settings": { "layout": "question" }` on the survey, or pass `layout: "question"` to `mountSurvey` /
`renderSurvey`, to show one question (or panel, or content block) per screen with a progress bar. Enter goes on,
number keys pick the nth option of a choice question (or that value of a rating), and a single-choice, yes/no or
rating answer moves on by itself (`autoAdvance: false` turns that off). Logic still works per page; steps follow
it, so hidden questions and pages are skipped. Custom UIs can use `model.nextStep()`, `model.prevStep()`,
`state.steps` and `state.stepIndex`. `progressBar: true` adds the bar to the page layout too.

## Hidden fields

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

## Saving progress and coming back

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

## Privacy

- Mark questions that collect personal data with `"pii": true`. The server masks those answers (`[redacted]`) in
  response lists, CSV exports and webhooks unless `authorize` allows the `response:read-pii` action (`apiKeyAuth`
  allows it only with a key). `maskAnswers` in the core does the same for your own outputs.
- `{ "type": "boolean", "consent": true, "title": "I agree to …" }` is a consent checkbox (the editor's "consent"
  preset): it has to be ticked before submitting, and the server records the text and the time in `meta.consent`.
- `settings.anonymous` keeps no respondent id, no hidden fields except `settings.anonymousHidden`, and no client meta.
  The server never stores IP addresses or user agents.
- `settings.retentionDays` deletes responses and their files that are older, when `app.privacy.purge()` runs
  (`createApp({ purgeEverySeconds })` runs it on a timer).
- Every response comes back with a `resumeToken`, with which the respondent can download it
  (`POST …/responses/{id}/mine`) or delete it (`POST …/responses/{id}/forget`). Admins delete with
  `DELETE /surveys/{id}/responses/{responseId}` (`response:delete`), which removes the files too.

## Availability

```json
"settings": {
  "opensAt": "2026-06-01T09:00:00+02:00",
  "closesAt": "2026-06-30T18:00:00+02:00",
  "maxResponses": 500,
  "oneResponsePer": "respondent",
  "requireRespondent": true,
  "anonymous": true,
  "closedMessage": "Thanks, we have all the answers we need."
}
```

Outside the window, once `maxResponses` complete responses are in, or when this person has answered already, the
runner shows `closedMessage` (or a built-in text for the reason) instead of the survey, and the server refuses the
response with a `reason` of `not-open`, `closed`, `full`, `answered` or `sign-in`. `surveyAvailability(survey, ctx)`
in the core does the same check for your own code.

`oneResponsePer: "browser"` is remembered in the browser and enforced on the server by a random id the runner
sends; clearing site data gets around it. `"respondent"` and `requireRespondent` are enforced by the server, with the
id from `createApp({ identifyRespondent: (c) => … })`, which reads your own session or token and returns a stable id
(or null). Responses keep it as `respondentId`, except in an `anonymous` survey, where only a salted hash
(HMAC with `createApp({ respondentSecret })`) is kept, enough to refuse a second response.

`settings.antiSpam` adds bot friction that the server enforces: a honeypot field, a minimum time to complete, a
CAPTCHA token (the runner's `challenge` option; Turnstile, hCaptcha and reCAPTCHA verifiers on the server) and
duplicate detection. The server also has rate limits; see the
[server README](../../packages/server/README.md#rate-limits-and-spam).

## Themes

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

## Quizzes and scoring

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

## Content blocks and images

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

## Custom question types

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

## File uploads

Files are stored by the storage adapter's optional `uploadFile` as soon as the respondent picks them. `httpStorage`
sends them to the server; `memoryStorage`, `localStorageStorage` and runs without storage embed them in the answer
as base64 `data:` URLs (set `maxSize`: browsers cap localStorage at a few MB).

## JSON Schema interop

`answersJsonSchema(survey)` returns a JSON Schema (draft 2020-12) for the answers of a response, so a system that
doesn't run Kvesto can check submissions: types, choice values, ranges, lengths, patterns, matrix rows, repeat items
and file objects. `surveyFromJsonSchema(schema)` goes the other way and returns `{ survey, issues }`: a draft survey
with one question per property (enums become choices, small integer ranges become ratings, nested objects become
panels with prefixed ids) and a list of what couldn't be carried over.

Limits: JSON Schema can't express conditional logic, so a question with `visibleIf` or `requiredIf`, or on a
conditional page or panel, is optional in the answers schema; expressions, custom validators and custom question
types aren't checked; partial (in-progress) responses fail its `required`. In the other direction `oneOf`, `anyOf`,
`allOf`, `if`, `dependent*` and lists of objects are reported in `issues` and left out. Use `validateAnswers` for the
full check.
