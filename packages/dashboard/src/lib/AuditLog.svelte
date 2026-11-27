<script lang="ts" module>
  import type { HttpStorageOptions } from "@kvesto/core";

  export interface AuditLogProps {
    /** The Kvesto server. Its key needs the `audit:read` action. */
    api: HttpStorageOptions;
    /** Entries per page. Default 100. */
    pageSize?: number;
  }

  export interface AuditEntry {
    seq: number;
    at: string;
    actor: string;
    action: string;
    method: string;
    path: string;
    surveyId: string | null;
    status: number;
    ip: string;
    requestId: string;
  }
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { apiBlob, apiError, apiRequest, saveBlob } from "./api.js";

  let { api, pageSize = 100 }: AuditLogProps = $props();

  let filter = $state({ actor: "", action: "", surveyId: "", from: "", to: "" });
  let entries = $state<AuditEntry[]>([]);
  let nextAfter = $state<number | undefined>(undefined);
  let loading = $state(false);
  let error = $state<string | null>(null);

  /** The filters as a query string. Dates are whole days in UTC. */
  const query = $derived.by(() => {
    const q = new URLSearchParams();
    for (const key of ["actor", "action", "surveyId"] as const) if (filter[key].trim()) q.set(key, filter[key].trim());
    if (filter.from) q.set("from", filter.from);
    if (filter.to) q.set("to", `${filter.to}T23:59:59.999Z`);
    return q;
  });
  const csvPath = $derived(`/audit.csv${query.size ? `?${query}` : ""}`);

  async function load(more = false) {
    loading = true;
    const q = new URLSearchParams(query);
    q.set("limit", String(pageSize));
    if (more && nextAfter !== undefined) q.set("after", String(nextAfter));
    try {
      const page = (await apiRequest<{ items: AuditEntry[]; nextAfter?: number }>(api, "GET", `/audit?${q}`))!;
      entries = more ? [...entries, ...page.items] : page.items;
      nextAfter = page.nextAfter;
      error = null;
    } catch (e) {
      error = apiError(e);
    } finally {
      loading = false;
    }
  }
  $effect(() => {
    void api;
    untrack(() => load());
  });

  function search(e: SubmitEvent) {
    e.preventDefault();
    load();
  }
  // With headers (a bearer key), the link can't carry them: fetch the file instead.
  async function downloadCsv(e: MouseEvent) {
    if (!api.headers) return;
    e.preventDefault();
    try {
      saveBlob(await apiBlob(api, csvPath, "text/csv"), "audit.csv");
    } catch (err) {
      error = apiError(err);
    }
  }
  const base = $derived(api.baseUrl.replace(/\/+$/, ""));
  const when = (iso: string) => iso.replace("T", " ").slice(0, 19);
</script>

<template lang="braceml">
  section.kv-dash-audit {
    h1 'Audit log'
    p.kv-dash-muted 'Every admin request: who made it, what it did and how the server answered. Oldest first.'
    form.kv-dash-form onsubmit={search} {
      label {
        span 'Actor'
        input value={filter.actor} oninput={(e) => (filter.actor = e.currentTarget.value)}
      }
      label {
        span 'Action'
        input placeholder="response:delete" value={filter.action} oninput={(e) => (filter.action = e.currentTarget.value)}
      }
      label {
        span 'Survey'
        input value={filter.surveyId} oninput={(e) => (filter.surveyId = e.currentTarget.value)}
      }
      label {
        span 'From'
        input type=date value={filter.from} onchange={(e) => (filter.from = e.currentTarget.value)}
      }
      label {
        span 'To'
        input type=date value={filter.to} onchange={(e) => (filter.to = e.currentTarget.value)}
      }
      button type=submit 'Search'
      a.kv-dash-csv href="{base}{csvPath}" download="audit.csv" onclick={downloadCsv} 'Download CSV'
    }
    if error {
      p.kv-dash-error '{error}'
    }
    .kv-dash-table-scroll > table.kv-dash-table {
      thead > tr {
        th scope=col '#'
        th scope=col 'When (UTC)'
        th scope=col 'Actor'
        th scope=col 'Action'
        th scope=col 'Request'
        th scope=col 'Survey'
        th scope=col 'Status'
        th scope=col 'IP'
      }
      tbody {
        each entries as entry (entry.seq) {
          tr class:kv-dash-failed={entry.status >= 400} {
            td.kv-dash-num '{entry.seq}'
            td '{when(entry.at)}'
            td '{entry.actor}'
            td '{entry.action}'
            td title="Request {entry.requestId}" '{entry.method} {entry.path}'
            td '{entry.surveyId ?? ""}'
            td.kv-dash-num '{entry.status}'
            td '{entry.ip}'
          }
        } else {
          tr > td colspan=8 '{loading ? "Loading…" : "No entries match."}'
        }
      }
    }
    if nextAfter !== undefined {
      p > button.kv-dash-more type=button disabled={loading} onclick={() => load(true)} 'Load more'
    }
  }
</template>

<style>
  .kv-dash-audit h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .kv-dash-form { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: end; margin: 0.75rem 0 1rem; font-size: 0.9rem; }
  .kv-dash-form label { display: flex; flex-direction: column; gap: 0.2rem; }
  .kv-dash-form input, .kv-dash-form button, .kv-dash-more { font: inherit; font-size: 0.85rem; cursor: pointer; }
  .kv-dash-csv { color: var(--kv-ui-accent, #2563eb); align-self: center; }
  .kv-dash-table-scroll { overflow-x: auto; max-width: 100%; }
  .kv-dash-table { border-collapse: collapse; font-size: 0.85rem; background: var(--kv-ui-surface, white); }
  .kv-dash-table th, .kv-dash-table td { border-bottom: 1px solid var(--kv-ui-border, #e5e7eb); padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; white-space: nowrap; }
  .kv-dash-num { text-align: right; font-variant-numeric: tabular-nums; }
  .kv-dash-failed { color: var(--kv-ui-danger, #b91c1c); }
  .kv-dash-muted { color: var(--kv-ui-muted, #6b7280); font-size: 0.9rem; }
  .kv-dash-error { color: var(--kv-ui-danger, #b91c1c); white-space: pre-wrap; }
</style>
