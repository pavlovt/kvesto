/**
 * Responses as a table: one column per answer part (matrix rows, grid cells,
 * multi-text fields and repeat items get their own columns), and filters over
 * responses. Used by the dashboard's table view and by exports.
 */
import { allQuestions, localizeSurvey, textOf, walkElements, type Condition, type Question, type Survey, type SurveyResponse } from "@kvesto/schema";
import { evaluateCondition, repeatItems } from "./logic.js";
import { formatAnswer } from "./piping.js";

export interface ResponseColumn {
  /** Stable key: `q`, `matrix.row`, `grid.row.column`, `multi.field`, `panel.1.q` (repeat items count from 1). */
  key: string;
  /** Header text: the question title, with the part after it. */
  label: string;
  questionId: string;
  /** For answers inside a repeating panel. */
  repeat?: { panelId: string; index: number };
}

/**
 * The answer columns of a survey. Repeating panels get one set of columns per
 * item, up to the most items any of `responses` has.
 */
export function responseColumns(survey: Survey, responses: SurveyResponse[] = [], locale?: string): ResponseColumn[] {
  const s = localizeSurvey(survey, locale);
  const repeatOf = new Map<string, string>();
  walkElements(s, (el, at) => {
    if (at.repeat) repeatOf.set(el.id, at.repeat);
  });
  const partsOf = (q: Question): { key: string; label: string }[] => {
    const title = textOf(q.title);
    switch (q.type) {
      case "matrix":
        return q.rows.map((r) => ({ key: r.value, label: `${title}: ${textOf(r.label)}` }));
      case "grid":
        return q.rows.flatMap((r) => q.columns.map((c) => ({ key: `${r.value}.${c.value}`, label: `${title}: ${textOf(r.label)} / ${textOf(c.label)}` })));
      case "multi-text":
        return q.items.map((i) => ({ key: i.value, label: `${title}: ${textOf(i.label)}` }));
      default:
        return [{ key: "", label: title }];
    }
  };
  const maxItems = new Map<string, number>();
  for (const r of responses) {
    for (const panel of new Set(repeatOf.values())) maxItems.set(panel, Math.max(maxItems.get(panel) ?? 0, repeatItems(r.answers[panel]).length));
  }
  const out: ResponseColumn[] = [];
  for (const q of allQuestions(s)) {
    const panel = repeatOf.get(q.id);
    const parts = partsOf(q);
    if (!panel) {
      for (const p of parts) out.push({ key: p.key ? `${q.id}.${p.key}` : q.id, label: p.label, questionId: q.id });
      continue;
    }
    for (let i = 1; i <= (maxItems.get(panel) ?? 0); i++) {
      for (const p of parts) {
        out.push({
          key: `${panel}.${i}.${q.id}${p.key ? `.${p.key}` : ""}`,
          label: `${p.label} (${i})`,
          questionId: q.id,
          repeat: { panelId: panel, index: i - 1 },
        });
      }
    }
  }
  return out;
}

/**
 * One response as `column key → text` (choice values shown as labels, or
 * kept as values with `values: true`). Missing answers are "".
 */
export function responseRow(
  survey: Survey,
  columns: ResponseColumn[],
  response: SurveyResponse,
  { values = false, locale }: { values?: boolean; locale?: string } = {},
): Record<string, string> {
  const s = localizeSurvey(survey, locale);
  const questions = new Map(allQuestions(s).map((q) => [q.id, q]));
  const row: Record<string, string> = {};
  for (const col of columns) {
    const q = questions.get(col.questionId);
    const source = col.repeat ? (repeatItems(response.answers[col.repeat.panelId])[col.repeat.index] ?? {}) : response.answers;
    const prefix = col.repeat ? `${col.repeat.panelId}.${col.repeat.index + 1}.${col.questionId}` : col.questionId;
    const path = col.key === prefix ? [] : col.key.slice(prefix.length + 1).split(".");
    const value = source[col.questionId];
    if (values) {
      let v: unknown = value;
      for (const p of path) v = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>)[p] : undefined;
      row[col.key] = v === undefined || v === null ? "" : Array.isArray(v) ? v.map((x) => (typeof x === "object" ? (x as { name?: string }).name ?? "" : String(x))).join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    } else {
      row[col.key] = formatAnswer(q, value, path);
    }
  }
  return row;
}

/** What to keep when filtering responses. Everything is optional; all given parts must hold. */
export interface ResponseFilter {
  /** "complete" (default), "partial" or "all". */
  status?: "complete" | "partial" | "all";
  /** Created on or after this ISO date or date-time. */
  from?: string;
  /** Created on or before this ISO date (the whole day) or date-time. */
  to?: string;
  /** Hidden field values that must match. */
  hidden?: Record<string, string>;
  /** A condition over the answers, in the survey's own condition format. */
  where?: Condition;
}

/** The responses that match a filter. */
export function filterResponses(responses: SurveyResponse[], filter: ResponseFilter = {}): SurveyResponse[] {
  const { status = "complete", from, to, hidden = {}, where } = filter;
  // A bare date for `to` means the end of that day.
  const until = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to;
  return responses.filter((r) => {
    const st = r.status ?? "complete";
    if (status !== "all" && st !== status) return false;
    if (from && r.createdAt < from) return false;
    if (until && r.createdAt > until) return false;
    const h = (r.meta?.hidden ?? {}) as Record<string, unknown>;
    if (Object.entries(hidden).some(([k, v]) => v !== "" && h[k] !== v)) return false;
    if (where && !evaluateCondition(where, r.answers)) return false;
    return true;
  });
}
