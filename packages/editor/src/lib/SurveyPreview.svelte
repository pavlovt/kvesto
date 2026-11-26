<script lang="ts">
  import { mountSurvey, type Survey } from "@kvesto/core";

  let { survey }: { survey: Survey } = $props();
  let target = $state<HTMLDivElement>();
  let result = $state<string | null>(null);

  // The preview is the real core renderer, not a Svelte re-implementation.
  $effect(() => {
    if (!target) return;
    result = null;
    const view = mountSurvey(target, {
      survey,
      onComplete: ({ response }) => {
        result = JSON.stringify(response, null, 2);
      },
    });
    return () => view.destroy();
  });
</script>

<template lang="braceml">
  div bind:this={target}
  if result {
    h3 'Response (preview only, not saved)'
    pre.kv-preview-result '{result}'
  }
</template>

<style>
  .kv-preview-result { overflow: auto; }
</style>
