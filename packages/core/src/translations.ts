/**
 * Translating a survey: list its texts per locale, export them for a
 * translator or an AI tool (CSV, XLIFF 2.0 or JSON), import them back, and
 * fill a new locale with machine-translated drafts through a host function.
 * Answer placeholders such as `{name}` must come back unchanged; a
 * translation that drops or changes one is refused and reported.
 */
import { mapTexts, surveyTexts, textIn, textOf, textPlaceholders, withText, type LocalizedText } from "@kvesto/schema";

type SurveyLike = {
  defaultLocale?: string;
  locales?: string[];
  translationsToReview?: Record<string, string[]>;
};

/** One text of a survey, for one locale. */
export interface TranslationRow {
  /** Stable key, such as `q1.title` or `q1.choices.yes`. */
  key: string;
  /** The text in the default locale. */
  source: string;
  /** The text in the target locale, if there is one. */
  translation?: string;
  /** Machine-translated and not checked by a person yet. */
  needsReview: boolean;
}

const defaultOf = (survey: SurveyLike) => survey.defaultLocale ?? "en";

/** Every text of the survey with its translation into `locale`, in document order. */
export function translationTable(survey: SurveyLike, locale: string): TranslationRow[] {
  const dl = defaultOf(survey);
  const review = new Set(survey.translationsToReview?.[locale] ?? []);
  return surveyTexts(survey).map(({ key, text }) => {
    const translation = textIn(text, locale, dl);
    return {
      key,
      source: textOf(text, dl, dl),
      ...(translation !== undefined ? { translation } : {}),
      needsReview: review.has(key),
    };
  });
}

/** Do two texts have the same answer placeholders (`{q}`, `{$item.q}`, …), as many times each? */
export function samePlaceholders(a: string, b: string): boolean {
  const sig = (t: string) =>
    textPlaceholders(t)
      .map((p) => `${p.scope ?? ""}:${[p.name, ...p.path].join(".")}`)
      .sort()
      .join("|");
  return sig(a) === sig(b);
}

export interface TranslationResult<S> {
  survey: S;
  /** Keys whose text was set. */
  applied: string[];
  /** Keys that are not texts of this survey (it may have changed since the export). */
  unknownKeys: string[];
  /** Keys refused because the translation's placeholders differ from the source's. */
  placeholderMismatches: string[];
}

/**
 * Set translations into `locale`. An empty string removes that translation.
 * With `review: true` the texts are recorded as needing a person's check
 * (machine translations); otherwise setting a text marks it as checked.
 * The locale is added to `locales`.
 */
export function setTranslations<S extends SurveyLike>(
  survey: S,
  locale: string,
  entries: Record<string, string>,
  { review = false }: { review?: boolean } = {},
): TranslationResult<S> {
  const dl = defaultOf(survey);
  const known = new Set(surveyTexts(survey).map((t) => t.key));
  const applied: string[] = [];
  const placeholderMismatches: string[] = [];
  const unknownKeys = Object.keys(entries).filter((k) => !known.has(k));
  let next = mapTexts(survey, (text, key) => {
    if (!Object.hasOwn(entries, key)) return text;
    const value = entries[key]!;
    if (value !== "" && locale !== dl && !samePlaceholders(textOf(text, dl, dl), value)) {
      placeholderMismatches.push(key);
      return text;
    }
    applied.push(key);
    return withText(text, locale, value, dl) as string | LocalizedText;
  });
  if (locale !== dl && applied.length) {
    const locales = new Set([dl, ...(next.locales ?? []), locale]);
    const toReview = new Set(next.translationsToReview?.[locale] ?? []);
    for (const k of applied) {
      if (review && entries[k] !== "") toReview.add(k);
      else toReview.delete(k);
    }
    const reviews = { ...next.translationsToReview, [locale]: [...toReview] };
    if (!toReview.size) delete reviews[locale];
    next = { ...next, locales: [...locales] };
    if (Object.keys(reviews).length) next.translationsToReview = reviews;
    else delete next.translationsToReview;
  }
  return { survey: next, applied, unknownKeys, placeholderMismatches };
}

/** Mark machine-translated texts as checked: the given keys, or all of them in `locale`. */
export function markReviewed<S extends SurveyLike>(survey: S, locale: string, keys?: string[]): S {
  const left = (survey.translationsToReview?.[locale] ?? []).filter((k) => keys && !keys.includes(k));
  const reviews = { ...survey.translationsToReview, [locale]: left };
  if (!left.length) delete reviews[locale];
  const { translationsToReview: _old, ...rest } = survey;
  return (Object.keys(reviews).length ? { ...rest, translationsToReview: reviews } : rest) as S;
}

/** Add a locale to the survey's `locales`, without any translations yet. */
export function addLocale<S extends SurveyLike>(survey: S, locale: string): S {
  const dl = defaultOf(survey);
  return { ...survey, locales: [...new Set([dl, ...(survey.locales ?? []), locale])] };
}

// ── Files ────────────────────────────────────────────────────────────────────

export type TranslationFormat = "csv" | "xliff" | "json";

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const xml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unxml = (v: string) =>
  v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/**
 * The texts of a survey with their translations into `locale`, as a file:
 * CSV (`key,source,translation`), XLIFF 2.0, or JSON. The JSON file is
 * meant to be handed to a person or an AI tool as it is: it says what to do
 * and what to keep.
 */
export function exportTranslations(survey: SurveyLike & { id?: string }, locale: string, format: TranslationFormat): string {
  const dl = defaultOf(survey);
  const rows = translationTable(survey, locale);
  if (format === "csv") {
    return ["key,source,translation", ...rows.map((r) => [r.key, r.source, r.translation ?? ""].map(csvCell).join(","))].join("\r\n") + "\r\n";
  }
  if (format === "xliff") {
    const units = rows
      .map((r) => {
        const target = r.translation !== undefined ? `<target>${xml(r.translation)}</target>` : "";
        return `    <unit id="${xml(r.key)}"><segment><source>${xml(r.source)}</source>${target}</segment></unit>`;
      })
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="${xml(dl)}" trgLang="${xml(locale)}">
  <file id="${xml(survey.id ?? "survey")}">
${units}
  </file>
</xliff>
`;
  }
  return `${JSON.stringify(
    {
      instructions:
        `Translate each "source" from ${dl} into ${locale} and write it in "translation". ` +
        "Keep everything in braces, such as {name} or {$item.age}, exactly as it is, and keep Markdown such as **bold** and [links](https://…). " +
        "Do not change the keys.",
      sourceLocale: dl,
      targetLocale: locale,
      strings: Object.fromEntries(rows.map((r) => [r.key, { source: r.source, translation: r.translation ?? "" }])),
    },
    null,
    2,
  )}\n`;
}

/** Parse CSV text (RFC 4180: quoted cells, doubled quotes, newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** The key → translation pairs in a translation file (empty translations are skipped). */
export function parseTranslations(content: string, format: TranslationFormat): Record<string, string> {
  const out: Record<string, string> = {};
  if (format === "csv") {
    const [head, ...rows] = parseCsv(content.replace(/^﻿/, ""));
    const keyAt = head?.indexOf("key") ?? -1;
    const valueAt = head?.indexOf("translation") ?? -1;
    if (keyAt < 0 || valueAt < 0) throw new Error('A translation CSV needs "key" and "translation" columns');
    for (const r of rows) if (r[keyAt] && r[valueAt]) out[r[keyAt]!] = r[valueAt]!;
    return out;
  }
  if (format === "xliff") {
    const unit = /<unit\b[^>]*\bid="([^"]*)"[^>]*>([\s\S]*?)<\/unit>/g;
    for (const m of content.matchAll(unit)) {
      const target = /<target\b[^>]*>([\s\S]*?)<\/target>/.exec(m[2]!);
      if (target && target[1] !== "") out[unxml(m[1]!)] = unxml(target[1]!);
    }
    return out;
  }
  const data = JSON.parse(content) as { strings?: Record<string, string | { translation?: string }> };
  for (const [key, v] of Object.entries(data.strings ?? (data as Record<string, string | { translation?: string }>))) {
    const value = typeof v === "string" ? v : v?.translation;
    if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

/**
 * Import a translation file into `locale`. Placeholder mismatches and keys
 * the survey doesn't have are reported, not applied. Imported texts count as
 * checked unless `review` is set.
 */
export function importTranslations<S extends SurveyLike>(
  survey: S,
  locale: string,
  content: string,
  format: TranslationFormat,
  options: { review?: boolean } = {},
): TranslationResult<S> {
  return setTranslations(survey, locale, parseTranslations(content, format), options);
}

// ── Machine translation ──────────────────────────────────────────────────────

/**
 * Translates texts, e.g. by calling an AI model or a translation service.
 * Gets the texts by key and returns the translations by key (missing keys
 * are left untranslated). Kvesto bundles no translation service.
 */
export type TranslateFn = (
  texts: Record<string, string>,
  from: string,
  to: string,
) => Promise<Record<string, string>> | Record<string, string>;

/**
 * Fill `to` with machine-translated drafts through `translate`: only texts
 * that have no translation yet, unless `overwrite` is set. Drafts are marked
 * as needing review until a person confirms them (`markReviewed`), and a
 * draft that breaks a placeholder is refused and reported.
 */
export async function translateSurvey<S extends SurveyLike>(
  survey: S,
  to: string,
  translate: TranslateFn,
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<TranslationResult<S>> {
  const from = defaultOf(survey);
  const todo = Object.fromEntries(
    translationTable(survey, to)
      .filter((r) => r.source !== "" && (overwrite || r.translation === undefined))
      .map((r) => [r.key, r.source]),
  );
  if (!Object.keys(todo).length) return { survey: addLocale(survey, to), applied: [], unknownKeys: [], placeholderMismatches: [] };
  const drafts = await translate(todo, from, to);
  const wanted = Object.fromEntries(Object.entries(drafts).filter(([k, v]) => Object.hasOwn(todo, k) && typeof v === "string" && v !== ""));
  const result = setTranslations(addLocale(survey, to), to, wanted, { review: true });
  return { ...result, unknownKeys: Object.keys(drafts).filter((k) => !Object.hasOwn(todo, k)) };
}
