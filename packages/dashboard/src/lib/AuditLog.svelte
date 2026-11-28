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

  // Tailwind classes used more than once (prefixed `kv:`; see dashboard.css).
  const formClass = "kv:flex kv:flex-wrap kv:gap-3 kv:[align-items:end] kv:[margin:0.75rem_0_1rem] kv:text-[0.9rem]";
  const labelClass = "kv:flex kv:flex-col kv:gap-[0.2rem]";
  const cellClass = "kv:border-b kv:border-b-ui-border kv:py-[0.35rem] kv:px-[0.6rem] kv:text-left kv:align-top kv:whitespace-nowrap";
  const fieldClass = "kv:font-inherit kv:text-[0.85rem] kv:cursor-pointer";
</script>

<template lang="braceml">
  section.kv-dash-audit {
    h1 class="kv:text-[1.5rem] kv:[margin:0_0_0.25rem]" 'Audit log'
    p.kv-dash-muted class="kv:text-ui-muted kv:text-[0.9rem]" 'Every admin request: who made it, what it did and how the server answered. Oldest first.'
    form.kv-dash-form class={formClass} onsubmit={search} {
      label class={labelClass} {
        span 'Actor'
        input class={fieldClass} value={filter.actor} oninput={(e) => (filter.actor = e.currentTarget.value)}
      }
      label class={labelClass} {
        span 'Action'
        input class={fieldClass} placeholder="response:delete" value={filter.action} oninput={(e) => (filter.action = e.currentTarget.value)}
      }
      label class={labelClass} {
        span 'Survey'
        input class={fieldClass} value={filter.surveyId} oninput={(e) => (filter.surveyId = e.currentTarget.value)}
      }
      label class={labelClass} {
        span 'From'
        input class={fieldClass} type=date value={filter.from} onchange={(e) => (filter.from = e.currentTarget.value)}
      }
      label class={labelClass} {
        span 'To'
        input class={fieldClass} type=date value={filter.to} onchange={(e) => (filter.to = e.currentTarget.value)}
      }
      button class={fieldClass} type=submit 'Search'
      a.kv-dash-csv class="kv:text-ui-accent kv:self-center" href="{base}{csvPath}" download="audit.csv" onclick={downloadCsv} 'Download CSV'
    }
    if error {
      p.kv-dash-error class="kv:text-ui-danger kv:whitespace-pre-wrap" '{error}'
    }
    .kv-dash-table-scroll class="kv:overflow-x-auto kv:max-w-full" > table.kv-dash-table class="kv:border-collapse kv:text-[0.85rem] kv:bg-ui-surface" {
      thead > tr {
        th class={cellClass} scope=col '#'
        th class={cellClass} scope=col 'When (UTC)'
        th class={cellClass} scope=col 'Actor'
        th class={cellClass} scope=col 'Action'
        th class={cellClass} scope=col 'Request'
        th class={cellClass} scope=col 'Survey'
        th class={cellClass} scope=col 'Status'
        th class={cellClass} scope=col 'IP'
      }
      tbody {
        each entries as entry (entry.seq) {
          tr class={entry.status >= 400 ? 'kv:text-ui-danger' : ''} class:kv-dash-failed={entry.status >= 400} {
            td.kv-dash-num class="{cellClass} kv:tabular-nums" '{entry.seq}'
            td class={cellClass} '{when(entry.at)}'
            td class={cellClass} '{entry.actor}'
            td class={cellClass} '{entry.action}'
            td class={cellClass} title="Request {entry.requestId}" '{entry.method} {entry.path}'
            td class={cellClass} '{entry.surveyId ?? ""}'
            td.kv-dash-num class="{cellClass} kv:tabular-nums" '{entry.status}'
            td class={cellClass} '{entry.ip}'
          }
        } else {
          tr > td class={cellClass} colspan=8 '{loading ? "Loading…" : "No entries match."}'
        }
      }
    }
    if nextAfter !== undefined {
      p > button.kv-dash-more class={fieldClass} type=button disabled={loading} onclick={() => load(true)} 'Load more'
    }
  }
</template>
