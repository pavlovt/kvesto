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

  // Tailwind classes (prefixed `kv:`; see dashboard.css).
  const cell = "kv:py-2 kv:px-3 kv:border-b kv:border-b-ui-border";
</script>

<template lang="braceml">
  if loading {
    p.kv-dash-muted class="kv:text-ui-muted kv:text-[0.9rem]" 'Loading…'
  } else if error {
    p.kv-dash-error class="kv:text-ui-danger kv:whitespace-pre-wrap" 'Could not load surveys: {error}'
  } else {
    table.kv-dash-list class="kv:border-collapse kv:bg-ui-surface kv:min-w-[24rem]" {
      thead > tr {
        th class="{cell} kv:text-left" 'Survey'
        th.kv-dash-num class="{cell} kv:text-right kv:tabular-nums" 'Responses'
      }
      tbody {
        each surveys as survey (survey.id) {
          tr {
            td class="{cell} kv:text-left" {
              if href {
                a href={href(survey.id)} '{survey.title}'
              } else {
                button.kv-dash-link(
                  type=button
                  class="kv:font-inherit kv:[font-size:inherit] kv:text-ui-accent kv:bg-transparent kv:[border:0] kv:p-0 kv:cursor-pointer kv:underline"
                  onclick={() => onselect?.(survey.id)}
                ) '{survey.title}'
              }
            }
            td.kv-dash-num class="{cell} kv:text-right kv:tabular-nums" '{survey.responseCount ?? 0}'
          }
        } else {
          tr > td class="{cell} kv:text-left" colspan=2 '{emptyText}'
        }
      }
    }
  }
</template>
