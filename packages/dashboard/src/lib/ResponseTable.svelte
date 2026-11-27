<script lang="ts">
  import { MASKED, responseColumns, responseRow, type Survey, type SurveyResponse } from "@kvesto/core";

  let {
    survey,
    responses,
    pageSize = 25,
    ondelete,
  }: {
    survey: Survey;
    responses: SurveyResponse[];
    /** Rows per page. */
    pageSize?: number;
    /** Delete a response for good. Without it, there is no Delete button. */
    ondelete?: (responseId: string) => Promise<void>;
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
  // One response on its own, for reading or printing.
  let open = $state<string | null>(null);
  const opened = $derived(rows.find((r) => r.response.id === open) ?? null);
  function printOne() {
    document.documentElement.classList.add("kv-dash-printing-one");
    window.print();
    document.documentElement.classList.remove("kv-dash-printing-one");
  }
  // Delete asks twice: the first press arms the button.
  let confirmDelete = $state(false);
  let deleteError = $state<string | null>(null);
  $effect(() => {
    void open;
    confirmDelete = false;
    deleteError = null;
  });
  async function deleteOne() {
    if (!opened || !ondelete) return;
    if (!confirmDelete) {
      confirmDelete = true;
      return;
    }
    try {
      await ondelete(opened.response.id);
      open = null;
    } catch (e) {
      deleteError = e instanceof Error ? e.message : String(e);
      confirmDelete = false;
    }
  }
  const ariaSort = (key: string) => (sortKey === key ? (descending ? "descending" : "ascending") : "none");
  const when = (iso: string) => iso.replace("T", " ").slice(0, 16);
</script>

<template lang="braceml">
  // Masked personal data (a pii question) shows as a marker, not as text.
  snippet cell(text: string | undefined) {
    if text === MASKED {
      span.kv-dash-redacted title="Personal data, masked for your role" 'redacted'
    } else {
      '{text}'
    }
  }
  .kv-dash-table-wrap {
    if !responses.length {
      p.kv-dash-muted 'No responses match.'
    } else {
      .kv-dash-table-scroll {
        table.kv-dash-table {
          thead > tr {
            th scope=col > span.kv-dash-sr 'Open'
            th scope=col aria-sort={ariaSort("createdAt")} > button type=button onclick={() => sortBy("createdAt")} 'Submitted'
            each columns as col (col.key) {
              th scope=col aria-sort={ariaSort(col.key)} > button type=button onclick={() => sortBy(col.key)} '{col.label}'
            }
          }
          tbody {
            each shown as row (row.response.id) {
              tr class:kv-dash-partial={row.response.status === "partial"} {
                td > button.kv-dash-open type=button aria-label="Open response {row.response.id}" onclick={() => (open = row.response.id)} 'View'
                td.kv-dash-when '{when(row.response.createdAt)}{row.response.status === "partial" ? " (partial)" : ""}'
                each columns as col (col.key) {
                  td {
                    @render cell(row.cells[col.key])
                  }
                }
              }
            }
          }
        }
      }
      if opened {
        section.kv-dash-detail aria-label="Response {opened.response.id}" {
          .kv-dash-detail-head {
            h2 'Response {when(opened.response.createdAt)}'
            button type=button onclick={printOne} 'Print'
            if ondelete {
              button.kv-dash-delete type=button onclick={deleteOne} '{confirmDelete ? "Really delete?" : "Delete"}'
            }
            button type=button onclick={() => (open = null)} 'Close'
          }
          dl {
            each columns as col (col.key) {
              if opened.cells[col.key] {
                dt '{col.label}'
                dd {
                  @render cell(opened.cells[col.key])
                }
              }
            }
          }
          if deleteError {
            p.kv-dash-error 'Could not delete: {deleteError}'
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
  .kv-dash-open { font: inherit; font-size: 0.8rem; cursor: pointer; }
  .kv-dash-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .kv-dash-detail { margin-top: 1rem; border: 1px solid var(--kv-ui-border, #e5e7eb); border-radius: 0.5rem; padding: 0.75rem 1rem; max-width: 48rem; background: var(--kv-ui-surface, white); }
  .kv-dash-detail-head { display: flex; gap: 0.5rem; align-items: center; }
  .kv-dash-detail-head h2 { font-size: 1rem; margin: 0 auto 0 0; }
  .kv-dash-detail-head button { font: inherit; font-size: 0.85rem; cursor: pointer; }
  .kv-dash-detail dt { font-weight: 600; margin-top: 0.5rem; }
  .kv-dash-redacted { display: inline-block; font-size: 0.75rem; font-style: italic; padding: 0 0.35rem; border-radius: 0.25rem; background: var(--kv-ui-hover, #f3f4f6); color: var(--kv-ui-muted, #6b7280); }
  .kv-dash-detail-head .kv-dash-delete { color: var(--kv-ui-danger, #b91c1c); }
  .kv-dash-error { color: var(--kv-ui-danger, #b91c1c); }
  .kv-dash-detail dd { margin: 0.1rem 0 0; white-space: pre-wrap; }
  /* "Print" on one response prints only that response. */
  @media print {
    :global(html.kv-dash-printing-one body *) { visibility: hidden; }
    :global(html.kv-dash-printing-one) .kv-dash-detail, :global(html.kv-dash-printing-one) .kv-dash-detail * { visibility: visible; }
    :global(html.kv-dash-printing-one) .kv-dash-detail { position: absolute; inset: 0 auto auto 0; border: 0; }
    .kv-dash-detail-head button { display: none; }
  }
</style>
