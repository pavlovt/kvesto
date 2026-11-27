<script lang="ts" module>
  import type { SurveyStorage } from "@kvesto/core";

  export interface SurveyListProps {
    /** Where the surveys come from. Needs `listSurveys`. */
    storage: Pick<SurveyStorage, "listSurveys">;
    /** Link target for a survey. Without it, titles are buttons that call `onselect`. */
    href?: (surveyId: string) => string;
    /** Called when a survey is picked (when `href` is not set). */
    onselect?: (surveyId: string) => void;
    /** Shown when there are no surveys. */
    emptyText?: string;
  }
</script>

<script lang="ts">
  import type { SurveySummary } from "@kvesto/core";

  let { storage, href, onselect, emptyText = "No surveys yet." }: SurveyListProps = $props();

  let surveys = $state<SurveySummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!storage.listSurveys) {
      error = "This storage can't list surveys.";
      loading = false;
      return;
    }
    loading = true;
    storage
      .listSurveys()
      .then((items) => {
        surveys = items;
        error = null;
      })
      .catch((e: Error) => (error = e.message))
      .finally(() => (loading = false));
  });
</script>

<template lang="braceml">
  if loading {
    p.kv-dash-muted 'Loading…'
  } else if error {
    p.kv-dash-error 'Could not load surveys: {error}'
  } else {
    table.kv-dash-list {
      thead > tr {
        th 'Survey'
        th.kv-dash-num 'Responses'
      }
      tbody {
        each surveys as survey (survey.id) {
          tr {
            td {
              if href {
                a href={href(survey.id)} '{survey.title}'
              } else {
                button.kv-dash-link type=button onclick={() => onselect?.(survey.id)} '{survey.title}'
              }
            }
            td.kv-dash-num '{survey.responseCount ?? 0}'
          }
        } else {
          tr > td colspan=2 '{emptyText}'
        }
      }
    }
  }
</template>

<style>
  .kv-dash-list { border-collapse: collapse; background: var(--kv-ui-surface, white); min-width: 24rem; }
  .kv-dash-list th, .kv-dash-list td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--kv-ui-border, #e5e7eb); }
  .kv-dash-list .kv-dash-num { text-align: right; font-variant-numeric: tabular-nums; }
  .kv-dash-link { font: inherit; color: var(--kv-ui-accent, #2563eb); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
  .kv-dash-muted { color: var(--kv-ui-muted, #6b7280); font-size: 0.9rem; }
  .kv-dash-error { color: var(--kv-ui-danger, #b91c1c); white-space: pre-wrap; }
</style>
