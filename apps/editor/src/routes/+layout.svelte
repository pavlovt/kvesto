<script lang="ts">
  import "@kvesto/core/styles.css";
  import "../app.css";
  import { storageLabel } from "$lib/storage";

  let { children } = $props();
</script>

<template lang="braceml">
  svelte:head > title 'Kvesto Editor'
  header class="flex items-baseline gap-4 border-b border-shell-line bg-shell-bar px-5 py-3" {
    strong 'Kvesto Editor'
    span class="text-[0.9rem] text-shell-muted" 'Saving to {storageLabel}'
  }
  main class="p-5" {
    @render children()
  }
</template>
