<script lang="ts">
  import { page } from "$app/state";
  import { SurveyResults } from "@kvesto/dashboard";
  import { storage } from "$lib/storage";
</script>

<template lang="braceml">
  p > a href="/" '← All surveys'
  SurveyResults storage={storage} surveyId={page.params.id!}
</template>
