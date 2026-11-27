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
  import { allQuestions, SurveySchema, walkElements, type QuestionType } from "@kvesto/core";
  import SurveyPreview from "./SurveyPreview.svelte";
  import { starterSurvey } from "./starter.js";

  let { survey = starterSurvey, storage, onchange, onsave, preview = true }: SurveyEditorProps = $props();

  const questionTypes: QuestionType[] = [
    "text",
    "comment",
    "single-choice",
    "multiple-choice",
    "dropdown",
    "rating",
    "boolean",
    "matrix",
    "ranking",
    "file",
  ];

  // The `survey` prop is only the starting point; edits live in `source`.
  // svelte-ignore state_referenced_locally
  let source = $state(JSON.stringify(survey, null, 2));
  let status = $state("");

  const parsed = $derived.by(() => {
    try {
      const result = SurveySchema.safeParse(JSON.parse(source));
      if (result.success) return { survey: result.data, error: null };
      const error = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
      return { survey: null, error };
    } catch (e) {
      return { survey: null, error: (e as Error).message };
    }
  });

  $effect(() => {
    if (parsed.survey) onchange?.(parsed.survey);
  });

  function addQuestion(type: QuestionType) {
    let doc: SurveyInput;
    try {
      doc = JSON.parse(source);
    } catch {
      status = "Fix the JSON before adding questions.";
      return;
    }
    const page = doc.pages.at(-1);
    if (!page) return;
    const n = allQuestions(doc).length + 1;
    const base = { id: `q${n}`, title: `Question ${n}` };
    const choices = [
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B" },
    ];
    page.elements.push(
      type === "single-choice" || type === "multiple-choice" || type === "dropdown" || type === "ranking"
        ? { ...base, type, choices }
        : type === "rating"
          ? { ...base, type, min: 1, max: 5 }
          : type === "matrix"
            ? {
                ...base,
                type,
                rows: [
                  { value: "row1", label: "Statement 1" },
                  { value: "row2", label: "Statement 2" },
                ],
                columns: [
                  { value: "disagree", label: "Disagree" },
                  { value: "neutral", label: "Neutral" },
                  { value: "agree", label: "Agree" },
                ],
              }
            : type === "file"
              ? { ...base, type, maxFiles: 1, maxSize: 5 * 1024 * 1024 }
              : { ...base, type },
    );
    source = JSON.stringify(doc, null, 2);
  }

  function addPanel() {
    let doc: SurveyInput;
    try {
      doc = JSON.parse(source);
    } catch {
      status = "Fix the JSON before adding a panel.";
      return;
    }
    const page = doc.pages.at(-1);
    if (!page) return;
    const ids = new Set<string>();
    walkElements(doc, (el) => void ids.add(el.id));
    let n = 1;
    while (ids.has(`panel${n}`)) n++;
    page.elements.push({ id: `panel${n}`, type: "panel", title: `Group ${n}`, elements: [] });
    source = JSON.stringify(doc, null, 2);
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
  .kv-editor class:kv-editor--single={!preview} {
    section.kv-editor-pane {
      .kv-editor-toolbar {
        span.kv-editor-muted 'Add question:'
        each questionTypes as type {
          button type=button onclick={() => addQuestion(type)} '{type}'
        }
        button type=button onclick={addPanel} 'panel'

        if storage {
          button.kv-editor-primary type=button onclick={save} disabled={!parsed.survey} 'Save'
        }
      }
      textarea.kv-editor-json bind:value={source} spellcheck=false aria-label="Survey JSON"
      if parsed.error {
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
          p.kv-editor-muted 'The preview appears when the JSON is valid.'
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
