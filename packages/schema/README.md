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

You usually don't need to install this directly: [`@kvesto/core`](https://www.npmjs.com/package/@kvesto/core) and
[`kvesto`](https://www.npmjs.com/package/kvesto) re-export it.

## License

MIT
