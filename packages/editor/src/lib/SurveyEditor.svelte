<script lang="ts" module>
  import type { Survey, SurveyInput, SurveyStorage, TranslateFn } from "@kvesto/core";

  export interface SurveyEditorProps {
    /** Survey to start from. Defaults to a small example survey. */
    survey?: SurveyInput;
    /** Where Save writes the survey. Without it the Save button is hidden; use `onchange` instead. */
    storage?: Pick<SurveyStorage, "saveSurvey">;
    /** Called with every valid edit. */
    onchange?: (survey: Survey) => void;
    /** Called after a successful save. */
    onsave?: (survey: Survey) => void;
    /** Show the live preview. Default true. */
    preview?: boolean;
    /** The view to open with: the visual designer, the translations or the JSON source. Default "design". */
    view?: "design" | "theme" | "translations" | "json";
    /**
     * Machine translation for the Translations tab, e.g. a call to an AI model:
     * gets texts by key and returns translations by key. Drafts are marked for
     * review. Without it the "Translate with AI" button is hidden.
     */
    translate?: TranslateFn;
    /** The editor's own look: "light" (default), "dark", or "auto" to follow the device. A toolbar menu changes it. */
    theme?: "light" | "dark" | "auto";
    /** Where the Kvesto server is reachable, e.g. "https://example.com/api". Shows link and embed snippets on the Theme tab. */
    publicUrl?: string;
  }
</script>

<script lang="ts">
  import { SurveySchema } from "@kvesto/core";
  import SurveyPreview from "./SurveyPreview.svelte";
  import { starterSurvey } from "./starter.js";
  import { SurveyDocument } from "./doc/document.js";
  import { newElement, palette, type PaletteKind } from "./doc/factory.js";
  import Outline from "./panels/Outline.svelte";
  import PropertyPanel from "./panels/PropertyPanel.svelte";
  import TranslationPanel from "./panels/TranslationPanel.svelte";
  import ThemePanel from "./panels/ThemePanel.svelte";
  import SharePanel from "./panels/SharePanel.svelte";
  import { OutlineDrag } from "./panels/drag.svelte.js";

  let { survey = starterSurvey, storage, onchange, onsave, preview = true, view = "design", translate, theme = "light", publicUrl }: SurveyEditorProps =
    $props();
  // svelte-ignore state_referenced_locally
  let uiTheme = $state(theme);
  // svelte-ignore state_referenced_locally
  let tab = $state<"design" | "theme" | "translations" | "json">(view);

  // The `survey` prop is only the starting point; edits live in the document.
  // svelte-ignore state_referenced_locally
  const doc = new SurveyDocument(survey);
  let docState = $state(doc.state);
  const drag = new OutlineDrag(doc);
  $effect(() => () => drag.destroy());
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

  // The preview's layout starts from the survey's own setting.
  let previewByQuestion = $state(startsByQuestion());
  function startsByQuestion() {
    return (survey as { settings?: { layout?: string } } | undefined)?.settings?.layout === "question";
  }
  // Read once: custom question types are registered before the editor is mounted.
  const paletteItems = palette();
  function add(kind: PaletteKind) {
    if (drag.consumeClick()) return;
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
  snippet toolbar() {
    .kv-editor-toolbar {
      .kv-editor-tabs role=tablist {
        button(
          type=button
          role=tab
          aria-selected={tab === "design"}
          class:kv-editor-tab-on={tab === "design"}
          onclick={() => (tab = "design")}
        ) 'Design'
        button(
          type=button
          role=tab
          aria-selected={tab === "json"}
          class:kv-editor-tab-on={tab === "json"}
          onclick={() => (tab = "json")}
        ) 'JSON'
        button(
          type=button
          role=tab
          aria-selected={tab === "translations"}
          class:kv-editor-tab-on={tab === "translations"}
          onclick={() => (tab = "translations")}
        ) 'Translations'
        button(
          type=button
          role=tab
          aria-selected={tab === "theme"}
          class:kv-editor-tab-on={tab === "theme"}
          onclick={() => (tab = "theme")}
        ) 'Theme'
      }
      select.kv-editor-ui-theme aria-label="Editor theme" value={uiTheme} onchange={(e) => (uiTheme = e.currentTarget.value as typeof uiTheme)} {
        option value="light" 'Light'
        option value="dark" 'Dark'
        option value="auto" 'Auto'
      }
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
      if storage {
        button.kv-editor-primary type=button onclick={save} disabled={!parsed.survey} 'Save'
      }
    }
    .kv-editor-palette {
      span.kv-editor-muted 'Add:'
      each paletteItems as item (item.kind) {
        button(
          type=button
          title={tab === "design" ? "Click to add, or drag into the outline" : "Click to add"}
          onpointerdown={(e) => tab === "design" && !sourceError && drag.press(e, drag.addSource(item.kind, item.label))}
          onclick={() => add(item.kind)}
        ) '{item.label}'
      }
    }
  }

  snippet problems() {
    if sourceError {
      pre.kv-editor-error '{sourceError}'
    } else if parsed.error {
      pre.kv-editor-error '{parsed.error}'
    }
    if status {
      p.kv-editor-muted '{status}'
    }
  }

  snippet livePreview() {
    if parsed.survey {
      label.kv-editor-layout {
        input type=checkbox checked={previewByQuestion} onchange={(e) => (previewByQuestion = e.currentTarget.checked)}
        span 'One question at a time'
      }
      SurveyPreview(
        survey={parsed.survey}
        selected={docState.selected}
        onselect={(id) => doc.select(id)}
        layout={previewByQuestion ? "question" : "page"}
      )
    } else {
      p.kv-editor-muted 'The preview appears when the survey is valid.'
    }
  }

  /* svelte-ignore a11y_no_static_element_interactions */
  .kv-editor class:kv-editor-dragging={drag.mode === "pointer"} data-kv-ui-theme={uiTheme} onkeydown={onKeydown} {
    @render toolbar()
    @render problems()
    if tab === "design" {
      .kv-editor-design class:kv-editor-design--no-preview={!preview} {
        section.kv-editor-pane.kv-editor-outline-pane {
          h2 'Outline'
          Outline doc={doc} docState={docState} drag={drag}
        }
        if preview {
          section.kv-editor-pane {
            h2 'Preview'
            @render livePreview()
          }
        }
        section.kv-editor-pane.kv-editor-props-pane {
          h2 'Properties'
          PropertyPanel doc={doc} docState={docState}
        }
      }
    } else if tab === "theme" {
      .kv-editor-design class:kv-editor-design--no-preview={!preview} {
        section.kv-editor-pane {
          h2 'Survey theme'
          ThemePanel doc={doc} docState={docState}
          if publicUrl {
            h2 'Share and embed'
            SharePanel surveyId={docState.survey.id} publicUrl={publicUrl}
          }
        }
        if preview {
          section.kv-editor-pane {
            h2 'Preview'
            @render livePreview()
          }
        }
      }
    } else if tab === "translations" {
      section.kv-editor-pane.kv-editor-translations {
        TranslationPanel doc={doc} docState={docState} translate={translate}
      }
    } else {
      .kv-editor-source class:kv-editor-source--single={!preview} {
        section.kv-editor-pane {
          textarea.kv-editor-json value={source} oninput={onSourceInput} spellcheck=false aria-label="Survey JSON"
        }
        if preview {
          section.kv-editor-pane {
            h2 'Live preview'
            @render livePreview()
          }
        }
      }
    }
    if drag.ghost && drag.source {
      .kv-editor-ghost aria-hidden=true style="left: {drag.ghost.x + 12}px; top: {drag.ghost.y + 8}px" '{drag.source.label}'
    }
  }
</template>

<style>
  .kv-editor { display: grid; gap: 0.75rem; }
  .kv-editor-design { display: grid; grid-template-columns: minmax(14rem, 1fr) minmax(0, 2fr) minmax(16rem, 1.2fr); gap: 1rem; align-items: start; }
  .kv-editor-design--no-preview { grid-template-columns: minmax(14rem, 1fr) minmax(16rem, 1.5fr); }
  .kv-editor-source { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .kv-editor-source--single { grid-template-columns: 1fr; }
  @media (max-width: 1100px) { .kv-editor-design { grid-template-columns: minmax(14rem, 1fr) minmax(16rem, 1.4fr); } }
  @media (max-width: 900px) { .kv-editor-design, .kv-editor-source { grid-template-columns: 1fr; } }
  .kv-editor-pane { background: var(--kv-ui-surface, white); border: 1px solid var(--kv-ui-border, #e5e7eb); border-radius: 0.5rem; padding: 1rem; min-width: 0; }
  .kv-editor-pane h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }
  .kv-editor-props-pane, .kv-editor-outline-pane { position: sticky; top: 0.5rem; max-height: calc(100vh - 1rem); overflow: auto; }
  .kv-editor-toolbar, .kv-editor-palette { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .kv-editor-toolbar button, .kv-editor-palette button { font: inherit; font-size: 0.85rem; padding: 0.3rem 0.6rem; cursor: pointer; }
  .kv-editor-tabs { display: flex; margin-right: 0.5rem; }
  .kv-editor-tabs button { border: 1px solid var(--kv-ui-border-strong, #d1d5db); background: var(--kv-ui-surface, white); }
  .kv-editor-tabs button:first-child { border-radius: 0.375rem 0 0 0.375rem; }
  .kv-editor-tabs button:last-child { border-radius: 0 0.375rem 0.375rem 0; border-left: 0; }
  .kv-editor-tabs .kv-editor-tab-on { background: var(--kv-ui-accent-soft, #eff6ff); border-color: var(--kv-ui-accent-line, #93c5fd); }
  .kv-editor-toolbar .kv-editor-primary { margin-left: auto; background: var(--kv-ui-accent, #2563eb); color: var(--kv-ui-on-accent, white); border: 0; border-radius: 0.375rem; }
  .kv-editor-json { width: 100%; box-sizing: border-box; min-height: 60vh; font-family: ui-monospace, monospace; font-size: 0.85rem; }
  .kv-editor-dragging, .kv-editor-dragging * { cursor: grabbing !important; user-select: none; }
  .kv-editor-palette button { touch-action: none; }
  .kv-editor-ghost { position: fixed; z-index: 1000; pointer-events: none; background: var(--kv-ui-text, #1f2937); color: var(--kv-ui-on-accent, white); font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 0.3rem; box-shadow: 0 2px 6px rgb(0 0 0 / 0.2); }
  .kv-editor-muted { color: var(--kv-ui-muted, #6b7280); font-size: 0.9rem; }
  .kv-editor-layout { display: flex; gap: 0.35rem; align-items: center; font-size: 0.85rem; margin-bottom: 0.5rem; }
  .kv-editor-error { color: var(--kv-ui-danger, #b91c1c); white-space: pre-wrap; overflow: auto; margin: 0; }
  /* Light by default (the colours above); dark when asked, or with "auto" when the device prefers it. */
  .kv-editor { background: var(--kv-ui-bg, transparent); color: var(--kv-ui-fg, inherit); color-scheme: var(--kv-ui-scheme, normal); }
  .kv-editor[data-kv-ui-theme="dark"] {
    --kv-ui-bg: #0f172a;
    --kv-ui-fg: #e5e7eb;
    --kv-ui-surface: #1e293b;
    --kv-ui-accent: #60a5fa;
    --kv-ui-on-accent: #0b1220;
    --kv-ui-accent-text: #93c5fd;
    --kv-ui-accent-soft: #1e3a5f;
    --kv-ui-accent-line: #3b82f6;
    --kv-ui-border: #334155;
    --kv-ui-border-strong: #475569;
    --kv-ui-text: #f1f5f9;
    --kv-ui-text-2: #cbd5e1;
    --kv-ui-muted: #94a3b8;
    --kv-ui-subtle: #64748b;
    --kv-ui-hover: #273449;
    --kv-ui-danger: #f87171;
    --kv-ui-danger-line: #b91c1c;
    --kv-ui-warn: #f59e0b;
    --kv-ui-warn-soft: #3b2f12;
    --kv-ui-review: #8b5cf6;
    --kv-ui-review-text: #c4b5fd;
    --kv-ui-scheme: dark;
  }
  @media (prefers-color-scheme: dark) {
    .kv-editor[data-kv-ui-theme="auto"] {
      --kv-ui-bg: #0f172a;
      --kv-ui-fg: #e5e7eb;
      --kv-ui-surface: #1e293b;
      --kv-ui-accent: #60a5fa;
      --kv-ui-on-accent: #0b1220;
      --kv-ui-accent-text: #93c5fd;
      --kv-ui-accent-soft: #1e3a5f;
      --kv-ui-accent-line: #3b82f6;
      --kv-ui-border: #334155;
      --kv-ui-border-strong: #475569;
      --kv-ui-text: #f1f5f9;
      --kv-ui-text-2: #cbd5e1;
      --kv-ui-muted: #94a3b8;
      --kv-ui-subtle: #64748b;
      --kv-ui-hover: #273449;
      --kv-ui-danger: #f87171;
      --kv-ui-danger-line: #b91c1c;
      --kv-ui-warn: #f59e0b;
      --kv-ui-warn-soft: #3b2f12;
      --kv-ui-review: #8b5cf6;
      --kv-ui-review-text: #c4b5fd;
      --kv-ui-scheme: dark;
    }
  }
</style>
