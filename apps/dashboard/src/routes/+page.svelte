<script lang="ts">
  import { onMount } from "svelte";
  import type { SurveySummary } from "@kvesto/core";
  import { storage } from "$lib/storage";

  let surveys = $state<SurveySummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      surveys = await storage.listSurveys();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });
</script>

<template lang="braceml">
  h1 'Surveys'
  if loading {
    p.muted 'Loading…'
  } else if error {
    p.error 'Could not load surveys: {error}'
  } else {
    table.grid {
      thead > tr {
        th 'Survey'
        th.num 'Responses'
      }
      tbody {
        each surveys as survey (survey.id) {
          tr {
            td > a href="/surveys/{survey.id}" '{survey.title}'
            td.num '{survey.responseCount ?? 0}'
          }
        } else {
          tr > td colspan=2 'No surveys yet. Create one in the editor.'
        }
      }
    }
  }
</template>
