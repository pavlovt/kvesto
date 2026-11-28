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
  .kv-share class="kv:grid kv:gap-2 kv:text-[0.9rem]" {
    p.kv-share-hint class="kv:m-0 kv:text-ui-muted" 'Copy one of these into your site. The survey has to be saved on the server first.'
    each snippets as s (s.label) {
      .kv-share-item class="kv:grid kv:gap-[0.2rem]" {
        .kv-share-head class="kv:flex kv:justify-between kv:items-center" {
          strong '{s.label}'
          button type=button class="kv:font-inherit kv:text-[0.8rem] kv:cursor-pointer" onclick={() => copy(s.label, s.code)} '{copied === s.label ? "Copied" : "Copy"}'
        }
        textarea.kv-share-code(
          class="kv:[font-family:ui-monospace,monospace] kv:text-[0.8rem] kv:w-full kv:box-border kv:resize-y"
          readonly
          rows={lines(s.code)}
          aria-label="{s.label} snippet"
          value={s.code}
        )
      }
    }
  }
</template>
