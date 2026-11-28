<script lang="ts">
  import { textOf, type ElementInput, type PanelInput } from "@kvesto/core";
  import { tick } from "svelte";
  import type { Container, DocumentState, SurveyDocument } from "../doc/document.js";
  import { containerKey, sameTarget } from "../doc/positions.js";
  import type { OutlineDrag } from "./drag.svelte.js";

  let { doc, docState: view, drag }: { doc: SurveyDocument; docState: DocumentState; drag: OutlineDrag } = $props();
  const uid = $props.id();
  let root = $state<HTMLElement>();
  $effect(() => {
    drag.root = root ?? null;
  });

  const label = (el: ElementInput) => ("title" in el && el.title ? textOf(el.title as string, defaultLocale, defaultLocale) || el.id : el.id);
  const defaultLocale = $derived(view.survey.defaultLocale ?? "en");
  const kind = (el: ElementInput) => (el.type === "panel" ? ((el as PanelInput).repeat ? "repeat" : "panel") : el.type);
  const children = (el: ElementInput) => (el as PanelInput).elements;
  const at = (container: Container, index: number) => sameTarget(drag.target, { container, index });

  function onSelect(id: string) {
    if (drag.consumeClick()) return;
    doc.select(view.selected === id ? null : id);
  }
  async function onHandleKey(event: KeyboardEvent, id: string) {
    const wasActive = drag.active;
    if (!drag.handleKey(event, id) || !wasActive || drag.active) return;
    // A drop can move the item to another list, which re-creates its row: keep focus on it.
    await tick();
    root?.querySelector<HTMLElement>(`[data-outline="${CSS.escape(id)}"] .kv-outline-handle`)?.focus();
  }

  // Tailwind classes used more than once (prefixed `kv:`; see editor.css).
  const srOnly =
    "kv:absolute kv:w-px kv:h-px kv:p-0 kv:-m-px kv:overflow-hidden kv:[clip:rect(0_0_0_0)] kv:whitespace-nowrap kv:[border:0]";
  const smallButton ="kv:font-inherit kv:text-[0.8rem] kv:py-[0.1rem] kv:px-[0.35rem] kv:cursor-pointer";
  const handle =
    "kv:font-inherit kv:text-[0.8rem] kv:py-[0.1rem] kv:px-[0.2rem] kv:cursor-pointer kv:touch-none kv:bg-transparent kv:[border:0] " +
    "kv:text-ui-subtle kv:hover:text-ui-accent kv:focus-visible:text-ui-accent kv:aria-pressed:text-ui-accent";
  const list = "kv:list-none kv:[margin:0.25rem_0_0] kv:pt-0 kv:pr-0 kv:pl-3 kv:grid kv:gap-[0.2rem]";
  const empty = (dropping: boolean) =>
    "kv:text-ui-subtle kv:italic kv:py-[0.2rem] kv:px-[0.35rem]" +
    (dropping ? " kv:[outline:2px_dashed_var(--kv-ui-accent,#2563eb)] kv:rounded-[0.3rem]" : "");
  const selectButton = (selected: boolean) =>
    "kv:flex-1 kv:flex kv:gap-[0.4rem] kv:items-baseline kv:text-left kv:border kv:rounded-[0.3rem] kv:py-[0.2rem] kv:px-[0.35rem] " +
    "kv:cursor-pointer kv:font-inherit kv:[font-size:inherit] kv:min-w-0 kv:touch-none " +
    (selected ? "kv:bg-ui-accent-soft kv:border-ui-accent-line" : "kv:bg-transparent kv:border-transparent kv:hover:bg-ui-hover");
</script>

<template lang="braceml">
  snippet node(el: ElementInput, container: Container, index: number, count: number) {
    li.kv-outline-item(
      class={index === count - 1 && at(container, count) ? 'kv:[box-shadow:0_2px_0_var(--kv-ui-accent,#2563eb)]' : ''}
      class:kv-outline-selected={view.selected === el.id}
      class:kv-outline-dragging={drag.source?.type === "move" && drag.source.id === el.id}
      class:kv-drop-before={at(container, index)}
      class:kv-drop-after={index === count - 1 && at(container, count)}
      data-outline={el.id}
      data-container={containerKey(container)}
      data-index={index}
      data-kind={el.type}
    ) {
      .kv-outline-row(
        class="kv:flex kv:items-center kv:gap-[0.15rem] {drag.source?.type === 'move' && drag.source.id === el.id ? 'kv:opacity-45' : ''} {at(container, index) ? 'kv:[box-shadow:0_-2px_0_var(--kv-ui-accent,#2563eb)]' : ''}"
      ) {
        button.kv-outline-handle(
          type=button
          class={handle}
          title="Drag to move"
          aria-label="Move {label(el)}"
          aria-describedby="{uid}-drag-help"
          aria-pressed={drag.mode === "keyboard" && drag.source?.type === "move" && drag.source.id === el.id}
          onpointerdown={(e) => drag.press(e, drag.moveSource(el.id))}
          onkeydown={(e) => onHandleKey(e, el.id)}
          onblur={() => drag.mode === "keyboard" && drag.cancel()}
        ) '⠿'
        button.kv-outline-select(
          type=button
          class={selectButton(view.selected === el.id)}
          aria-pressed={view.selected === el.id}
          onpointerdown={(e) => drag.press(e, drag.moveSource(el.id))}
          onclick={() => onSelect(el.id)}
        ) {
          span.kv-outline-kind class="kv:text-[0.7rem] kv:text-ui-muted kv:uppercase kv:tracking-[0.03em] kv:whitespace-nowrap" '{kind(el)}'
          span.kv-outline-label class="kv:truncate" '{label(el)}'
        }
        button type=button class={smallButton} title="Move up" aria-label="Move {label(el)} up" disabled={index === 0} onclick={() => doc.nudgeElement(el.id, -1)} '↑'
        button(
          type=button
          class={smallButton}
          title="Move down"
          aria-label="Move {label(el)} down"
          disabled={index === count - 1}
          onclick={() => doc.nudgeElement(el.id, 1)}
        ) '↓'
        button type=button class={smallButton} title="Duplicate" aria-label="Duplicate {label(el)}" onclick={() => doc.duplicateElement(el.id)} '⧉'
        button type=button class={smallButton} title="Delete" aria-label="Delete {label(el)}" onclick={() => doc.removeElement(el.id)} '×'
      }
      if el.type === "panel" {
        @const inner = children(el)
        ul.kv-outline-list.kv-outline-nested(
          class="{list} kv:pb-[0.35rem]"
          class:kv-drop-into={inner.length === 0 && at({ panel: el.id }, 0)}
          data-container={containerKey({ panel: el.id })}
          data-count={inner.length}
        ) {
          each inner as child, i (child.id) {
            @render node(child, { panel: el.id }, i, inner.length)
          }
          if inner.length === 0 {
            li.kv-outline-empty class={empty(at({ panel: el.id }, 0))} data-container={containerKey({ panel: el.id })} 'Empty panel: drop or add questions here'
          }
        }
      }
    }
  }

  nav.kv-outline class="kv:grid kv:gap-3 kv:[align-content:start] kv:text-[0.9rem]" aria-label="Survey outline" bind:this={root} {
    each view.survey.pages as page, pi (page.id) {
      section.kv-outline-page class="kv:pb-[0.4rem]" data-page={page.id} {
        .kv-outline-page-head class="kv:flex kv:items-center kv:gap-1" {
          strong class="kv:flex-1" '{page.title || page.id}'
          button type=button class={smallButton} title="Move page up" aria-label="Move page {page.id} up" disabled={pi === 0} onclick={() => doc.movePage(page.id, pi - 1)} '↑'
          button(
            type=button
            class={smallButton}
            title="Move page down"
            aria-label="Move page {page.id} down"
            disabled={pi === view.survey.pages.length - 1}
            onclick={() => doc.movePage(page.id, pi + 2)}
          ) '↓'
          button(
            type=button
            class={smallButton}
            title="Delete page"
            aria-label="Delete page {page.id}"
            disabled={view.survey.pages.length === 1}
            onclick={() => doc.removePage(page.id)}
          ) '×'
        }
        ul.kv-outline-list(
          class="{list} kv:pb-0"
          class:kv-drop-into={page.elements.length === 0 && at({ page: page.id }, 0)}
          data-container={containerKey({ page: page.id })}
          data-count={page.elements.length}
        ) {
          each page.elements as el, i (el.id) {
            @render node(el, { page: page.id }, i, page.elements.length)
          }
          if page.elements.length === 0 {
            li.kv-outline-empty class={empty(at({ page: page.id }, 0))} data-container={containerKey({ page: page.id })} 'Empty page'
          }
        }
      }
    }
    button.kv-outline-add-page(
      type=button
      class="kv:[justify-self:start] kv:font-inherit kv:text-[0.85rem] kv:cursor-pointer"
      onclick={() => doc.addPage()}
    ) 'Add page'
    p.kv-sr-only class={srOnly} id="{uid}-drag-help" 'Press Space to pick up, the arrow keys to move, Space to drop and Escape to cancel.'
    .kv-sr-only class={srOnly} role=status aria-live=assertive '{drag.announcement}'
  }
</template>
