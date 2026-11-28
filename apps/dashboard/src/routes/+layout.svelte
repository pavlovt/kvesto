<script lang="ts">
  import "../app.css";
  import { storageLabel } from "$lib/storage";

  let { children } = $props();
</script>

<template lang="braceml">
  svelte:head > title 'Kvesto Dashboard'
  header class="flex items-baseline gap-4 border-b border-shell-line bg-shell-bar px-5 py-3" {
    a href="/" class="text-inherit no-underline" > strong 'Kvesto Dashboard'
    span class="text-[0.9rem] text-shell-muted" 'Reading from {storageLabel}'
  }
  main class="p-5" {
    @render children()
  }
</template>
