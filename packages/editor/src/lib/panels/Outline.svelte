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
</script>

<template lang="braceml">
  snippet node(el: ElementInput, container: Container, index: number, count: number) {
    li.kv-outline-item(
      class:kv-outline-selected={view.selected === el.id}
      class:kv-outline-dragging={drag.source?.type === "move" && drag.source.id === el.id}
      class:kv-drop-before={at(container, index)}
      class:kv-drop-after={index === count - 1 && at(container, count)}
      data-outline={el.id}
      data-container={containerKey(container)}
      data-index={index}
      data-kind={el.type}
    ) {
      .kv-outline-row {
        button.kv-outline-handle(
          type=button
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
          aria-pressed={view.selected === el.id}
          onpointerdown={(e) => drag.press(e, drag.moveSource(el.id))}
          onclick={() => onSelect(el.id)}
        ) {
          span.kv-outline-kind '{kind(el)}'
          span.kv-outline-label '{label(el)}'
        }
        button type=button title="Move up" aria-label="Move {label(el)} up" disabled={index === 0} onclick={() => doc.nudgeElement(el.id, -1)} '↑'
        button(
          type=button
          title="Move down"
          aria-label="Move {label(el)} down"
          disabled={index === count - 1}
          onclick={() => doc.nudgeElement(el.id, 1)}
        ) '↓'
        button type=button title="Duplicate" aria-label="Duplicate {label(el)}" onclick={() => doc.duplicateElement(el.id)} '⧉'
        button type=button title="Delete" aria-label="Delete {label(el)}" onclick={() => doc.removeElement(el.id)} '×'
      }
      if el.type === "panel" {
        @const inner = children(el)
        ul.kv-outline-list.kv-outline-nested(
          class:kv-drop-into={inner.length === 0 && at({ panel: el.id }, 0)}
          data-container={containerKey({ panel: el.id })}
          data-count={inner.length}
        ) {
          each inner as child, i (child.id) {
            @render node(child, { panel: el.id }, i, inner.length)
          }
          if inner.length === 0 {
            li.kv-outline-empty data-container={containerKey({ panel: el.id })} 'Empty panel: drop or add questions here'
          }
        }
      }
    }
  }

  nav.kv-outline aria-label="Survey outline" bind:this={root} {
    each view.survey.pages as page, pi (page.id) {
      section.kv-outline-page data-page={page.id} {
        .kv-outline-page-head {
          strong '{page.title || page.id}'
          button type=button title="Move page up" aria-label="Move page {page.id} up" disabled={pi === 0} onclick={() => doc.movePage(page.id, pi - 1)} '↑'
          button(
            type=button
            title="Move page down"
            aria-label="Move page {page.id} down"
            disabled={pi === view.survey.pages.length - 1}
            onclick={() => doc.movePage(page.id, pi + 2)}
          ) '↓'
          button(
            type=button
            title="Delete page"
            aria-label="Delete page {page.id}"
            disabled={view.survey.pages.length === 1}
            onclick={() => doc.removePage(page.id)}
          ) '×'
        }
        ul.kv-outline-list(
          class:kv-drop-into={page.elements.length === 0 && at({ page: page.id }, 0)}
          data-container={containerKey({ page: page.id })}
          data-count={page.elements.length}
        ) {
          each page.elements as el, i (el.id) {
            @render node(el, { page: page.id }, i, page.elements.length)
          }
          if page.elements.length === 0 {
            li.kv-outline-empty data-container={containerKey({ page: page.id })} 'Empty page'
          }
        }
      }
    }
    button.kv-outline-add-page type=button onclick={() => doc.addPage()} 'Add page'
    p.kv-sr-only id="{uid}-drag-help" 'Press Space to pick up, the arrow keys to move, Space to drop and Escape to cancel.'
    .kv-sr-only role=status aria-live=assertive '{drag.announcement}'
  }
</template>

<style>
  .kv-outline { display: grid; gap: 0.75rem; align-content: start; font-size: 0.9rem; }
  .kv-outline-page-head { display: flex; align-items: center; gap: 0.25rem; }
  .kv-outline-page-head strong { flex: 1; }
  .kv-outline-list { list-style: none; margin: 0.25rem 0 0; padding: 0 0 0 0.75rem; display: grid; gap: 0.2rem; }
  .kv-outline-row { display: flex; align-items: center; gap: 0.15rem; }
  .kv-outline-select { flex: 1; display: flex; gap: 0.4rem; align-items: baseline; text-align: left; background: none; border: 1px solid transparent; border-radius: 0.3rem; padding: 0.2rem 0.35rem; cursor: pointer; font: inherit; min-width: 0; }
  .kv-outline-select:hover { background: #f3f4f6; }
  .kv-outline-selected > .kv-outline-row > .kv-outline-select { background: #eff6ff; border-color: #93c5fd; }
  .kv-outline-kind { font-size: 0.7rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
  .kv-outline-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kv-outline-row > button:not(.kv-outline-select), .kv-outline-page-head button { font: inherit; font-size: 0.8rem; padding: 0.1rem 0.35rem; cursor: pointer; }
  .kv-outline-empty { color: #9ca3af; font-style: italic; padding: 0.2rem 0.35rem; }
  .kv-outline-page { padding-bottom: 0.4rem; }
  .kv-outline-nested { padding-bottom: 0.35rem; }
  .kv-outline-handle { cursor: grab; touch-action: none; background: none; border: 0; color: #9ca3af; padding: 0.1rem 0.2rem !important; }
  .kv-outline-handle:hover, .kv-outline-handle:focus-visible, .kv-outline-handle[aria-pressed="true"] { color: #2563eb; }
  .kv-outline-select { touch-action: none; }
  .kv-outline-dragging > .kv-outline-row { opacity: 0.45; }
  .kv-drop-before > .kv-outline-row { box-shadow: 0 -2px 0 #2563eb; }
  .kv-drop-after { box-shadow: 0 2px 0 #2563eb; }
  .kv-drop-into > .kv-outline-empty { outline: 2px dashed #2563eb; border-radius: 0.3rem; }
  .kv-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .kv-outline-add-page { justify-self: start; font: inherit; font-size: 0.85rem; cursor: pointer; }
</style>
