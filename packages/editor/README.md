# @kvesto/editor

The visual survey editor of [Kvesto](https://github.com/pavlovt/kvesto), packaged for embedding in your own app:
a JSON editor with a question palette and a live preview rendered by the real Kvesto core.

```sh
npm install @kvesto/editor
```

## In a Svelte 5 app

```svelte
<script>
  import { SurveyEditor } from "@kvesto/editor";
  import { httpStorage } from "@kvesto/core";
  import "@kvesto/core/styles.css"; // theme for the live preview

  const storage = httpStorage({ baseUrl: "/api/kvesto" });
</script>

<SurveyEditor {storage} onsave={(survey) => console.log("saved", survey.id)} />
```

## In any other app (React, Vue, plain JS)

The `standalone` build has Svelte bundled in, so you don't need a Svelte compiler:

```ts
import { mountEditor } from "@kvesto/editor/standalone";
import { localStorageStorage } from "@kvesto/core";
import "@kvesto/core/styles.css";

const editor = mountEditor(document.getElementById("editor")!, {
  storage: localStorageStorage(),
  onchange: (survey) => console.log(survey),
});
// later: editor.destroy();
```

## Props

| Prop | Type | |
| --- | --- | --- |
| `survey` | `SurveyInput` | Survey to start from. Defaults to a small example (`starterSurvey`). |
| `storage` | `SurveyStorage` (needs `saveSurvey`) | Where **Save** writes. Without it there is no Save button. |
| `onchange` | `(survey) => void` | Called with every valid edit. |
| `onsave` | `(survey) => void` | Called after a successful save. |
| `preview` | `boolean` | Show the live preview. Default `true`. |

The component's own styles are scoped and use `kv-editor-*` class names.

## License

MIT
