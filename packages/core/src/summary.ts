import { repeatItems } from "./logic.js";
import { allQuestions, walkElements, type AnswerValue, type FileAnswer, type Question, type Survey, type SurveyResponse } from "@kvesto/schema";

export interface MatrixRowSummary {
  value: string;
  label: string;
  answered: number;
  counts: { value: string; label: string; count: number }[];
}

export interface RankingSummary {
  value: string;
  label: string;
  /** Mean position, 1 = ranked first. */
  averageRank: number;
  /** How many respondents put this item first. */
  firstPlace: number;
}

/** A panel around a summarized question. */
export interface PanelHeading {
  id: string;
  title?: string;
}

export interface QuestionSummary {
  question: Question;
  /** The panels the question sits in, outermost first (for group headings). Empty when it is not in a panel. */
  panels: PanelHeading[];
  /** For questions inside a repeating panel: that panel's id. Counts are then over all items, not responses. */
  repeat?: string;
  answered: number;
  /** For choice, dropdown, boolean and rating questions: count per option. */
  counts?: { value: string; label: string; count: number }[];
  /** For rating questions. */
  average?: number;
  /** For text and comment questions: the most recent answers. */
  samples?: string[];
  /** For matrix questions: column counts per row. */
  matrix?: MatrixRowSummary[];
  /** For ranking questions: items ordered by average rank, best first. */
  ranking?: RankingSummary[];
  /** For file questions: the most recent files, and how many were uploaded in total. */
  files?: FileAnswer[];
  fileCount?: number;
}

/** Aggregate responses per question. Used by the dashboard; handy for custom reports too. */
export function summarizeResponses(survey: Survey, responses: SurveyResponse[], sampleSize = 5): QuestionSummary[] {
  const headings = new Map<string, PanelHeading>();
  const panelsOf = new Map<string, PanelHeading[]>();
  const repeatOf = new Map<string, string>();
  walkElements(survey, (el, at) => {
    if (el.type === "panel") headings.set(el.id, { id: el.id, ...(el.title ? { title: el.title } : {}) });
    else panelsOf.set(el.id, at.panels.map((id) => headings.get(id)!));
    if (at.repeat) repeatOf.set(el.id, at.repeat);
  });
  // A question inside a repeating panel is summarised over every item of every response.
  const answersTo = (questionId: string): (AnswerValue | undefined)[] => {
    const repeat = repeatOf.get(questionId);
    return repeat
      ? responses.flatMap((r) => repeatItems(r.answers[repeat]).map((item) => item[questionId]))
      : responses.map((r) => r.answers[questionId]);
  };
  return allQuestions(survey)
    .map((question) => {
      const values = answersTo(question.id).filter((v) => v !== undefined && v !== null && v !== "");
      const summary: QuestionSummary = {
        question,
        panels: panelsOf.get(question.id) ?? [],
        ...(repeatOf.has(question.id) ? { repeat: repeatOf.get(question.id)! } : {}),
        answered: values.length,
      };

      const tally = (options: { value: string; label: string }[], key: (v: unknown) => string[]) => {
        const counts = new Map(options.map((o) => [o.value, 0]));
        for (const v of values) for (const k of key(v)) if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
        return options.map((o) => ({ ...o, count: counts.get(o.value)! }));
      };

      switch (question.type) {
        case "single-choice":
        case "dropdown":
        case "multiple-choice":
          summary.counts = tally(question.choices, (v) => (Array.isArray(v) ? v : [String(v)]));
          break;
        case "boolean":
          summary.counts = tally(
            [
              { value: "true", label: question.labelTrue ?? "Yes" },
              { value: "false", label: question.labelFalse ?? "No" },
            ],
            (v) => [String(v)],
          );
          break;
        case "rating": {
          const opts = Array.from({ length: question.max - question.min + 1 }, (_, i) => String(question.min + i));
          summary.counts = tally(opts.map((o) => ({ value: o, label: o })), (v) => [String(v)]);
          const nums = values.filter((v): v is number => typeof v === "number");
          if (nums.length) summary.average = nums.reduce((a, b) => a + b, 0) / nums.length;
          break;
        }
        case "text":
        case "comment":
          summary.samples = values.slice(-sampleSize).reverse().map(String);
          break;
        case "matrix":
          summary.matrix = question.rows.map((row) => {
            const cells = values
              .map((v) => (v && typeof v === "object" && !Array.isArray(v) ? v[row.value] : undefined))
              .filter((c) => c !== undefined);
            const counts = new Map(question.columns.map((c) => [c.value, 0]));
            for (const cell of cells) {
              for (const c of Array.isArray(cell) ? cell : [cell]) if (counts.has(c)) counts.set(c, counts.get(c)! + 1);
            }
            return {
              value: row.value,
              label: row.label,
              answered: cells.length,
              counts: question.columns.map((c) => ({ value: c.value, label: c.label, count: counts.get(c.value)! })),
            };
          });
          break;
        case "ranking": {
          const orders = values.filter((v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string"));
          summary.ranking = question.choices
            .map((c) => {
              const positions = orders.map((o) => o.indexOf(c.value)).filter((i) => i >= 0);
              return {
                value: c.value,
                label: c.label,
                averageRank: positions.length ? positions.reduce((a, b) => a + b + 1, 0) / positions.length : 0,
                firstPlace: positions.filter((i) => i === 0).length,
              };
            })
            .sort((a, b) => a.averageRank - b.averageRank);
          break;
        }
        case "file": {
          const all = values.flatMap((v) => (Array.isArray(v) ? (v as FileAnswer[]).filter((f) => typeof f === "object") : []));
          summary.fileCount = all.length;
          summary.files = all.slice(-sampleSize).reverse();
          break;
        }
      }
      return summary;
    });
}
