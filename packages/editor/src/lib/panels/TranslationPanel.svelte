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

  // Tailwind classes used more than once (prefixed `kv:`; see editor.css).
  const controlClass = "kv:font-inherit kv:text-[0.85rem]";
  const buttonClass = `${controlClass} kv:cursor-pointer`;
  const barClass = "kv:flex kv:flex-wrap kv:gap-2 kv:[align-items:end]";
  const cellClass = "kv:border-b kv:border-b-ui-border kv:py-[0.3rem] kv:px-[0.4rem] kv:text-left kv:align-top";
  const translationClass = (missing: boolean, review: boolean) =>
    `${controlClass} kv:w-full kv:box-border kv:resize-y` +
    (missing ? " kv:bg-ui-warn-soft" : "") +
    (review ? " kv:border-ui-review" : missing ? " kv:border-ui-warn" : "");
</script>

<template lang="braceml">
  .kv-translations class="kv:grid kv:gap-[0.6rem] kv:text-[0.9rem]" {
    .kv-translations-head class={barClass} {
      label class="kv:grid kv:gap-[0.15rem]" {
        span 'Default language'
        input.kv-translations-code class={`${controlClass} kv:w-24`} value={defaultLocale} readonly aria-readonly=true
      }
      if others.length {
        label class="kv:grid kv:gap-[0.15rem]" {
          span 'Translate into'
          select class={controlClass} value={locale} onchange={(e) => (picked = e.currentTarget.value)} {
            each others as l (l) {
              option value={l} '{l}'
            }
          }
        }
      }
      .kv-translations-add class={barClass} {
        input(
          class={controlClass}
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
        button class={buttonClass} type=button onclick={addNewLocale} 'Add language'
      }
    }
    if notice {
      p.kv-translations-notice class="kv:m-0 kv:text-ui-accent-text" role=status '{notice}'
    }
    if !locale {
      p.kv-translations-empty class="kv:m-0 kv:text-ui-muted" 'Add a language to start translating. Texts you leave empty fall back to the default language.'
    } else {
      .kv-translations-actions class={barClass} {
        span.kv-translations-stats class="kv:m-0 kv:text-ui-muted" '{missing} missing · {toReview} to review'
        if translate {
          button.kv-translations-ai class={buttonClass} type=button disabled={busy || missing === 0} onclick={machineTranslate} '{busy ? "Translating…" : "Translate missing with AI"}'
        }
        if toReview {
          button class={buttonClass} type=button onclick={() => apply(markReviewed(survey, locale))} 'Mark all reviewed'
        }
        each formats as f (f.format) {
          button class={buttonClass} type=button onclick={() => download(f.format)} 'Export {f.label}'
        }
        label.kv-translations-import {
          span 'Import…'
          input class="kv:font-inherit kv:text-[0.8rem]" type=file accept=".csv,.xlf,.xliff,.xml,.json" onchange={(e) => upload(e.currentTarget)}
        }
      }
      table.kv-translations-table class="kv:border-collapse kv:w-full" {
        thead > tr {
          th class={cellClass} scope=col 'Text'
          th class={cellClass} scope=col '{defaultLocale}'
          th class={cellClass} scope=col '{locale}'
        }
        tbody {
          each rows as row (row.key) {
            tr class:kv-translations-missing={row.translation === undefined && row.source !== ""} class:kv-translations-review={row.needsReview} {
              td.kv-translations-key class={`${cellClass} kv:[font-family:ui-monospace,monospace] kv:text-[0.75rem] kv:text-ui-muted kv:break-all`} '{row.key}'
              td class={cellClass} '{row.source}'
              td class={cellClass} {
                textarea(
                  class={translationClass(row.translation === undefined && row.source !== '', Boolean(row.needsReview))}
                  rows=1
                  aria-label="{row.key} in {locale}"
                  value={row.translation ?? ""}
                  placeholder={row.source}
                  oninput={(e) => edit(row.key, e.currentTarget.value)}
                )
                if row.needsReview {
                  .kv-translations-flag class="kv:flex kv:gap-[0.4rem] kv:items-center kv:text-[0.78rem] kv:text-ui-review-text" {
                    span 'Machine translation, not checked yet'
                    button class={buttonClass} type=button onclick={() => apply(markReviewed(survey, locale, [row.key]))} 'Looks right'
                  }
                }
                if broken(row.source, row.translation) {
                  span.kv-translations-broken class="kv:block kv:text-[0.78rem] kv:text-ui-danger" 'Placeholders differ from the original'
                }
              }
            }
          }
        }
      }
    }
  }
</template>
