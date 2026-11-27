<script lang="ts">
  import {
    BUILTIN_LOCALES,
    LOCALE_PATTERN,
    addLocale,
    exportTranslations,
    importTranslations,
    markReviewed,
    samePlaceholders,
    setTranslations,
    translateSurvey,
    translationTable,
    type SurveyInput,
    type TranslateFn,
    type TranslationFormat,
  } from "@kvesto/core";
  import type { DocumentState, SurveyDocument } from "../doc/document.js";

  let {
    doc,
    docState: view,
    translate,
  }: {
    doc: SurveyDocument;
    docState: DocumentState;
    /** Machine translation from the host (an AI model or a translation service). Without it the button is hidden. */
    translate?: TranslateFn;
  } = $props();

  // A plain copy: the core's translation helpers clone the survey, which reactive state can't be.
  const survey = $derived($state.snapshot(view.survey) as SurveyInput);
  const defaultLocale = $derived(survey.defaultLocale ?? "en");
  const others = $derived((survey.locales ?? []).filter((l) => l !== defaultLocale));
  let picked = $state("");
  const locale = $derived(others.includes(picked) ? picked : (others[0] ?? ""));
  const rows = $derived(locale ? translationTable(survey, locale) : []);
  const missing = $derived(rows.filter((r) => r.translation === undefined && r.source !== "").length);
  const toReview = $derived(rows.filter((r) => r.needsReview).length);
  let newLocale = $state("");
  let notice = $state("");
  let busy = $state(false);

  const apply = (next: SurveyInput, mergeKey?: string) => doc.replace($state.snapshot(next) as SurveyInput, mergeKey ? { mergeKey } : {});

  function addNewLocale() {
    const code = newLocale.trim();
    if (!LOCALE_PATTERN.test(code)) {
      notice = "Use a locale code such as de, fr or pt-BR.";
      return;
    }
    apply(addLocale(survey, code));
    picked = code;
    newLocale = "";
    notice = "";
  }

  function edit(key: string, value: string) {
    const r = setTranslations(survey, locale, { [key]: value });
    if (r.placeholderMismatches.length) {
      notice = "Keep every {placeholder} of the original text in the translation.";
      return;
    }
    notice = "";
    apply(r.survey, `translate.${locale}.${key}`);
  }

  function report(r: { applied: string[]; unknownKeys: string[]; placeholderMismatches: string[] }, what: string) {
    const parts = [`${what}: ${r.applied.length} ${r.applied.length === 1 ? "text" : "texts"}.`];
    if (r.placeholderMismatches.length) parts.push(`Skipped ${r.placeholderMismatches.length} that changed a {placeholder}: ${r.placeholderMismatches.join(", ")}.`);
    if (r.unknownKeys.length) parts.push(`Ignored ${r.unknownKeys.length} unknown ${r.unknownKeys.length === 1 ? "key" : "keys"}.`);
    notice = parts.join(" ");
  }

  async function machineTranslate() {
    if (!translate || !locale) return;
    busy = true;
    notice = "";
    try {
      const r = await translateSurvey(survey, locale, translate);
      apply(r.survey);
      report(r, "Drafted");
    } catch (e) {
      notice = `Translation failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
    }
  }

  const formats: { format: TranslationFormat; label: string; type: string; ext: string }[] = [
    { format: "csv", label: "CSV", type: "text/csv", ext: "csv" },
    { format: "xliff", label: "XLIFF", type: "application/xliff+xml", ext: "xlf" },
    { format: "json", label: "JSON (for AI tools)", type: "application/json", ext: "json" },
  ];

  function download(format: TranslationFormat) {
    const f = formats.find((x) => x.format === format)!;
    const blob = new Blob([exportTranslations(survey, locale, format)], { type: f.type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${survey.id}.${locale}.${f.ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function upload(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file || !locale) return;
    const name = file.name.toLowerCase();
    const format: TranslationFormat = name.endsWith(".csv") ? "csv" : name.endsWith(".json") ? "json" : "xliff";
    try {
      const r = importTranslations(survey, locale, await file.text(), format);
      apply(r.survey);
      report(r, "Imported");
    } catch (e) {
      notice = `Import failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const broken = (source: string, translation: string | undefined) => translation !== undefined && !samePlaceholders(source, translation);
</script>

<template lang="braceml">
  .kv-translations {
    .kv-translations-head {
      label {
        span 'Default language'
        input.kv-translations-code value={defaultLocale} readonly aria-readonly=true
      }
      if others.length {
        label {
          span 'Translate into'
          select value={locale} onchange={(e) => (picked = e.currentTarget.value)} {
            each others as l (l) {
              option value={l} '{l}'
            }
          }
        }
      }
      .kv-translations-add {
        input(
          list="kv-locale-codes"
          placeholder="de, fr, pt-BR…"
          aria-label="Language to add"
          value={newLocale}
          oninput={(e) => (newLocale = e.currentTarget.value)}
          onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addNewLocale())}
        )
        datalist#kv-locale-codes {
          each BUILTIN_LOCALES as l (l) {
            option value={l}
          }
        }
        button type=button onclick={addNewLocale} 'Add language'
      }
    }
    if notice {
      p.kv-translations-notice role=status '{notice}'
    }
    if !locale {
      p.kv-translations-empty 'Add a language to start translating. Texts you leave empty fall back to the default language.'
    } else {
      .kv-translations-actions {
        span.kv-translations-stats '{missing} missing · {toReview} to review'
        if translate {
          button.kv-translations-ai type=button disabled={busy || missing === 0} onclick={machineTranslate} '{busy ? "Translating…" : "Translate missing with AI"}'
        }
        if toReview {
          button type=button onclick={() => apply(markReviewed(survey, locale))} 'Mark all reviewed'
        }
        each formats as f (f.format) {
          button type=button onclick={() => download(f.format)} 'Export {f.label}'
        }
        label.kv-translations-import {
          span 'Import…'
          input type=file accept=".csv,.xlf,.xliff,.xml,.json" onchange={(e) => upload(e.currentTarget)}
        }
      }
      table.kv-translations-table {
        thead > tr {
          th scope=col 'Text'
          th scope=col '{defaultLocale}'
          th scope=col '{locale}'
        }
        tbody {
          each rows as row (row.key) {
            tr class:kv-translations-missing={row.translation === undefined && row.source !== ""} class:kv-translations-review={row.needsReview} {
              td.kv-translations-key '{row.key}'
              td '{row.source}'
              td {
                textarea(
                  rows=1
                  aria-label="{row.key} in {locale}"
                  value={row.translation ?? ""}
                  placeholder={row.source}
                  oninput={(e) => edit(row.key, e.currentTarget.value)}
                )
                if row.needsReview {
                  .kv-translations-flag {
                    span 'Machine translation, not checked yet'
                    button type=button onclick={() => apply(markReviewed(survey, locale, [row.key]))} 'Looks right'
                  }
                }
                if broken(row.source, row.translation) {
                  span.kv-translations-broken 'Placeholders differ from the original'
                }
              }
            }
          }
        }
      }
    }
  }
</template>

<style>
  .kv-translations { display: grid; gap: 0.6rem; font-size: 0.9rem; }
  .kv-translations-head, .kv-translations-actions, .kv-translations-add { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; }
  .kv-translations-head label { display: grid; gap: 0.15rem; }
  .kv-translations-code { width: 6rem; }
  .kv-translations input, .kv-translations select, .kv-translations button, .kv-translations textarea { font: inherit; font-size: 0.85rem; }
  .kv-translations button { cursor: pointer; }
  .kv-translations-notice { margin: 0; color: var(--kv-ui-accent-text, #1e40af); }
  .kv-translations-empty, .kv-translations-stats { margin: 0; color: var(--kv-ui-muted, #6b7280); }
  .kv-translations-import input { font-size: 0.8rem; }
  .kv-translations-table { border-collapse: collapse; width: 100%; }
  .kv-translations-table th, .kv-translations-table td { border-bottom: 1px solid var(--kv-ui-border, #e5e7eb); padding: 0.3rem 0.4rem; text-align: left; vertical-align: top; }
  .kv-translations-table textarea { width: 100%; box-sizing: border-box; resize: vertical; }
  .kv-translations-key { font-family: ui-monospace, monospace; font-size: 0.75rem; color: var(--kv-ui-muted, #6b7280); word-break: break-all; }
  .kv-translations-missing textarea { border-color: var(--kv-ui-warn, #f59e0b); background: var(--kv-ui-warn-soft, #fffbeb); }
  .kv-translations-review textarea { border-color: var(--kv-ui-review, #a78bfa); }
  .kv-translations-flag { display: flex; gap: 0.4rem; align-items: center; font-size: 0.78rem; color: var(--kv-ui-review-text, #6d28d9); }
  .kv-translations-broken { display: block; font-size: 0.78rem; color: var(--kv-ui-danger, #b91c1c); }
</style>
