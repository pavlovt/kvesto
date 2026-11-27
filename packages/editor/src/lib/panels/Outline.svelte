<script lang="ts">
  import type { ElementInput, PanelInput } from "@kvesto/core";
  import type { Container, DocumentState, SurveyDocument } from "../doc/document.js";

  let { doc, docState: view }: { doc: SurveyDocument; docState: DocumentState } = $props();

  const label = (el: ElementInput) => ("title" in el && el.title ? el.title : el.id);
  const kind = (el: ElementInput) => (el.type === "panel" ? ((el as PanelInput).repeat ? "repeat" : "panel") : el.type);
  const children = (el: ElementInput) => (el as PanelInput).elements;
</script>

<template lang="braceml">
  snippet node(el: ElementInput, container: Container, index: number, count: number) {
    li.kv-outline-item class:kv-outline-selected={view.selected === el.id} data-outline={el.id} {
      .kv-outline-row {
        button.kv-outline-select(
          type=button
          aria-pressed={view.selected === el.id}
          onclick={() => doc.select(view.selected === el.id ? null : el.id)}
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
        ul.kv-outline-list {
          each inner as child, i (child.id) {
            @render node(child, { panel: el.id }, i, inner.length)
          }
          if inner.length === 0 {
            li.kv-outline-empty 'Empty panel: select it and add questions'
          }
        }
      }
    }
  }

  nav.kv-outline aria-label="Survey outline" {
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
        ul.kv-outline-list {
          each page.elements as el, i (el.id) {
            @render node(el, { page: page.id }, i, page.elements.length)
          }
          if page.elements.length === 0 {
            li.kv-outline-empty 'Empty page'
          }
        }
      }
    }
    button.kv-outline-add-page type=button onclick={() => doc.addPage()} 'Add page'
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
  .kv-outline-add-page { justify-self: start; font: inherit; font-size: 0.85rem; cursor: pointer; }
</style>
