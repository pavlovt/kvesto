<script lang="ts">
  import { SurveyList } from "@kvesto/dashboard";
  import { storage } from "$lib/storage";
</script>

<template lang="braceml">
  h1 'Surveys'
  SurveyList storage={storage} href={(id) => `/surveys/${id}`} emptyText="No surveys yet. Create one in the editor."
</template>
