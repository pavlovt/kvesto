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
    /** The editor's own look: "light" (default), "dark", or "auto" to follow the device. A toolbar menu changes it, and the choice is remembered in this browser. */
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
  // The toolbar menu's choice is remembered in this browser; `theme` is the default until one is made.
  const themeKey = "kvesto-editor-theme";
  function savedTheme(): typeof theme | undefined {
    try {
      const value = localStorage.getItem(themeKey);
      return value === "light" || value === "dark" || value === "auto" ? value : undefined;
    } catch {
      return undefined; // no localStorage (server rendering, blocked storage)
    }
  }
  function setTheme(value: NonNullable<typeof theme>) {
    uiTheme = value;
    try {
      localStorage.setItem(themeKey, value);
    } catch {
      // not remembered, but the change still applies
    }
  }
  // svelte-ignore state_referenced_locally
  let uiTheme = $state(savedTheme() ?? theme);
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

  // Tailwind classes used more than once (prefixed `kv:`; see editor.css).
  const pane = "kv:bg-ui-surface kv:border kv:border-ui-border kv:rounded-lg kv:p-4 kv:min-w-0";
  const sidePane = `${pane} kv:sticky kv:top-2 kv:max-h-[calc(100vh-1rem)] kv:overflow-auto`;
  const heading = "kv:text-[1.05rem] kv:mt-0 kv:mx-0 kv:mb-3";
  const bar = "kv:flex kv:flex-wrap kv:gap-[0.4rem] kv:items-center";
  const barButton = "kv:font-inherit kv:text-[0.85rem] kv:py-[0.3rem] kv:px-[0.6rem] kv:cursor-pointer";
  const muted = "kv:text-ui-muted kv:text-[0.9rem]";
  const error = "kv:text-ui-danger kv:whitespace-pre-wrap kv:overflow-auto kv:m-0";
  const tabClass = (on: boolean) =>
    `${barButton} kv:border kv:first:rounded-[0.375rem_0_0_0.375rem] kv:last:rounded-[0_0.375rem_0.375rem_0] kv:last:[border-left:0] ` +
    (on ? "kv:bg-ui-accent-soft kv:border-ui-accent-line" : "kv:bg-ui-surface kv:border-ui-border-strong");
  const designCols = (withPreview: boolean) =>
    (withPreview
      ? "kv:grid-cols-[minmax(14rem,1fr)_minmax(0,2fr)_minmax(16rem,1.2fr)]"
      : "kv:grid-cols-[minmax(14rem,1fr)_minmax(16rem,1.5fr)]") +
    " kv:grid kv:gap-4 kv:[align-items:start] kv:narrow:grid-cols-[minmax(14rem,1fr)_minmax(16rem,1.4fr)] kv:narrower:grid-cols-[1fr]";
</script>

<template lang="braceml">
  snippet toolbar() {
    .kv-editor-toolbar class={bar} {
      .kv-editor-tabs class="kv:flex kv:mr-2" role=tablist {
        button(
          type=button
          role=tab
          aria-selected={tab === "design"}
          class={tabClass(tab === 'design')}
          class:kv-editor-tab-on={tab === "design"}
          onclick={() => (tab = "design")}
        ) 'Design'
        button(
          type=button
          role=tab
          aria-selected={tab === "json"}
          class={tabClass(tab === 'json')}
          class:kv-editor-tab-on={tab === "json"}
          onclick={() => (tab = "json")}
        ) 'JSON'
        button(
          type=button
          role=tab
          aria-selected={tab === "translations"}
          class={tabClass(tab === 'translations')}
          class:kv-editor-tab-on={tab === "translations"}
          onclick={() => (tab = "translations")}
        ) 'Translations'
        button(
          type=button
          role=tab
          aria-selected={tab === "theme"}
          class={tabClass(tab === 'theme')}
          class:kv-editor-tab-on={tab === "theme"}
          onclick={() => (tab = "theme")}
        ) 'Theme'
      }
      select.kv-editor-ui-theme aria-label="Editor theme" value={uiTheme} onchange={(e) => setTheme(e.currentTarget.value as typeof uiTheme)} {
        option value="light" 'Light'
        option value="dark" 'Dark'
        option value="auto" 'Auto'
      }
      button.kv-editor-undo(
        type=button
        class={barButton}
        onclick={() => doc.undo()}
        disabled={!docState.canUndo}
        title={docState.undoLabel ? `Undo ${docState.undoLabel}` : "Undo"}
      ) 'Undo'
      button.kv-editor-redo(
        type=button
        class={barButton}
        onclick={() => doc.redo()}
        disabled={!docState.canRedo}
        title={docState.redoLabel ? `Redo ${docState.redoLabel}` : "Redo"}
      ) 'Redo'
      if storage {
        button.kv-editor-primary(
          type=button
          class="{barButton} kv:ml-auto kv:bg-ui-accent kv:text-ui-on-accent kv:[border:0] kv:rounded-md"
          onclick={save}
          disabled={!parsed.survey}
        ) 'Save'
      }
    }
    .kv-editor-palette class={bar} {
      span.kv-editor-muted class={muted} 'Add:'
      each paletteItems as item (item.kind) {
        button(
          type=button
          class="{barButton} kv:touch-none"
          title={tab === "design" ? "Click to add, or drag into the outline" : "Click to add"}
          onpointerdown={(e) => tab === "design" && !sourceError && drag.press(e, drag.addSource(item.kind, item.label))}
          onclick={() => add(item.kind)}
        ) '{item.label}'
      }
    }
  }

  snippet problems() {
    if sourceError {
      pre.kv-editor-error class={error} '{sourceError}'
    } else if parsed.error {
      pre.kv-editor-error class={error} '{parsed.error}'
    }
    if status {
      p.kv-editor-muted class={muted} '{status}'
    }
  }

  snippet livePreview() {
    if parsed.survey {
      label.kv-editor-layout class="kv:flex kv:gap-[0.35rem] kv:items-center kv:text-[0.85rem] kv:mb-2" {
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
      p.kv-editor-muted class={muted} 'The preview appears when the survey is valid.'
    }
  }

  /* svelte-ignore a11y_no_static_element_interactions */
  .kv-editor(
    class="kv:grid kv:gap-3 kv:bg-ui-bg kv:text-ui-fg kv:[color-scheme:var(--kv-ui-scheme,only_light)] {drag.mode === 'pointer' ? 'kv:select-none kv:cursor-grabbing! kv:[&_*]:cursor-grabbing! kv:[&_*]:select-none' : ''}"
    class:kv-editor-dragging={drag.mode === "pointer"}
    data-kv-ui-theme={uiTheme}
    onkeydown={onKeydown}
  ) {
    @render toolbar()
    @render problems()
    if tab === "design" {
      .kv-editor-design class={designCols(preview)} class:kv-editor-design--no-preview={!preview} {
        section.kv-editor-pane.kv-editor-outline-pane class={sidePane} {
          h2 class={heading} 'Outline'
          Outline doc={doc} docState={docState} drag={drag}
        }
        if preview {
          section.kv-editor-pane class={pane} {
            h2 class={heading} 'Preview'
            @render livePreview()
          }
        }
        section.kv-editor-pane.kv-editor-props-pane class={sidePane} {
          h2 class={heading} 'Properties'
          PropertyPanel doc={doc} docState={docState}
        }
      }
    } else if tab === "theme" {
      .kv-editor-design class={designCols(preview)} class:kv-editor-design--no-preview={!preview} {
        section.kv-editor-pane class={pane} {
          h2 class={heading} 'Survey theme'
          ThemePanel doc={doc} docState={docState}
          if publicUrl {
            h2 class={heading} 'Share and embed'
            SharePanel surveyId={docState.survey.id} publicUrl={publicUrl}
          }
        }
        if preview {
          section.kv-editor-pane class={pane} {
            h2 class={heading} 'Preview'
            @render livePreview()
          }
        }
      }
    } else if tab === "translations" {
      section.kv-editor-pane.kv-editor-translations class={pane} {
        TranslationPanel doc={doc} docState={docState} translate={translate}
      }
    } else {
      .kv-editor-source(
        class="kv:grid kv:gap-4 kv:narrower:grid-cols-[1fr] {preview ? 'kv:grid-cols-[1fr_1fr]' : 'kv:grid-cols-[1fr]'}"
        class:kv-editor-source--single={!preview}
      ) {
        section.kv-editor-pane class={pane} {
          textarea.kv-editor-json(
            class="kv:w-full kv:box-border kv:min-h-[60vh] kv:[font-family:ui-monospace,monospace] kv:text-[0.85rem]"
            value={source}
            oninput={onSourceInput}
            spellcheck=false
            aria-label="Survey JSON"
          )
        }
        if preview {
          section.kv-editor-pane class={pane} {
            h2 class={heading} 'Live preview'
            @render livePreview()
          }
        }
      }
    }
    if drag.ghost && drag.source {
      .kv-editor-ghost(
        class="kv:fixed kv:z-[1000] kv:pointer-events-none kv:bg-ui-text kv:text-ui-on-accent kv:text-[0.8rem] kv:py-[0.2rem] kv:px-2 kv:rounded-[0.3rem] kv:[box-shadow:0_2px_6px_rgb(0_0_0/0.2)]"
        aria-hidden=true
        style="left: {drag.ghost.x + 12}px; top: {drag.ghost.y + 8}px"
      ) '{drag.source.label}'
    }
  }
</template>
