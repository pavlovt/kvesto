<script lang="ts">
  let { surveyId, publicUrl }: { surveyId: string; publicUrl: string } = $props();

  const base = $derived(publicUrl.replace(/\/+$/, ""));
  const link = $derived(`${base}/s/${encodeURIComponent(surveyId)}`);
  const snippets = $derived([
    { label: "Link", code: link },
    { label: "Inline", code: `<div data-kvesto-survey="${surveyId}"></div>\n<script src="${base}/s/embed.js" async><\/script>` },
    { label: "Popup button", code: `<div data-kvesto-survey="${surveyId}" data-mode="popup" data-label="Give feedback"></div>\n<script src="${base}/s/embed.js" async><\/script>` },
    { label: "Slide-in", code: `<div data-kvesto-survey="${surveyId}" data-mode="slide-in"></div>\n<script src="${base}/s/embed.js" async><\/script>` },
    { label: "iframe", code: `<iframe src="${link}" title="Survey" style="width:100%;height:600px;border:0"></iframe>` },
  ]);
  const lines = (code: string) => code.split("\n").length;
  let copied = $state("");
  async function copy(label: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      copied = label;
    } catch {
      copied = "";
    }
  }
</script>

<template lang="braceml">
  .kv-share {
    p.kv-share-hint 'Copy one of these into your site. The survey has to be saved on the server first.'
    each snippets as s (s.label) {
      .kv-share-item {
        .kv-share-head {
          strong '{s.label}'
          button type=button onclick={() => copy(s.label, s.code)} '{copied === s.label ? "Copied" : "Copy"}'
        }
        textarea.kv-share-code readonly rows={lines(s.code)} aria-label="{s.label} snippet" value={s.code}
      }
    }
  }
</template>

<style>
  .kv-share { display: grid; gap: 0.5rem; font-size: 0.9rem; }
  .kv-share-hint { margin: 0; color: var(--kv-ui-muted, #6b7280); }
  .kv-share-item { display: grid; gap: 0.2rem; }
  .kv-share-head { display: flex; justify-content: space-between; align-items: center; }
  .kv-share-head button { font: inherit; font-size: 0.8rem; cursor: pointer; }
  .kv-share-code { font-family: ui-monospace, monospace; font-size: 0.8rem; width: 100%; box-sizing: border-box; resize: vertical; }
</style>
