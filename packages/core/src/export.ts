/**
 * Responses as CSV. Columns come from `responseColumns`, so the CSV, the
 * dashboard table and the Excel export (in `@kvesto/export`) agree.
 */
import type { Survey, SurveyResponse } from "@kvesto/schema";
import { responseColumns, responseRow } from "./table.js";

export interface ExportOptions {
  /** Choice values instead of labels. Default false (labels). */
  values?: boolean;
  /** Labels in this locale. */
  locale?: string;
}

/** The header and rows of an export: response columns first, then answers, then hidden fields. */
export function exportTable(survey: Survey, responses: SurveyResponse[], options: ExportOptions = {}): { header: string[]; rows: string[][] } {
  const columns = responseColumns(survey, responses, options.locale);
  const hidden = survey.hiddenFields ?? [];
  const header = ["id", "submitted", "status", ...columns.map((c) => (options.values ? c.key : c.label)), ...hidden.map((h) => `hidden.${h}`)];
  const rows = responses.map((r) => {
    const cells = responseRow(survey, columns, r, options);
    const h = (r.meta?.hidden ?? {}) as Record<string, unknown>;
    return [
      r.id,
      r.createdAt,
      r.status ?? "complete",
      ...columns.map((c) => cells[c.key] ?? ""),
      ...hidden.map((name) => (typeof h[name] === "string" ? (h[name] as string) : "")),
    ];
  });
  return { header, rows };
}

/**
 * A cell that a spreadsheet would run as a formula (`=`, `+`, `-`, `@`, tab or
 * carriage return first) gets a leading apostrophe, so an answer can never
 * execute in Excel or Sheets (CSV injection).
 */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const csvCell = (v: string) => {
  const s = safeCell(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Responses as CSV (RFC 4180, CRLF line ends, with a byte order mark so Excel reads UTF-8). */
export function responsesToCsv(survey: Survey, responses: SurveyResponse[], options: ExportOptions = {}): string {
  const { header, rows } = exportTable(survey, responses, options);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
