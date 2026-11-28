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

  // Tailwind classes used more than once (prefixed `kv:`; see dashboard.css).
  const formClass = "kv:flex kv:flex-wrap kv:gap-3 kv:[align-items:end] kv:[margin:0.75rem_0_1rem] kv:text-[0.9rem]";
  const labelClass = "kv:flex kv:flex-col kv:gap-[0.2rem]";
  const cellClass = "kv:border-b kv:border-b-ui-border kv:py-[0.35rem] kv:px-[0.6rem] kv:text-left kv:align-top kv:whitespace-nowrap";
  const fieldClass = "kv:font-inherit kv:text-[0.85rem]";
  const buttonClass = "kv:font-inherit kv:text-[0.85rem] kv:cursor-pointer";
</script>

<template lang="braceml">
  section.kv-dash-tokens {
    h1 class="kv:text-[1.5rem] kv:[margin:0_0_0.25rem]" 'API tokens'
    p.kv-dash-muted class="kv:text-ui-muted kv:text-[0.9rem]" 'Tokens let scripts and other apps use the API with one role, on all surveys or a few.'
    form.kv-dash-form class={formClass} onsubmit={create} {
      label class={labelClass} {
        span 'Name'
        input class={fieldClass} required maxlength=100 value={name} oninput={(e) => (name = e.currentTarget.value)}
      }
      label class={labelClass} {
        span 'Role'
        select class={fieldClass} value={role} onchange={(e) => (role = e.currentTarget.value as typeof role)} {
          option value="viewer" 'Viewer: read results'
          option value="analyst" 'Analyst: results and exports'
          option value="editor" 'Editor: surveys and results'
          option value="owner" 'Owner: everything'
        }
      }
      label class={labelClass} {
        span 'Surveys'
        input class={fieldClass} placeholder="All surveys, or ids separated by commas" value={surveys} oninput={(e) => (surveys = e.currentTarget.value)}
      }
      label class={labelClass} {
        span 'Expires after (days)'
        input class={fieldClass} type=number min=0 max=3650 title="0 for never" value={days} oninput={(e) => (days = e.currentTarget.value)}
      }
      button class={buttonClass} type=submit disabled={!name.trim()} 'Create token'
    }
    if created {
      .kv-dash-new-token(
        class="kv:flex kv:flex-wrap kv:gap-2 kv:items-center kv:border kv:border-ui-warn kv:bg-ui-warn-soft kv:rounded-lg kv:py-[0.6rem] kv:px-[0.8rem] kv:mb-4 kv:max-w-[48rem]"
        role=status
      ) {
        p class="kv:m-0 kv:basis-full" 'The token "{created.name}". Copy it now: it is not shown again.'
        input.kv-dash-token-value class="kv:[font-family:ui-monospace,monospace] kv:text-[0.85rem] kv:flex-1 kv:min-w-[16rem]" readonly aria-label="New token" value={created.token} onfocus={(e) => e.currentTarget.select()}
        button class={buttonClass} type=button onclick={() => (created = null)} 'Done'
      }
    }
    if error {
      p.kv-dash-error class="kv:text-ui-danger kv:whitespace-pre-wrap" '{error}'
    }
    if loading {
      p.kv-dash-muted class="kv:text-ui-muted kv:text-[0.9rem]" 'Loading…'
    } else {
      .kv-dash-table-scroll class="kv:overflow-x-auto kv:max-w-full" > table.kv-dash-table class="kv:border-collapse kv:text-[0.85rem] kv:bg-ui-surface" {
        thead > tr {
          th class={cellClass} scope=col 'Name'
          th class={cellClass} scope=col 'Can'
          th class={cellClass} scope=col 'Surveys'
          th class={cellClass} scope=col 'Expires'
          th class={cellClass} scope=col 'Last used'
          th class={cellClass} scope=col 'Status'
          th class={cellClass} scope=col > span.kv-dash-sr class="kv:absolute kv:w-px kv:h-px kv:overflow-hidden kv:[clip:rect(0_0_0_0)]" 'Revoke'
        }
        tbody {
          each tokens as t (t.id) {
            tr class={status(t) !== 'Active' ? 'kv:text-ui-muted' : ''} class:kv-dash-partial={status(t) !== "Active"} {
              td class={cellClass} '{t.name}'
              td.kv-dash-wrap class="kv:border-b kv:border-b-ui-border kv:py-[0.35rem] kv:px-[0.6rem] kv:text-left kv:align-top kv:whitespace-normal kv:max-w-[20rem]" '{t.actions.join(", ")}'
              td.kv-dash-wrap class="kv:border-b kv:border-b-ui-border kv:py-[0.35rem] kv:px-[0.6rem] kv:text-left kv:align-top kv:whitespace-normal kv:max-w-[20rem]" '{t.surveyIds ? t.surveyIds.join(", ") : "All"}'
              td class={cellClass} '{day(t.expiresAt, "Never")}'
              td class={cellClass} '{day(t.lastUsedAt, "–")}'
              td class={cellClass} '{status(t)}'
              td class={cellClass} {
                if !t.revokedAt {
                  button.kv-dash-danger class="{buttonClass} kv:text-ui-danger" type=button aria-label="Revoke {t.name}" onclick={() => revoke(t.id)} '{confirming === t.id ? "Really revoke?" : "Revoke"}'
                }
              }
            }
          } else {
            tr > td class={cellClass} colspan=7 'No tokens yet.'
          }
        }
      }
    }
  }
</template>
