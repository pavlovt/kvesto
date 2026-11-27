<script lang="ts">
  import { responseColumns, responseRow, type Survey, type SurveyResponse } from "@kvesto/core";

  let {
    survey,
    responses,
    pageSize = 25,
  }: {
    survey: Survey;
    responses: SurveyResponse[];
    /** Rows per page. */
    pageSize?: number;
  } = $props();

  const columns = $derived(responseColumns(survey, responses));
  const rows = $derived(responses.map((r) => ({ response: r, cells: responseRow(survey, columns, r) })));
  let sortKey = $state<string>("createdAt");
  let descending = $state(true);
  let page = $state(0);
  const sorted = $derived.by(() => {
    const value = (r: (typeof rows)[number]) => (sortKey === "createdAt" ? r.response.createdAt : (r.cells[sortKey] ?? ""));
    const list = [...rows].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const nx = Number(x);
      const ny = Number(y);
      const d = x !== "" && y !== "" && !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : x.localeCompare(y);
      return descending ? -d : d;
    });
    return list;
  });
  const pages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));
  const shown = $derived(sorted.slice(Math.min(page, pages - 1) * pageSize, (Math.min(page, pages - 1) + 1) * pageSize));
  function sortBy(key: string) {
    if (sortKey === key) descending = !descending;
    else {
      sortKey = key;
      descending = key === "createdAt";
    }
    page = 0;
  }
  const ariaSort = (key: string) => (sortKey === key ? (descending ? "descending" : "ascending") : "none");
  const when = (iso: string) => iso.replace("T", " ").slice(0, 16);
</script>

<template lang="braceml">
  .kv-dash-table-wrap {
    if !responses.length {
      p.kv-dash-muted 'No responses match.'
    } else {
      .kv-dash-table-scroll {
        table.kv-dash-table {
          thead > tr {
            th scope=col aria-sort={ariaSort("createdAt")} > button type=button onclick={() => sortBy("createdAt")} 'Submitted'
            each columns as col (col.key) {
              th scope=col aria-sort={ariaSort(col.key)} > button type=button onclick={() => sortBy(col.key)} '{col.label}'
            }
          }
          tbody {
            each shown as row (row.response.id) {
              tr class:kv-dash-partial={row.response.status === "partial"} {
                td.kv-dash-when '{when(row.response.createdAt)}{row.response.status === "partial" ? " (partial)" : ""}'
                each columns as col (col.key) {
                  td '{row.cells[col.key]}'
                }
              }
            }
          }
        }
      }
      if pages > 1 {
        nav.kv-dash-pager aria-label="Pages" {
          button type=button disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))} 'Previous'
          span '{Math.min(page, pages - 1) + 1} of {pages}'
          button type=button disabled={page >= pages - 1} onclick={() => (page = Math.min(pages - 1, page + 1))} 'Next'
        }
      }
    }
  }
</template>

<style>
  .kv-dash-table-scroll { overflow-x: auto; max-width: 100%; }
  .kv-dash-table { border-collapse: collapse; font-size: 0.85rem; background: var(--kv-ui-surface, white); }
  .kv-dash-table th, .kv-dash-table td { border-bottom: 1px solid var(--kv-ui-border, #e5e7eb); padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; white-space: nowrap; max-width: 20rem; overflow: hidden; text-overflow: ellipsis; }
  .kv-dash-table th button { font: inherit; font-weight: 600; background: none; border: 0; padding: 0; cursor: pointer; color: inherit; }
  .kv-dash-table th[aria-sort="ascending"] button::after { content: " ▲"; }
  .kv-dash-table th[aria-sort="descending"] button::after { content: " ▼"; }
  .kv-dash-partial { color: var(--kv-ui-muted, #6b7280); }
  .kv-dash-when { font-variant-numeric: tabular-nums; }
  .kv-dash-pager { display: flex; gap: 0.75rem; align-items: center; margin-top: 0.5rem; font-size: 0.9rem; }
  .kv-dash-pager button { font: inherit; cursor: pointer; }
</style>
