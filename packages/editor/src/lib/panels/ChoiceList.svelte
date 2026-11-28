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

  // Tailwind classes used more than once (prefixed `kv:`; see editor.css).
  const field = "kv:font-inherit kv:text-[0.85rem] kv:py-[0.2rem] kv:px-[0.35rem] kv:min-w-0";
  const rowButton = "kv:font-inherit kv:text-[0.8rem] kv:cursor-pointer";
</script>

<template lang="braceml">
  .kv-choices class="kv:grid kv:gap-[0.3rem]" {
    each items as item, i (i) {
      .kv-choice-row class="kv:grid kv:grid-cols-[1fr_6rem_auto_auto_auto] kv:gap-1" {
        input.kv-choice-label(
          class={field}
          value={textOf(item.label, defaultLocale, defaultLocale)}
          aria-label="{noun} {i + 1} label"
          oninput={(e) => edit(i, { label: (withText(item.label, defaultLocale, e.currentTarget.value, defaultLocale) ?? "") as string })}
        )
        input.kv-choice-value(
          class={field}
          value={item.value}
          aria-label="{noun} {i + 1} value"
          oninput={(e) => edit(i, { value: e.currentTarget.value })}
        )
        button type=button class={rowButton} title="Move up" aria-label="Move {noun} {i + 1} up" disabled={i === 0} onclick={() => move(i, -1)} '↑'
        button(
          type=button
          class={rowButton}
          title="Move down"
          aria-label="Move {noun} {i + 1} down"
          disabled={i === items.length - 1}
          onclick={() => move(i, 1)}
        ) '↓'
        button type=button class={rowButton} title="Remove" aria-label="Remove {noun} {i + 1}" disabled={items.length <= min} onclick={() => remove(i)} '×'
        if images {
          input.kv-choice-image(
            class="{field} kv:col-span-full"
            value={item.imageUrl ?? ""}
            placeholder="Image URL"
            aria-label="{noun} {i + 1} image URL"
            oninput={(e) => edit(i, { imageUrl: e.currentTarget.value })}
          )
        }
      }
    }
    button.kv-choice-add type=button class="{rowButton} kv:[justify-self:start]" onclick={add} 'Add {noun}'
  }
</template>
