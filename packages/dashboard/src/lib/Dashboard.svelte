<script lang="ts" module>
  import type { SurveyStorage } from "@kvesto/core";

  export interface DashboardProps {
    /** Needs `listSurveys`, `loadSurvey` and `listResponses` (all bundled adapters have them). */
    storage: Pick<SurveyStorage, "listSurveys" | "loadSurvey" | "listResponses">;
    /** Open this survey's results first instead of the list. */
    surveyId?: string;
    /** Show survey texts in this locale. Default: each survey's default locale. */
    locale?: string;
  }
</script>

<script lang="ts">
  import SurveyList from "./SurveyList.svelte";
  import SurveyResults from "./SurveyResults.svelte";

  let { storage, surveyId, locale }: DashboardProps = $props();

  // svelte-ignore state_referenced_locally
  let selected = $state<string | null>(surveyId ?? null);
</script>

<template lang="braceml">
  .kv-dashboard {
    if selected {
      p > button.kv-dash-back type=button onclick={() => (selected = null)} '← All surveys'
      SurveyResults storage={storage} surveyId={selected} locale={locale}
    } else {
      h1 'Surveys'
      SurveyList storage={storage} onselect={(id) => (selected = id)}
    }
  }
</template>

<style>
  .kv-dashboard h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
  .kv-dash-back { font: inherit; color: #2563eb; background: none; border: 0; padding: 0; cursor: pointer; }
</style>
