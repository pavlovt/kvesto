# @kvesto/schema

The versioned survey JSON format of [Kvesto](https://github.com/pavlovt/kvesto) as [Zod](https://zod.dev) schemas,
shared by the core, the server and its OpenAPI document.

```sh
npm install @kvesto/schema
```

```ts
import { SurveySchema, migrateSurvey } from "@kvesto/schema";

SurveySchema.parse(json);          // validate a survey in the current format
const survey = migrateSurvey(json); // or upgrade an older schemaVersion, then validate
```

`migrateSurvey` upgrades surveys saved with an older `schemaVersion`. Breaking format changes bump
`SURVEY_SCHEMA_VERSION` and add a migration step, so stored surveys keep working.

## JSON Schema

The format is also published as a JSON Schema (draft 2020-12), generated from the Zod schemas at build time:
`@kvesto/schema/survey.schema.json`, or
[from the CDN](https://cdn.jsdelivr.net/npm/@kvesto/schema/dist/survey.schema.json). Point a survey file at it to get
autocompletion and checks in editors such as VS Code:

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@kvesto/schema/dist/survey.schema.json",
  "schemaVersion": 1,
  "id": "feedback",
  "title": "Feedback",
  "pages": [{ "id": "p1", "elements": [] }]
}
```

`surveyJsonSchema()` returns the same schema at runtime, for backends in other languages or for your own tooling. It
checks structure and types; cross-field rules such as unique ids and conditions that only refer to earlier
questions are enforced by `SurveySchema` and `migrateSurvey`.

## Walking a survey

Use `allQuestions(survey)`, `pageQuestions(page)`, `walkElements(survey, fn)` and `findElement(survey, id)` instead
of reading `page.elements` directly. They keep working when pages gain nested containers such as panels.

You usually don't need to install this directly: [`@kvesto/core`](https://www.npmjs.com/package/@kvesto/core) and
[`kvesto`](https://www.npmjs.com/package/kvesto) re-export it.

## License

MIT
