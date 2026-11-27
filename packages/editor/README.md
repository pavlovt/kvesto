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
| `view` | `"design" \| "json"` | Which tab opens first. Default `"design"`. |

The component's own styles are scoped and use `kv-editor-*` class names.

## Design and JSON views

The **Design** tab has three columns: an outline of pages, panels and questions (with buttons to move, duplicate and
delete), the live preview (click a question or panel to select it), and a property panel for the selection. The
property panel covers titles, descriptions, required, the type-specific settings, choice, row and column lists, grid
columns, repeat settings and validation rules. With nothing selected it edits the survey and page titles. The palette
adds a question after the selection, or inside the selected panel.

Drag outline items by their handle (or their name) to reorder them within and across pages and panels, or drag a
palette button into the outline to add a question at that spot. A line shows where it will land, and Escape cancels.
From the keyboard, focus an item's handle and press Space to pick it up, the arrow keys (or Home and End) to move it,
Space to drop and Escape to cancel; each step is announced to screen readers. Every drop is a single undo step.

Under **Logic**, the property panel builds `visibleIf` and `requiredIf` conditions (and `visibleIf` for every page
after the first) without writing JSON: pick a question, an operator and a value, combine rules into "all" or "any"
groups, and negate any rule or group. It only offers questions the condition is allowed to use (earlier ones, and
inside a repeating panel the same item's answers), shows the condition in plain words ("Shown when Role is
"Developer" and Age is at least 18"), and flags conditions that refer to a question they can't use.

The **JSON** tab edits the raw survey next to the
preview.

## Undo, redo and the document model

Every edit, including typing in the JSON view, is an undoable step: use the Undo and Redo buttons or Ctrl/Cmd+Z and
Ctrl/Cmd+Shift+Z (text fields keep their own undo). The model behind it, `SurveyDocument`, is plain TypeScript with no
DOM, so you can drive or test edits headlessly:

```ts
import { SurveyDocument, newElement } from "@kvesto/editor";

const doc = new SurveyDocument(survey);
const id = doc.addElement(newElement("rating", doc.survey), { container: { page: "p1" } });
doc.moveElement(id!, { panel: "details" }, 0);
doc.updateElement(id!, { title: "How likely?" }, { mergeKey: `${id}.title` }); // typing merges into one step
doc.undo();
doc.subscribe((state) => console.log(state.survey, state.canUndo, state.undoLabel));
```

## License

MIT
