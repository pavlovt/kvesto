# Changelog

All six packages (`kvesto`, `@kvesto/schema`, `core`, `server`, `editor`, `dashboard`) share one version.

## Unreleased

- Expressions (M11): `{ "expr": "{age} >= 18 and {role} = 'dev'" }` conditions, a safe parser and evaluator with
  built-in functions, and custom functions through `createSurvey({ functions })` and `createApp({ functions })`.
  The editor's logic builder can write expressions.

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
