<script lang="ts" module>
  import type { HttpStorageOptions, SurveyStorage } from "@kvesto/core";

  export interface DashboardProps {
    /** Needs `listSurveys`, `loadSurvey` and `listResponses` (all bundled adapters have them). */
    storage: Pick<SurveyStorage, "listSurveys" | "loadSurvey" | "listResponses">;
    /** Open this survey's results first instead of the list. */
    surveyId?: string;
    /** Show survey texts in this locale. Default: each survey's default locale. */
    locale?: string;
    /** The dashboard's look: "light" (default), "dark", or "auto" to follow the device. A menu changes it, and the choice is remembered in this browser. */
    theme?: "light" | "dark" | "auto";
    /**
     * The Kvesto server behind an `httpStorage` (pass the same options). With it, the dashboard also manages
     * API tokens (needs `token:manage`), shows the audit log (needs `audit:read`) and can delete responses.
     */
    api?: HttpStorageOptions;
  }
</script>

<script lang="ts">
  import SurveyList from "./SurveyList.svelte";
  import SurveyResults from "./SurveyResults.svelte";
  import ApiTokens from "./ApiTokens.svelte";
  import AuditLog from "./AuditLog.svelte";

  let { storage, surveyId, locale, theme = "light", api }: DashboardProps = $props();
  let section = $state<"surveys" | "tokens" | "audit">("surveys");
  // The menu's choice is remembered in this browser; `theme` is the default until one is made.
  const themeKey = "kvesto-dashboard-theme";
  function savedTheme(): typeof theme | undefined {
    try {
      const value = localStorage.getItem(themeKey);
      return value === "light" || value === "dark" || value === "auto" ? value : undefined;
    } catch {
      return undefined; // no localStorage (server rendering, blocked storage)
    }
  }
  function setTheme(value: NonNullable<typeof theme>) {
    uiTheme = value;
    try {
      localStorage.setItem(themeKey, value);
    } catch {
      // not remembered, but the change still applies
    }
  }
  // svelte-ignore state_referenced_locally
  let uiTheme = $state(savedTheme() ?? theme);

  // svelte-ignore state_referenced_locally
  let selected = $state<string | null>(surveyId ?? null);
</script>

<template lang="braceml">
  .kv-dashboard data-kv-ui-theme={uiTheme} {
    select.kv-dash-ui-theme aria-label="Dashboard theme" value={uiTheme} onchange={(e) => setTheme(e.currentTarget.value as typeof uiTheme)} {
      option value="light" 'Light'
      option value="dark" 'Dark'
      option value="auto" 'Auto'
    }
    if api {
      nav.kv-dash-sections aria-label="Dashboard" {
        button type=button aria-pressed={section === "surveys"} onclick={() => (section = "surveys")} 'Surveys'
        button type=button aria-pressed={section === "tokens"} onclick={() => (section = "tokens")} 'API tokens'
        button type=button aria-pressed={section === "audit"} onclick={() => (section = "audit")} 'Audit log'
      }
    }
    if api && section === "tokens" {
      ApiTokens api={api}
    } else if api && section === "audit" {
      AuditLog api={api}
    } else if selected {
      p > button.kv-dash-back type=button onclick={() => (selected = null)} '← All surveys'
      SurveyResults storage={storage} surveyId={selected} locale={locale} api={api}
    } else {
      h1 'Surveys'
      SurveyList storage={storage} onselect={(id) => (selected = id)}
    }
  }
</template>

<style>
  .kv-dashboard h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
  .kv-dashboard { position: relative; }
  .kv-dash-ui-theme { position: absolute; top: 0; right: 0; font: inherit; font-size: 0.85rem; }
  .kv-dash-sections { display: flex; gap: 0.25rem; margin: 0 0 1rem; }
  .kv-dash-sections button { font: inherit; font-size: 0.9rem; cursor: pointer; border: 1px solid var(--kv-ui-border-strong, #d1d5db); background: var(--kv-ui-surface, white); color: inherit; padding: 0.25rem 0.75rem; }
  .kv-dash-sections button[aria-pressed="true"] { background: var(--kv-ui-accent-soft, #eff6ff); border-color: var(--kv-ui-accent-line, #93c5fd); }
  .kv-dash-back { font: inherit; color: var(--kv-ui-accent, #2563eb); background: none; border: 0; padding: 0; cursor: pointer; }
  /* Light by default (the colours above); dark when asked, or with "auto" when the device prefers it.
     "only light" stops a browser's forced dark mode from repainting the light theme. */
  .kv-dashboard { background: var(--kv-ui-bg, transparent); color: var(--kv-ui-fg, inherit); color-scheme: var(--kv-ui-scheme, only light); }
  .kv-dashboard[data-kv-ui-theme="dark"] {
    --kv-ui-bg: #0f172a;
    --kv-ui-fg: #e5e7eb;
    --kv-ui-surface: #1e293b;
    --kv-ui-accent: #60a5fa;
    --kv-ui-on-accent: #0b1220;
    --kv-ui-accent-text: #93c5fd;
    --kv-ui-accent-soft: #1e3a5f;
    --kv-ui-accent-line: #3b82f6;
    --kv-ui-border: #334155;
    --kv-ui-border-strong: #475569;
    --kv-ui-text: #f1f5f9;
    --kv-ui-text-2: #cbd5e1;
    --kv-ui-muted: #94a3b8;
    --kv-ui-subtle: #64748b;
    --kv-ui-hover: #273449;
    --kv-ui-danger: #f87171;
    --kv-ui-danger-line: #b91c1c;
    --kv-ui-warn: #f59e0b;
    --kv-ui-warn-soft: #3b2f12;
    --kv-ui-review: #8b5cf6;
    --kv-ui-review-text: #c4b5fd;
    --kv-ui-scheme: dark;
  }
  @media (prefers-color-scheme: dark) {
    .kv-dashboard[data-kv-ui-theme="auto"] {
      --kv-ui-bg: #0f172a;
      --kv-ui-fg: #e5e7eb;
      --kv-ui-surface: #1e293b;
      --kv-ui-accent: #60a5fa;
      --kv-ui-on-accent: #0b1220;
      --kv-ui-accent-text: #93c5fd;
      --kv-ui-accent-soft: #1e3a5f;
      --kv-ui-accent-line: #3b82f6;
      --kv-ui-border: #334155;
      --kv-ui-border-strong: #475569;
      --kv-ui-text: #f1f5f9;
      --kv-ui-text-2: #cbd5e1;
      --kv-ui-muted: #94a3b8;
      --kv-ui-subtle: #64748b;
      --kv-ui-hover: #273449;
      --kv-ui-danger: #f87171;
      --kv-ui-danger-line: #b91c1c;
      --kv-ui-warn: #f59e0b;
      --kv-ui-warn-soft: #3b2f12;
      --kv-ui-review: #8b5cf6;
      --kv-ui-review-text: #c4b5fd;
      --kv-ui-scheme: dark;
    }
  }
</style>
