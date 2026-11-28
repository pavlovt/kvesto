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

  // Tailwind classes (prefixed `kv:`; see dashboard.css).
  const sectionButton = (on: boolean) =>
    "kv:font-inherit kv:text-[0.9rem] kv:cursor-pointer kv:border kv:text-inherit kv:py-1 kv:px-3 " +
    (on ? "kv:bg-ui-accent-soft kv:border-ui-accent-line" : "kv:bg-ui-surface kv:border-ui-border-strong");
</script>

<template lang="braceml">
  .kv-dashboard(
    class="kv:relative kv:bg-ui-bg kv:text-ui-fg kv:[color-scheme:var(--kv-ui-scheme,only_light)]"
    data-kv-ui-theme={uiTheme}
  ) {
    select.kv-dash-ui-theme(
      class="kv:absolute kv:top-0 kv:right-0 kv:font-inherit kv:text-[0.85rem]"
      aria-label="Dashboard theme"
      value={uiTheme}
      onchange={(e) => setTheme(e.currentTarget.value as typeof uiTheme)}
    ) {
      option value="light" 'Light'
      option value="dark" 'Dark'
      option value="auto" 'Auto'
    }
    if api {
      nav.kv-dash-sections class="kv:flex kv:gap-1 kv:[margin:0_0_1rem]" aria-label="Dashboard" {
        button type=button class={sectionButton(section === 'surveys')} aria-pressed={section === "surveys"} onclick={() => (section = "surveys")} 'Surveys'
        button type=button class={sectionButton(section === 'tokens')} aria-pressed={section === "tokens"} onclick={() => (section = "tokens")} 'API tokens'
        button type=button class={sectionButton(section === 'audit')} aria-pressed={section === "audit"} onclick={() => (section = "audit")} 'Audit log'
      }
    }
    if api && section === "tokens" {
      ApiTokens api={api}
    } else if api && section === "audit" {
      AuditLog api={api}
    } else if selected {
      p > button.kv-dash-back(
        type=button
        class="kv:font-inherit kv:[font-size:inherit] kv:text-ui-accent kv:bg-transparent kv:[border:0] kv:p-0 kv:cursor-pointer"
        onclick={() => (selected = null)}
      ) '← All surveys'
      SurveyResults storage={storage} surveyId={selected} locale={locale} api={api}
    } else {
      h1 class="kv:text-[1.5rem] kv:[margin:0_0_0.75rem]" 'Surveys'
      SurveyList storage={storage} onselect={(id) => (selected = id)}
    }
  }
</template>
