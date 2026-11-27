<script lang="ts" module>
  import type { Survey, SurveyInput, SurveyStorage } from "@kvesto/core";

  export interface SurveyEditorProps {
    /** Survey to start from. Defaults to a small example survey. */
    survey?: SurveyInput;
    /** Where Save writes the survey. Without it the Save button is hidden; use `onchange` instead. */
    storage?: Pick<SurveyStorage, "saveSurvey">;
    /** Called with every valid edit. */
    onchange?: (survey: Survey) => void;
    /** Called after a successful save. */
    onsave?: (survey: Survey) => void;
    /** Show the live preview next to the JSON. Default true. */
    preview?: boolean;
  }
</script>

<script lang="ts">
  import { SurveySchema } from "@kvesto/core";
  import SurveyPreview from "./SurveyPreview.svelte";
  import { starterSurvey } from "./starter.js";
  import { SurveyDocument } from "./doc/document.js";
  import { PALETTE, newElement, type PaletteKind } from "./doc/factory.js";

  let { survey = starterSurvey, storage, onchange, onsave, preview = true }: SurveyEditorProps = $props();

  // The `survey` prop is only the starting point; edits live in the document.
  // svelte-ignore state_referenced_locally
  const doc = new SurveyDocument(survey);
  let docState = $state(doc.state);
  let source = $state(JSON.stringify(doc.survey, null, 2));
  /** JSON syntax error in the source view, while it can't be parsed. */
  let sourceError = $state<string | null>(null);
  let status = $state("");
  let editingSource = false;

  doc.subscribe((s) => {
    docState = s;
    if (!editingSource) {
      source = JSON.stringify(s.survey, null, 2);
      sourceError = null;
    }
  });

  const parsed = $derived.by(() => {
    const result = SurveySchema.safeParse(docState.survey);
    if (result.success) return { survey: result.data, error: null };
    const error = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    return { survey: null, error };
  });

  $effect(() => {
    if (parsed.survey) onchange?.(parsed.survey);
  });

  function onSourceInput(event: Event) {
    source = (event.currentTarget as HTMLTextAreaElement).value;
    let json: SurveyInput;
    try {
      json = JSON.parse(source);
    } catch (e) {
      sourceError = (e as Error).message;
      return;
    }
    sourceError = null;
    editingSource = true;
    try {
      doc.replace(json, { mergeKey: "source" });
    } finally {
      editingSource = false;
    }
  }

  function add(kind: PaletteKind) {
    if (sourceError) {
      status = "Fix the JSON before adding.";
      return;
    }
    doc.addElement(newElement(kind, doc.survey));
  }

  function onKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" && event.key.toLowerCase() !== "y") return;
    // Text fields keep their own undo.
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
    const redo = event.key.toLowerCase() === "y" || event.shiftKey;
    if (redo) doc.redo();
    else doc.undo();
  }

  async function save() {
    if (!parsed.survey || !storage) return;
    try {
      const saved = await storage.saveSurvey(parsed.survey);
      status = `Saved "${saved.title}" at ${new Date().toLocaleTimeString()}.`;
      onsave?.(saved);
    } catch (e) {
      status = `Save failed: ${(e as Error).message}`;
    }
  }
</script>

<template lang="braceml">
  /* svelte-ignore a11y_no_static_element_interactions */
  .kv-editor class:kv-editor--single={!preview} onkeydown={onKeydown} {
    section.kv-editor-pane {
      .kv-editor-toolbar {
        button.kv-editor-undo(
          type=button
          onclick={() => doc.undo()}
          disabled={!docState.canUndo}
          title={docState.undoLabel ? `Undo ${docState.undoLabel}` : "Undo"}
        ) 'Undo'
        button.kv-editor-redo(
          type=button
          onclick={() => doc.redo()}
          disabled={!docState.canRedo}
          title={docState.redoLabel ? `Redo ${docState.redoLabel}` : "Redo"}
        ) 'Redo'
        span.kv-editor-muted 'Add:'
        each PALETTE as item (item.kind) {
          button type=button onclick={() => add(item.kind)} '{item.label}'
        }
        if storage {
          button.kv-editor-primary type=button onclick={save} disabled={!parsed.survey} 'Save'
        }
      }
      textarea.kv-editor-json value={source} oninput={onSourceInput} spellcheck=false aria-label="Survey JSON"
      if sourceError {
        pre.kv-editor-error '{sourceError}'
      } else if parsed.error {
        pre.kv-editor-error '{parsed.error}'
      }
      if status {
        p.kv-editor-muted '{status}'
      }
    }
    if preview {
      section.kv-editor-pane {
        h2 'Live preview'
        if parsed.survey {
          SurveyPreview survey={parsed.survey}
        } else {
          p.kv-editor-muted 'The preview appears when the survey is valid.'
        }
      }
    }
  }
</template>

<style>
  .kv-editor { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
  .kv-editor--single { grid-template-columns: 1fr; }
  @media (max-width: 900px) { .kv-editor { grid-template-columns: 1fr; } }
  .kv-editor-pane { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1rem; min-width: 0; }
  .kv-editor-pane h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }
  .kv-editor-toolbar { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.75rem; }
  .kv-editor-toolbar button { font: inherit; font-size: 0.85rem; padding: 0.3rem 0.6rem; cursor: pointer; }
  .kv-editor-toolbar .kv-editor-primary { margin-left: auto; background: #2563eb; color: white; border: 0; border-radius: 0.375rem; }
  .kv-editor-json { width: 100%; box-sizing: border-box; min-height: 60vh; font-family: ui-monospace, monospace; font-size: 0.85rem; }
  .kv-editor-muted { color: #6b7280; font-size: 0.9rem; }
  .kv-editor-error { color: #b91c1c; white-space: pre-wrap; overflow: auto; }
</style>
