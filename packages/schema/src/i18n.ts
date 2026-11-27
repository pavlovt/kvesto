/**
 * Localized display text. Any human-readable string in a survey may be a
 * plain string (the default locale) or an object of strings per locale:
 * `"title": { "en": "Your name", "bg": "Вашето име" }`.
 *
 * `mapTexts` is the one list of every translatable field. Localizing a
 * survey, the translation keys and translation import/export all use it.
 */

/** Text per locale, such as `{ "en": "Hello", "de": "Hallo" }`. */
export type LocalizedText = Record<string, string>;

/** A locale code such as `en`, `pt-BR` or `zh-Hans`. */
export const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** The text for `locale`: the exact locale, then its language (`pt` for `pt-BR`), then the default, then any. */
export function textOf(text: string | LocalizedText | undefined | null, locale?: string, defaultLocale?: string): string {
  if (text === undefined || text === null) return "";
  if (typeof text === "string") return text;
  const tries = [locale, locale?.split("-")[0], defaultLocale, defaultLocale?.split("-")[0]];
  for (const l of tries) if (l && typeof text[l] === "string" && text[l] !== "") return text[l]!;
  return Object.values(text).find((v) => typeof v === "string" && v !== "") ?? "";
}

/** The text of exactly one locale (no fallback), or undefined. A plain string belongs to the default locale. */
export function textIn(text: string | LocalizedText | undefined, locale: string, defaultLocale: string): string | undefined {
  if (text === undefined) return undefined;
  if (typeof text === "string") return locale === defaultLocale ? text : undefined;
  const v = text[locale];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/**
 * Set one locale's text. A plain string stays plain while only the default
 * locale is involved; it becomes an object as soon as another locale is set.
 * An empty value removes that locale.
 */
export function withText(
  text: string | LocalizedText | undefined,
  locale: string,
  value: string,
  defaultLocale: string,
): string | LocalizedText | undefined {
  if (typeof text === "string" || text === undefined) {
    if (locale === defaultLocale) return value === "" ? undefined : value;
    const base: LocalizedText = text === undefined ? {} : { [defaultLocale]: text };
    if (value !== "") base[locale] = value;
    return Object.keys(base).length ? base : undefined;
  }
  const next = { ...text };
  if (value === "") delete next[locale];
  else next[locale] = value;
  const keys = Object.keys(next);
  if (!keys.length) return undefined;
  // Back to a plain string when only the default locale is left.
  return keys.length === 1 && keys[0] === defaultLocale ? next[defaultLocale] : next;
}

type Json = Record<string, unknown>;
type TextValue = string | LocalizedText;
const isText = (v: unknown): v is TextValue =>
  typeof v === "string" || (typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string"));

const ELEMENT_FIELDS = ["title", "description", "placeholder", "labelTrue", "labelFalse", "markdown", "alt", "prefix", "suffix", "unit"];
const LIST_FIELDS = ["choices", "rows", "columns", "items"];

/**
 * Visit every display text in survey JSON with a stable key, and replace it
 * with what `fn` returns (undefined removes the field). Returns a new
 * document; the input is not changed. Keys look like `survey.title`,
 * `page.p1.title`, `q1.title`, `q1.choices.yes`, `grid.columns.c1.choices.a`,
 * `kids.repeat.itemTitle` and `q1.validators.0.message`.
 */
export function mapTexts<S>(survey: S, fn: (text: TextValue, key: string) => TextValue | undefined): S {
  // A JSON copy: surveys are plain JSON, and unlike structuredClone this also copies reactive proxies (Svelte state).
  const doc = JSON.parse(JSON.stringify(survey)) as Json;
  const field = (obj: Json, name: string, key: string) => {
    const v = obj[name];
    if (v === undefined || !isText(v)) return;
    const next = fn(v, key);
    if (next === undefined) delete obj[name];
    else obj[name] = next;
  };
  const list = (items: unknown, key: string) => {
    if (!Array.isArray(items)) return;
    for (const item of items as Json[]) {
      if (typeof item !== "object" || item === null) continue;
      const k = `${key}.${String(item.value)}`;
      field(item, "label", k);
      if (Array.isArray(item.choices)) list(item.choices, `${k}.choices`);
    }
  };
  const element = (el: Json) => {
    const id = String(el.id);
    for (const name of ELEMENT_FIELDS) field(el, name, `${id}.${name}`);
    for (const name of LIST_FIELDS) list(el[name], `${id}.${name}`);
    const repeat = el.repeat as Json | undefined;
    if (repeat && typeof repeat === "object") for (const name of ["addLabel", "removeLabel", "itemTitle"]) field(repeat, name, `${id}.repeat.${name}`);
    if (Array.isArray(el.validators)) (el.validators as Json[]).forEach((v, i) => field(v, "message", `${id}.validators.${i}.message`));
    if (Array.isArray(el.elements)) for (const child of el.elements as Json[]) element(child);
  };
  for (const name of ["title", "description", "completedText"]) field(doc, name, `survey.${name}`);
  for (const page of (doc.pages as Json[] | undefined) ?? []) {
    field(page, "title", `page.${String(page.id)}.title`);
    for (const el of (page.elements as Json[] | undefined) ?? []) element(el);
  }
  return doc as S;
}

/** Every display text in a survey, keyed as in `mapTexts`, in document order. */
export function surveyTexts(survey: unknown): { key: string; text: TextValue }[] {
  const out: { key: string; text: TextValue }[] = [];
  mapTexts(survey, (text, key) => {
    out.push({ key, text });
    return text;
  });
  return out;
}

/**
 * The survey with every display text resolved to a plain string for
 * `locale` (falling back to the language, then the default locale). This is
 * what a runner shows; the original keeps every translation.
 */
export function localizeSurvey<S extends { defaultLocale?: string }>(survey: S, locale?: string): S {
  const defaultLocale = survey.defaultLocale ?? "en";
  return mapTexts(survey, (text) => textOf(text, locale ?? defaultLocale, defaultLocale));
}
