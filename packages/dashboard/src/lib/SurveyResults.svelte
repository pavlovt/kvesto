<script lang="ts" module>
  import type { Survey, SurveyResponse, SurveyStorage } from "@kvesto/core";

  export type SurveyResultsProps =
    | {
        /** Load the survey and its responses from storage. Needs `loadSurvey` and `listResponses`. */
        storage: Pick<SurveyStorage, "loadSurvey" | "listResponses">;
        surveyId: string;
        survey?: never;
        responses?: never;
      }
    | {
        /** Or pass the data directly. */
        survey: Survey;
        responses: SurveyResponse[];
        storage?: never;
        surveyId?: never;
      };
</script>

<script lang="ts">
  import { summarizeResponses, type QuestionSummary } from "@kvesto/core";

  let props: SurveyResultsProps = $props();

  let loaded = $state<{ survey: Survey; responses: SurveyResponse[] } | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  $effect(() => {
    const { storage, surveyId } = props;
    if (!storage || surveyId === undefined) return;
    if (!storage.listResponses) {
      error = "This storage can't list responses.";
      return;
    }
    loading = true;
    Promise.all([storage.loadSurvey(surveyId), storage.listResponses(surveyId)])
      .then(([s, r]) => {
        loaded = s ? { survey: s, responses: r } : null;
        error = s ? null : `Survey "${surveyId}" not found.`;
      })
      .catch((e: Error) => (error = e.message))
      .finally(() => (loading = false));
  });

  const survey = $derived(props.survey ?? loaded?.survey ?? null);
  const responses = $derived(props.responses ?? loaded?.responses ?? []);
  const summary = $derived<QuestionSummary[]>(survey ? summarizeResponses(survey, responses) : []);
  const pct = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);
  // Ranking bars: first place fills the bar, last place leaves it empty.
  const rankScore = (avg: number, n: number) => (n > 1 && avg > 0 ? Math.round(((n - avg) / (n - 1)) * 100) : 0);
</script>

<template lang="braceml">
  if loading {
    p.kv-dash-muted 'Loading…'
  } else if error {
    p.kv-dash-error '{error}'
  } else if survey {
    .kv-dash-results {
      h1 '{survey.title}'
      p.kv-dash-muted '{responses.length} responses'
      each summary as item (item.question.id) {
        section.kv-dash-card {
          h2 '{item.question.title}'
          p.kv-dash-muted '{item.answered} answered'
          if item.average !== undefined {
            p 'Average: {item.average.toFixed(1)}'
          }
          if item.counts {
            each item.counts as option (option.value) {
              .kv-dash-bar-row {
                span.kv-dash-bar-label '{option.label}'
                .kv-dash-bar > .kv-dash-bar-fill style="width: {pct(option.count, item.answered)}%"
                span.kv-dash-num '{option.count}'
              }
            }
          }
          if item.matrix {
            .kv-dash-matrix-scroll > table.kv-dash-matrix {
              thead > tr {
                th ''
                each item.question.type === "matrix" ? item.question.columns : [] as col (col.value) {
                  th.kv-dash-num '{col.label}'
                }
              }
              tbody {
                each item.matrix as row (row.value) {
                  tr {
                    th '{row.label}'
                    each row.counts as cell (cell.value) {
                      td.kv-dash-num.kv-dash-heat style="--share: {pct(cell.count, row.answered)}%" title="{pct(cell.count, row.answered)}%" '{cell.count}'
                    }
                  }
                }
              }
            }
          }
          if item.ranking {
            p.kv-dash-muted 'Average position, best first'
            each item.ranking as option (option.value) {
              .kv-dash-bar-row {
                span.kv-dash-bar-label '{option.label}'
                .kv-dash-bar > .kv-dash-bar-fill style="width: {rankScore(option.averageRank, item.ranking.length)}%"
                span.kv-dash-num title="Ranked first {option.firstPlace}×" '{option.averageRank ? option.averageRank.toFixed(1) : "–"}'
              }
            }
          }
          if item.files {
            p.kv-dash-muted '{item.fileCount} {item.fileCount === 1 ? "file" : "files"}, latest first'
            ul {
              each item.files as file {
                li > a href={file.url} download={file.name} target=_blank rel=noopener '{file.name}'
              }
            }
          }
          if item.samples {
            ul {
              each item.samples as sample {
                li '{sample}'
              }
            }
          }
        }
      }
    }
  }
</template>

<style>
  .kv-dash-results h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .kv-dash-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem; max-width: 48rem; }
  .kv-dash-card h2 { font-size: 1.05rem; margin: 0 0 0.25rem; }
  .kv-dash-num { text-align: right; font-variant-numeric: tabular-nums; }
  .kv-dash-bar-row { display: grid; grid-template-columns: 10rem 1fr 3rem; gap: 0.5rem; align-items: center; margin: 0.3rem 0; }
  .kv-dash-bar { background: #eef2ff; border-radius: 999px; height: 0.6rem; overflow: hidden; }
  .kv-dash-bar-fill { background: #2563eb; height: 100%; }
  .kv-dash-matrix-scroll { overflow-x: auto; }
  .kv-dash-matrix { border-collapse: collapse; }
  .kv-dash-matrix th, .kv-dash-matrix td { padding: 0.35rem 0.75rem; border-bottom: 1px solid #e5e7eb; }
  .kv-dash-matrix tbody th { text-align: left; font-weight: normal; }
  .kv-dash-heat { background: color-mix(in srgb, #2563eb calc(var(--share) * 0.5), transparent); }
  .kv-dash-muted { color: #6b7280; font-size: 0.9rem; }
  .kv-dash-error { color: #b91c1c; white-space: pre-wrap; }
</style>
