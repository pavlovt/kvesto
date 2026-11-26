<script lang="ts">
  import "../app.css";
  import { storageLabel } from "$lib/storage";

  let { children } = $props();
</script>

<template lang="braceml">
  svelte:head > title 'Kvesto Dashboard'
  header.topbar {
    a.brand href="/" > strong 'Kvesto Dashboard'
    span.muted 'Reading from {storageLabel}'
  }
  main {
    @render children()
  }
</template>
