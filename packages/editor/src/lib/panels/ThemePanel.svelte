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

  // Tailwind classes used more than once (prefixed `kv:`; see editor.css).
  const labelClass = "kv:grid kv:grid-cols-[9rem_1fr] kv:gap-[0.4rem] kv:items-center";
  const controlClass = "kv:font-inherit kv:text-[0.85rem] kv:min-w-0";
</script>

<template lang="braceml">
  .kv-theme class="kv:grid kv:gap-2 kv:text-[0.9rem] kv:[align-content:start]" {
    p.kv-theme-hint class="kv:m-0 kv:text-ui-muted" 'The look of the survey for respondents. The preview shows it as you change it.'
    label class={labelClass} {
      span 'Preset'
      select class={controlClass} value={preset} onchange={(e) => save({ ...theme, preset: e.currentTarget.value })} {
        each THEME_PRESETS as p (p) {
          option value={p} '{p}'
        }
      }
    }
    .kv-theme-vars class="kv:grid kv:gap-[0.3rem]" {
      each THEME_VARIABLES as v (v.name) {
        label class={labelClass} {
          span '{v.name}'
          if v.kind === "color" {
            .kv-theme-color class="kv:flex kv:gap-[0.3rem]" {
              input class="{controlClass} kv:w-[2.2rem] kv:p-0 kv:[border:0] kv:bg-transparent" type=color aria-label="{v.name} colour" value={asHex(theme[v.name], v.default)} oninput={(e) => setVar(v.name, e.currentTarget.value)}
              input class={controlClass} aria-label={v.name} placeholder={v.default} value={theme[v.name] ?? ""} oninput={(e) => setVar(v.name, e.currentTarget.value)}
            }
          } else {
            input class={controlClass} aria-label={v.name} placeholder={v.default} value={theme[v.name] ?? ""} oninput={(e) => setVar(v.name, e.currentTarget.value)}
          }
        }
      }
    }
    button class={`${controlClass} kv:[justify-self:start] kv:cursor-pointer`} type=button onclick={() => save({})} 'Reset to the default look'
    h3 class="kv:[margin:0.5rem_0_0] kv:text-[0.95rem]" 'Export'
    label class={labelClass} {
      span 'CSS'
      textarea.kv-theme-export class={controlClass} readonly rows=6 value={css}
    }
    label class={labelClass} {
      span 'JSON (settings.theme)'
      textarea.kv-theme-export class={controlClass} readonly rows=4 value={json}
    }
  }
</template>
