<script lang="ts" module>
  import type { HttpStorageOptions } from "@kvesto/core";

  export interface ApiTokensProps {
    /** The Kvesto server. Its key needs the `token:manage` action. */
    api: HttpStorageOptions;
  }

  export interface ApiTokenInfo {
    id: string;
    name: string;
    actions: string[];
    surveyIds: string[] | null;
    expiresAt: string | null;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { apiError, apiRequest } from "./api.js";

  let { api }: ApiTokensProps = $props();

  let tokens = $state<ApiTokenInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  // The new token's form.
  let name = $state("");
  let role = $state<"owner" | "editor" | "analyst" | "viewer">("viewer");
  let surveys = $state("");
  let days = $state("90");
  /** The token just created: the only time it is shown. */
  let created = $state<{ name: string; token: string } | null>(null);
  /** The token whose Revoke was pressed once, waiting for the second press. */
  let confirming = $state<string | null>(null);

  async function load() {
    loading = true;
    try {
      tokens = (await apiRequest<{ items: ApiTokenInfo[] }>(api, "GET", "/tokens"))!.items;
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

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const surveyIds = surveys.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const reply = (await apiRequest<ApiTokenInfo & { token: string }>(api, "POST", "/tokens", {
        name: name.trim(),
        role,
        ...(surveyIds.length ? { surveyIds } : {}),
        expiresInDays: Number(days),
      }))!;
      created = { name: reply.name, token: reply.token };
      name = "";
      surveys = "";
      await load();
    } catch (err) {
      error = apiError(err);
    }
  }

  async function revoke(id: string) {
    if (confirming !== id) {
      confirming = id;
      return;
    }
    confirming = null;
    try {
      await apiRequest(api, "DELETE", `/tokens/${encodeURIComponent(id)}`);
      await load();
    } catch (e) {
      error = apiError(e);
    }
  }

  const day = (iso: string | null, none: string) => (iso ? iso.slice(0, 10) : none);
  const status = (t: ApiTokenInfo) =>
    t.revokedAt ? "Revoked" : t.expiresAt && Date.parse(t.expiresAt) < Date.now() ? "Expired" : "Active";
</script>

<template lang="braceml">
  section.kv-dash-tokens {
    h1 'API tokens'
    p.kv-dash-muted 'Tokens let scripts and other apps use the API with one role, on all surveys or a few.'
    form.kv-dash-form onsubmit={create} {
      label {
        span 'Name'
        input required maxlength=100 value={name} oninput={(e) => (name = e.currentTarget.value)}
      }
      label {
        span 'Role'
        select value={role} onchange={(e) => (role = e.currentTarget.value as typeof role)} {
          option value="viewer" 'Viewer: read results'
          option value="analyst" 'Analyst: results and exports'
          option value="editor" 'Editor: surveys and results'
          option value="owner" 'Owner: everything'
        }
      }
      label {
        span 'Surveys'
        input placeholder="All surveys, or ids separated by commas" value={surveys} oninput={(e) => (surveys = e.currentTarget.value)}
      }
      label {
        span 'Expires after (days)'
        input type=number min=0 max=3650 title="0 for never" value={days} oninput={(e) => (days = e.currentTarget.value)}
      }
      button type=submit disabled={!name.trim()} 'Create token'
    }
    if created {
      .kv-dash-new-token role=status {
        p 'The token "{created.name}". Copy it now: it is not shown again.'
        input.kv-dash-token-value readonly aria-label="New token" value={created.token} onfocus={(e) => e.currentTarget.select()}
        button type=button onclick={() => (created = null)} 'Done'
      }
    }
    if error {
      p.kv-dash-error '{error}'
    }
    if loading {
      p.kv-dash-muted 'Loading…'
    } else {
      .kv-dash-table-scroll > table.kv-dash-table {
        thead > tr {
          th scope=col 'Name'
          th scope=col 'Can'
          th scope=col 'Surveys'
          th scope=col 'Expires'
          th scope=col 'Last used'
          th scope=col 'Status'
          th scope=col > span.kv-dash-sr 'Revoke'
        }
        tbody {
          each tokens as t (t.id) {
            tr class:kv-dash-partial={status(t) !== "Active"} {
              td '{t.name}'
              td.kv-dash-wrap '{t.actions.join(", ")}'
              td.kv-dash-wrap '{t.surveyIds ? t.surveyIds.join(", ") : "All"}'
              td '{day(t.expiresAt, "Never")}'
              td '{day(t.lastUsedAt, "–")}'
              td '{status(t)}'
              td {
                if !t.revokedAt {
                  button.kv-dash-danger type=button aria-label="Revoke {t.name}" onclick={() => revoke(t.id)} '{confirming === t.id ? "Really revoke?" : "Revoke"}'
                }
              }
            }
          } else {
            tr > td colspan=7 'No tokens yet.'
          }
        }
      }
    }
  }
</template>

<style>
  .kv-dash-tokens h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .kv-dash-form { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: end; margin: 0.75rem 0 1rem; font-size: 0.9rem; }
  .kv-dash-form label { display: flex; flex-direction: column; gap: 0.2rem; }
  .kv-dash-form input, .kv-dash-form select, .kv-dash-form button, .kv-dash-new-token button, .kv-dash-danger { font: inherit; font-size: 0.85rem; }
  .kv-dash-form button, .kv-dash-new-token button, .kv-dash-danger { cursor: pointer; }
  .kv-dash-new-token { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; border: 1px solid var(--kv-ui-warn, #f59e0b); background: var(--kv-ui-warn-soft, #fffbeb); border-radius: 0.5rem; padding: 0.6rem 0.8rem; margin-bottom: 1rem; max-width: 48rem; }
  .kv-dash-new-token p { margin: 0; flex-basis: 100%; }
  .kv-dash-token-value { font-family: ui-monospace, monospace; font-size: 0.85rem; flex: 1; min-width: 16rem; }
  .kv-dash-danger { color: var(--kv-ui-danger, #b91c1c); }
  .kv-dash-table-scroll { overflow-x: auto; max-width: 100%; }
  .kv-dash-table { border-collapse: collapse; font-size: 0.85rem; background: var(--kv-ui-surface, white); }
  .kv-dash-table th, .kv-dash-table td { border-bottom: 1px solid var(--kv-ui-border, #e5e7eb); padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; white-space: nowrap; }
  .kv-dash-table .kv-dash-wrap { white-space: normal; max-width: 20rem; }
  .kv-dash-partial { color: var(--kv-ui-muted, #6b7280); }
  .kv-dash-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .kv-dash-muted { color: var(--kv-ui-muted, #6b7280); font-size: 0.9rem; }
  .kv-dash-error { color: var(--kv-ui-danger, #b91c1c); white-space: pre-wrap; }
</style>
