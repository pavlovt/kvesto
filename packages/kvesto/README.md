# kvesto

Open source, MIT-licensed surveys. Define a survey as JSON and render it anywhere with a small, framework-free core.

This package is the one-install entry point: it re-exports everything from [`@kvesto/core`](https://www.npmjs.com/package/@kvesto/core)
(which includes the [`@kvesto/schema`](https://www.npmjs.com/package/@kvesto/schema) survey format) and ships a ready-made
`<script>` bundle.

## Install

```sh
npm install kvesto
```

```ts
import { mountSurvey } from "kvesto";
import "kvesto/styles.css"; // optional default theme

mountSurvey(document.getElementById("survey")!, {
  survey: mySurvey, // survey JSON object
  onComplete: ({ response }) => console.log(response.answers),
});
```

## Without a build step

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/kvesto@0.1/styles.css" />
<div id="survey"></div>
<script src="https://cdn.jsdelivr.net/npm/kvesto@0.1/dist/kvesto.min.js"></script>
<script>
  Kvesto.mountSurvey(document.getElementById("survey"), {
    survey: { schemaVersion: 1, id: "hello", title: "Hello", pages: [{ id: "p1", elements: [
      { id: "name", type: "text", title: "Your name", required: true }
    ] }] },
    onComplete: ({ response }) => console.log(response.answers),
  });
</script>
```

The bundle exposes the whole core API as `window.Kvesto`, including the storage adapters
(`memoryStorage`, `localStorageStorage`, `httpStorage`).

## Related packages

| Package | |
| --- | --- |
| [`@kvesto/core`](https://www.npmjs.com/package/@kvesto/core) | The survey runtime, renderer and storage adapters (what this package re-exports) |
| [`@kvesto/schema`](https://www.npmjs.com/package/@kvesto/schema) | The versioned survey JSON format as Zod schemas |
| [`@kvesto/server`](https://www.npmjs.com/package/@kvesto/server) | Optional REST API (Hono + Drizzle, SQLite by default) with OpenAPI docs |

Full documentation: https://github.com/pavlovt/kvesto

## License

MIT
