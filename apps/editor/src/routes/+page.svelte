<script lang="ts">
  import { SurveySchema, type QuestionType, type SurveyInput } from "@kvesto/core";
  import SurveyPreview from "$lib/SurveyPreview.svelte";
  import { starterSurvey } from "$lib/starter";
  import { storage } from "$lib/storage";

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

  let source = $state(JSON.stringify(starterSurvey, null, 2));
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
    const n = doc.pages.reduce((sum, p) => sum + p.elements.length, 0) + 1;
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

  async function save() {
    if (!parsed.survey) return;
    try {
      await storage.saveSurvey(parsed.survey);
      status = `Saved "${parsed.survey.title}" at ${new Date().toLocaleTimeString()}.`;
    } catch (e) {
      status = `Save failed: ${(e as Error).message}`;
    }
  }
</script>

<template lang="braceml">
  .editor {
    section.pane {
      .toolbar {
        span.muted 'Add question:'
        each questionTypes as type {
          button type=button onclick={() => addQuestion(type)} '{type}'
        }
        button.primary type=button onclick={save} disabled={!parsed.survey} 'Save'
      }
      textarea.json bind:value={source} spellcheck=false aria-label="Survey JSON"
      if parsed.error {
        pre.error '{parsed.error}'
      }
      if status {
        p.muted '{status}'
      }
    }
    section.pane {
      h2 'Live preview'
      if parsed.survey {
        SurveyPreview survey={parsed.survey}
      } else {
        p.muted 'The preview appears when the JSON is valid.'
      }
    }
  }
</template>
