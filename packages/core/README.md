# @kvesto/core

Framework-agnostic survey runtime for [Kvesto](https://github.com/pavlovt/kvesto): reads survey JSON, validates
answers, evaluates conditional logic, renders the survey with plain DOM, and saves responses through a pluggable
storage adapter. No backend and no UI framework required.

```sh
npm install @kvesto/core
```

```ts
import { mountSurvey, httpStorage, loadSurvey, renderSurvey } from "@kvesto/core";
import "@kvesto/core/styles.css"; // optional default theme

// No backend: handle the answers yourself.
mountSurvey(document.getElementById("survey")!, {
  survey: mySurvey,
  onComplete: ({ response }) => console.log(response.answers),
});

// With the Kvesto server, or any backend that speaks the same REST contract.
const storage = httpStorage({ baseUrl: "https://example.com/api" });
renderSurvey(el, await loadSurvey("customer-feedback", { storage }));
```

Storage is configuration: pass any object that implements `SurveyStorage`, or one of the bundled adapters
`memoryStorage()`, `localStorageStorage()` and `httpStorage({ baseUrl })`.

`SurveyModel` (from `createSurvey`) is DOM-free and its `subscribe` follows the Svelte store contract, so you can
drive your own UI in React, Vue or Svelte instead of using the bundled renderer.

This package re-exports [`@kvesto/schema`](https://www.npmjs.com/package/@kvesto/schema). For a single install with a
`<script>` bundle, use [`kvesto`](https://www.npmjs.com/package/kvesto).

See the [documentation](https://pavlovt.github.io/kvesto/survey-json/) for the survey JSON format, question types and logic.

## License

MIT
