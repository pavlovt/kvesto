<script lang="ts">
  import { untrack } from "svelte";
  import { mountSurvey, type Survey } from "@kvesto/core";

  let {
    survey,
    selected = null,
    onselect,
    layout,
  }: {
    survey: Survey;
    /** Preview a page at a time or one question at a time. Default: the survey's own setting. */
    layout?: "page" | "question";
    /** Id of the question or panel to highlight. */
    selected?: string | null;
    /** Called with the id of the question or panel the user clicks. Makes the preview a selection surface. */
    onselect?: (id: string) => void;
  } = $props();
  let target = $state<HTMLDivElement>();
  let result = $state<string | null>(null);
  let version = $state(0);

  // The preview is the real core renderer, not a Svelte re-implementation.
  $effect(() => {
    if (!target) return;
    result = null;
    const view = mountSurvey(target, {
      survey,
      ...(layout ? { layout } : {}),
      onComplete: ({ response }) => {
        result = JSON.stringify(response, null, 2);
      },
    });
    // Re-apply the highlight to the freshly rendered survey.
    untrack(() => version++);
    return () => view.destroy();
  });

  $effect(() => {
    void version;
    if (!target) return;
    for (const el of target.querySelectorAll(".kv-editor-selected")) el.classList.remove("kv-editor-selected");
    if (!selected) return;
    const id = CSS.escape(selected);
    target.querySelector(`[data-question="${id}"], [data-panel="${id}"]`)?.classList.add("kv-editor-selected");
  });

  function onclick(event: MouseEvent) {
    if (!onselect) return;
    const hit = (event.target as HTMLElement).closest<HTMLElement>("[data-question], [data-panel]");
    const id = hit?.dataset.question ?? hit?.dataset.panel;
    if (id) onselect(id);
  }
</script>

<template lang="braceml">
  /* svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions */
  .kv-preview class:kv-preview--selectable={Boolean(onselect)} bind:this={target} onclick={onclick}
  if result {
    h3 'Response (preview only, not saved)'
    pre.kv-preview-result class="kv:overflow-auto" '{result}'
  }
</template>
