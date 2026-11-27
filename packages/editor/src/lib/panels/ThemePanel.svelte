<script lang="ts">
  import { THEME_PRESETS, THEME_VARIABLES, themeToCss, type Theme } from "@kvesto/core";
  import type { DocumentState, SurveyDocument } from "../doc/document.js";

  let { doc, docState: view }: { doc: SurveyDocument; docState: DocumentState } = $props();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Loose = Record<string, any>;
  const settings = $derived(((view.survey as Loose).settings ?? {}) as Loose);
  /** The survey's theme as an object: `{ preset?, …variables }`. */
  const theme = $derived.by((): Record<string, string> => {
    const t = settings.theme as Theme | undefined;
    if (!t) return {};
    return typeof t === "string" ? { preset: t } : { ...(t as Record<string, string>) };
  });
  const preset = $derived(theme.preset ?? "light");

  function save(next: Record<string, string>, mergeKey?: string) {
    const clean = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== "" && !(k === "preset" && v === "light")));
    const keys = Object.keys(clean);
    // A preset alone is stored as its name; nothing at all removes the setting.
    const value: Theme | undefined = !keys.length ? undefined : keys.length === 1 && clean.preset ? (clean.preset as Theme) : (clean as Theme);
    const nextSettings = { ...settings, theme: value };
    if (value === undefined) delete nextSettings.theme;
    doc.updateSurvey({ settings: Object.keys(nextSettings).length ? nextSettings : undefined } as Loose, mergeKey ? { mergeKey } : {});
  }
  const setVar = (name: string, value: string) => save({ ...theme, [name]: value }, `theme.${name}`);
  // A colour input needs #rrggbb; other values (rgba, inherit) show as black until changed.
  const asHex = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : /^#[0-9a-f]{6}$/i.test(fallback) ? fallback : "#000000");
  const css = $derived(themeToCss((Object.keys(theme).length ? theme : "light") as Theme));
  const json = $derived(JSON.stringify(settings.theme ?? "light", null, 2));
</script>

<template lang="braceml">
  .kv-theme {
    p.kv-theme-hint 'The look of the survey for respondents. The preview shows it as you change it.'
    label {
      span 'Preset'
      select value={preset} onchange={(e) => save({ ...theme, preset: e.currentTarget.value })} {
        each THEME_PRESETS as p (p) {
          option value={p} '{p}'
        }
      }
    }
    .kv-theme-vars {
      each THEME_VARIABLES as v (v.name) {
        label {
          span '{v.name}'
          if v.kind === "color" {
            .kv-theme-color {
              input type=color aria-label="{v.name} colour" value={asHex(theme[v.name], v.default)} oninput={(e) => setVar(v.name, e.currentTarget.value)}
              input aria-label={v.name} placeholder={v.default} value={theme[v.name] ?? ""} oninput={(e) => setVar(v.name, e.currentTarget.value)}
            }
          } else {
            input aria-label={v.name} placeholder={v.default} value={theme[v.name] ?? ""} oninput={(e) => setVar(v.name, e.currentTarget.value)}
          }
        }
      }
    }
    button type=button onclick={() => save({})} 'Reset to the default look'
    h3 'Export'
    label {
      span 'CSS'
      textarea.kv-theme-export readonly rows=6 value={css}
    }
    label {
      span 'JSON (settings.theme)'
      textarea.kv-theme-export readonly rows=4 value={json}
    }
  }
</template>

<style>
  .kv-theme { display: grid; gap: 0.5rem; font-size: 0.9rem; align-content: start; }
  .kv-theme label { display: grid; grid-template-columns: 9rem 1fr; gap: 0.4rem; align-items: center; }
  .kv-theme-vars { display: grid; gap: 0.3rem; }
  .kv-theme-color { display: flex; gap: 0.3rem; }
  .kv-theme-color input[type="color"] { width: 2.2rem; padding: 0; border: 0; background: none; }
  .kv-theme input, .kv-theme select, .kv-theme textarea, .kv-theme button { font: inherit; font-size: 0.85rem; min-width: 0; }
  .kv-theme button { justify-self: start; cursor: pointer; }
  .kv-theme-export { font-family: ui-monospace, monospace; font-size: 0.8rem; }
  .kv-theme-hint { margin: 0; color: var(--kv-ui-muted, #6b7280); }
  .kv-theme h3 { margin: 0.5rem 0 0; font-size: 0.95rem; }
</style>
