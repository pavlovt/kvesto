<script lang="ts">
  import { textOf, withText, type Choice } from "@kvesto/core";

  let {
    items,
    onchange,
    noun = "option",
    min = 1,
    images = false,
    defaultLocale = "en",
  }: {
    items: (Choice & { imageUrl?: string })[];
    onchange: (items: (Choice & { imageUrl?: string })[]) => void;
    /** Also edit an image URL per entry (image choices). */
    images?: boolean;
    /** Labels may be translated: the field edits this locale's text and keeps the others. */
    defaultLocale?: string;
    /** What one entry is called, for button labels ("option", "row", "column"). */
    noun?: string;
    /** Fewest entries; remove buttons are disabled below it. */
    min?: number;
  } = $props();

  const edit = (i: number, patch: Partial<Choice & { imageUrl: string }>) => onchange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onchange(items.filter((_, j) => j !== i));
  const move = (i: number, d: number) => {
    const next = [...items];
    const [c] = next.splice(i, 1);
    next.splice(i + d, 0, c!);
    onchange(next);
  };
  function add() {
    const values = new Set(items.map((c) => c.value));
    let n = items.length + 1;
    while (values.has(`${noun}${n}`)) n++;
    const label = `${noun[0]!.toUpperCase()}${noun.slice(1)} ${n}`;
    onchange([...items, { value: `${noun}${n}`, label, ...(images ? { imageUrl: "https://example.com/image.png" } : {}) }]);
  }
</script>

<template lang="braceml">
  .kv-choices {
    each items as item, i (i) {
      .kv-choice-row {
        input.kv-choice-label(
          value={textOf(item.label, defaultLocale, defaultLocale)}
          aria-label="{noun} {i + 1} label"
          oninput={(e) => edit(i, { label: (withText(item.label, defaultLocale, e.currentTarget.value, defaultLocale) ?? "") as string })}
        )
        input.kv-choice-value(
          value={item.value}
          aria-label="{noun} {i + 1} value"
          oninput={(e) => edit(i, { value: e.currentTarget.value })}
        )
        button type=button title="Move up" aria-label="Move {noun} {i + 1} up" disabled={i === 0} onclick={() => move(i, -1)} '↑'
        button(
          type=button
          title="Move down"
          aria-label="Move {noun} {i + 1} down"
          disabled={i === items.length - 1}
          onclick={() => move(i, 1)}
        ) '↓'
        button type=button title="Remove" aria-label="Remove {noun} {i + 1}" disabled={items.length <= min} onclick={() => remove(i)} '×'
        if images {
          input.kv-choice-image(
            value={item.imageUrl ?? ""}
            placeholder="Image URL"
            aria-label="{noun} {i + 1} image URL"
            oninput={(e) => edit(i, { imageUrl: e.currentTarget.value })}
          )
        }
      }
    }
    button.kv-choice-add type=button onclick={add} 'Add {noun}'
  }
</template>

<style>
  .kv-choices { display: grid; gap: 0.3rem; }
  .kv-choice-row { display: grid; grid-template-columns: 1fr 6rem auto auto auto; gap: 0.25rem; }
  .kv-choice-row input { font: inherit; font-size: 0.85rem; padding: 0.2rem 0.35rem; min-width: 0; }
  .kv-choice-value { font-family: ui-monospace, monospace; }
  .kv-choice-image { grid-column: 1 / -1; }
  .kv-choice-row button, .kv-choice-add { font: inherit; font-size: 0.8rem; cursor: pointer; }
  .kv-choice-add { justify-self: start; }
</style>
