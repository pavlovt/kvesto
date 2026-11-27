/**
 * Answer placeholders in display text: `{questionId}`, `{matrix.row}`,
 * `{grid.row.column}`, and `{$item.questionId}` inside a repeating panel.
 * `{{` and `}}` are literal braces. The core fills them in (`pipeText`); the
 * schema checks that they only refer to earlier questions.
 */

const PLACEHOLDER = /\{\{|\}\}|\{(\$item\.)?([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\}/g;

/** A placeholder found in text. */
export interface Placeholder {
  name: string;
  path: string[];
  scope?: "item";
}

/** The placeholders in a text, in order. Escaped braces are not placeholders. */
export function textPlaceholders(text: string): Placeholder[] {
  const out: Placeholder[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) {
    if (!m[2]) continue;
    const [name, ...path] = m[2].split(".");
    out.push({ name: name!, path, ...(m[1] ? { scope: "item" as const } : {}) });
  }
  return out;
}

/**
 * Replace each placeholder and escape in `text`. `fill` gets the placeholder
 * and returns its text, or null to leave it as written.
 */
export function replacePlaceholders(text: string, fill: (p: Placeholder, written: string) => string | null): string {
  if (!text.includes("{") && !text.includes("}")) return text;
  return text.replace(PLACEHOLDER, (whole: string, item: string | undefined, ref: string | undefined) => {
    if (whole === "{{") return "{";
    if (whole === "}}") return "}";
    const [name, ...path] = ref!.split(".");
    return fill({ name: name!, path, ...(item ? { scope: "item" as const } : {}) }, whole) ?? whole;
  });
}
