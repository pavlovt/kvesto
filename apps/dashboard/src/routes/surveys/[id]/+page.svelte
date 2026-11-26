<script lang="ts">
  import { page } from "$app/state";
  import { summarizeResponses, type QuestionSummary, type Survey, type SurveyResponse } from "@kvesto/core";
  import { storage } from "$lib/storage";

  let survey = $state<Survey | null>(null);
  let responses = $state<SurveyResponse[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  const summary = $derived<QuestionSummary[]>(survey ? summarizeResponses(survey, responses) : []);
  const pct = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);

  $effect(() => {
    const id = page.params.id!;
    loading = true;
    Promise.all([storage.loadSurvey(id), storage.listResponses(id)])
      .then(([s, r]) => {
        survey = s;
        responses = r;
        error = s ? null : `Survey "${id}" not found.`;
      })
      .catch((e: Error) => (error = e.message))
      .finally(() => (loading = false));
  });
</script>

<template lang="braceml">
  p > a href="/" '← All surveys'
  if loading {
    p.muted 'Loading…'
  } else if error {
    p.error '{error}'
  } else if survey {
    h1 '{survey.title}'
    p.muted '{responses.length} responses'
    each summary as item (item.question.id) {
      section.card {
        h2 '{item.question.title}'
        p.muted '{item.answered} answered'
        if item.average !== undefined {
          p 'Average: {item.average.toFixed(1)}'
        }
        if item.counts {
          each item.counts as option (option.value) {
            .bar-row {
              span.bar-label '{option.label}'
              .bar > .bar-fill style="width: {pct(option.count, item.answered)}%"
              span.num '{option.count}'
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
</template>
