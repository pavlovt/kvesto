<script lang="ts">
  import "@kvesto/core/styles.css";
  import "../app.css";
  import { storageLabel } from "$lib/storage";

  let { children } = $props();
</script>

<template lang="braceml">
  svelte:head > title 'Kvesto Editor'
  header.topbar {
    strong 'Kvesto Editor'
    span.muted 'Saving to {storageLabel}'
  }
  main {
    @render children()
  }
</template>
