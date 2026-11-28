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

  // Tailwind classes (prefixed `kv:`; see dashboard.css).
  const cellClass =
    "kv:border-b kv:border-b-ui-border kv:py-[0.35rem] kv:px-[0.6rem] kv:text-left kv:align-top kv:whitespace-nowrap " +
    "kv:max-w-[20rem] kv:overflow-hidden kv:text-ellipsis";
  const sortMarks = { ascending: "kv:after:content-['_▲']", descending: "kv:after:content-['_▼']", none: "" };
  const sortButton = (key: string) =>
    "kv:font-inherit kv:[font-size:inherit] kv:font-semibold! kv:bg-transparent kv:[border:0] kv:p-0 kv:cursor-pointer kv:text-inherit " +
    sortMarks[ariaSort(key)];
  const headButton = "kv:font-inherit kv:text-[0.85rem] kv:cursor-pointer kv:print:hidden";
  const pagerButton = "kv:font-inherit kv:[font-size:inherit] kv:cursor-pointer";
  const srOnly = "kv:absolute kv:w-px kv:h-px kv:overflow-hidden kv:[clip:rect(0_0_0_0)]";
</script>

<template lang="braceml">
  // Masked personal data (a pii question) shows as a marker, not as text.
  snippet cell(text: string | undefined) {
    if text === MASKED {
      span.kv-dash-redacted(
        class="kv:inline-block kv:text-[0.75rem] kv:italic kv:py-0 kv:px-[0.35rem] kv:rounded-[0.25rem] kv:bg-ui-hover kv:text-ui-muted"
        title="Personal data, masked for your role"
      ) 'redacted'
    } else {
      '{text}'
    }
  }
  .kv-dash-table-wrap {
    if !responses.length {
      p.kv-dash-muted 'No responses match.'
    } else {
      .kv-dash-table-scroll class="kv:overflow-x-auto kv:max-w-full" {
        table.kv-dash-table class="kv:border-collapse kv:text-[0.85rem] kv:bg-ui-surface" {
          thead > tr {
            th class={cellClass} scope=col > span.kv-dash-sr class={srOnly} 'Open'
            th class={cellClass} scope=col aria-sort={ariaSort("createdAt")} > button type=button class={sortButton('createdAt')} onclick={() => sortBy("createdAt")} 'Submitted'
            each columns as col (col.key) {
              th class={cellClass} scope=col aria-sort={ariaSort(col.key)} > button type=button class={sortButton(col.key)} onclick={() => sortBy(col.key)} '{col.label}'
            }
          }
          tbody {
            each shown as row (row.response.id) {
              tr class={row.response.status === 'partial' ? 'kv:text-ui-muted' : ''} class:kv-dash-partial={row.response.status === "partial"} {
                td class={cellClass} > button.kv-dash-open(
                  type=button
                  class="kv:font-inherit kv:text-[0.8rem] kv:cursor-pointer"
                  aria-label="Open response {row.response.id}"
                  onclick={() => (open = row.response.id)}
                ) 'View'
                td.kv-dash-when class="{cellClass} kv:tabular-nums" '{when(row.response.createdAt)}{row.response.status === "partial" ? " (partial)" : ""}'
                each columns as col (col.key) {
                  td class={cellClass} {
                    @render cell(row.cells[col.key])
                  }
                }
              }
            }
          }
        }
      }
      if opened {
        section.kv-dash-detail(
          class="kv:mt-4 kv:border kv:border-ui-border kv:rounded-lg kv:py-3 kv:px-4 kv:max-w-[48rem] kv:bg-ui-surface"
          aria-label="Response {opened.response.id}"
        ) {
          .kv-dash-detail-head class="kv:flex kv:gap-2 kv:items-center" {
            h2 class="kv:text-[1rem] kv:[margin:0_auto_0_0]" 'Response {when(opened.response.createdAt)}'
            button type=button class={headButton} onclick={printOne} 'Print'
            if ondelete {
              button.kv-dash-delete type=button class="{headButton} kv:text-ui-danger" onclick={deleteOne} '{confirmDelete ? "Really delete?" : "Delete"}'
            }
            button type=button class={headButton} onclick={() => (open = null)} 'Close'
          }
          dl {
            each columns as col (col.key) {
              if opened.cells[col.key] {
                dt class="kv:font-semibold kv:mt-2" '{col.label}'
                dd class="kv:[margin:0.1rem_0_0] kv:whitespace-pre-wrap" {
                  @render cell(opened.cells[col.key])
                }
              }
            }
          }
          if deleteError {
            p.kv-dash-error class="kv:text-ui-danger" 'Could not delete: {deleteError}'
          }
        }
      }
      if pages > 1 {
        nav.kv-dash-pager class="kv:flex kv:gap-3 kv:items-center kv:mt-2 kv:text-[0.9rem]" aria-label="Pages" {
          button type=button class={pagerButton} disabled={page === 0} onclick={() => (page = Math.max(0, page - 1))} 'Previous'
          span '{Math.min(page, pages - 1) + 1} of {pages}'
          button type=button class={pagerButton} disabled={page >= pages - 1} onclick={() => (page = Math.min(pages - 1, page + 1))} 'Next'
        }
      }
    }
  }
</template>
