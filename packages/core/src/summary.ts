import { repeatItems } from "./logic.js";
import { questionType } from "./question-types.js";
import { allQuestions, localizeSurvey, textOf, walkElements, type LocalizedText, type AnswerValue, type GridAnswer, type MatrixAnswer, type FileAnswer, type Question, type Survey, type SurveyResponse } from "@kvesto/schema";

export interface MatrixRowSummary {
  value: string;
  label: string;
  answered: number;
  counts: { value: string; label: string; count: number }[];
}

/** One cell column of a grid row. */
export interface GridCellSummary {
  value: string;
  label: string;
  answered: number;
  /** Number columns. */
  average?: number;
  /** Dropdown and boolean columns. */
  counts?: { value: string; label: string; count: number }[];
}

export interface GridRowSummary {
  value: string;
  label: string;
  /** Responses (or items) with anything filled in this row. */
  answered: number;
  columns: GridCellSummary[];
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
  /** For rating questions, and computed questions with numbers. */
  average?: number;
  /** For text and comment questions: the most recent answers. */
  samples?: string[];
  /** For matrix questions: column counts per row. */
  matrix?: MatrixRowSummary[];
  /** For grid questions: per row, a summary of each column. */
  grid?: GridRowSummary[];
  /** For ranking questions: items ordered by average rank, best first. */
  ranking?: RankingSummary[];
  /** For file questions: the most recent files, and how many were uploaded in total. */
  files?: FileAnswer[];
  fileCount?: number;
}

/** Aggregate responses per question. Used by the dashboard; handy for custom reports too. */
export function summarizeResponses(survey: Survey, responses: SurveyResponse[], sampleSize = 5, locale?: string): QuestionSummary[] {
  // Labels in the requested locale (or the survey's default one).
  survey = localizeSurvey(survey, locale);
  const headings = new Map<string, PanelHeading>();
  const panelsOf = new Map<string, PanelHeading[]>();
  const repeatOf = new Map<string, string>();
  walkElements(survey, (el, at) => {
    if (el.type === "panel") headings.set(el.id, { id: el.id, ...(el.title ? { title: textOf(el.title) } : {}) });
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

      const tally = (options: { value: string; label: string | LocalizedText }[], key: (v: unknown) => string[]) => {
        const counts = new Map(options.map((o) => [o.value, 0]));
        for (const v of values) for (const k of key(v)) if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
        return options.map((o) => ({ value: o.value, label: textOf(o.label), count: counts.get(o.value)! }));
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
              { value: "true", label: textOf(question.labelTrue) || "Yes" },
              { value: "false", label: textOf(question.labelFalse) || "No" },
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
        case "computed": {
          // Numbers get an average; anything else is shown like text.
          const nums = values.filter((v): v is number => typeof v === "number");
          if (nums.length) summary.average = nums.reduce((a, b) => a + b, 0) / nums.length;
          summary.samples = values.slice(-sampleSize).reverse().map((v) => (Array.isArray(v) ? v.join(", ") : String(v)));
          break;
        }
        case "matrix":
          summary.matrix = question.rows.map((row) => {
            const cells = values
              .map((v) => (v && typeof v === "object" && !Array.isArray(v) ? (v as MatrixAnswer)[row.value] : undefined))
              .filter((c): c is string | string[] => typeof c === "string" || Array.isArray(c));
            const counts = new Map(question.columns.map((c) => [c.value, 0]));
            for (const cell of cells) {
              for (const c of Array.isArray(cell) ? cell : [cell]) if (counts.has(c)) counts.set(c, counts.get(c)! + 1);
            }
            return {
              value: row.value,
              label: textOf(row.label),
              answered: cells.length,
              counts: question.columns.map((c) => ({ value: c.value, label: textOf(c.label), count: counts.get(c.value)! })),
            };
          });
          break;
        case "grid":
          summary.grid = question.rows.map((row) => {
            const cellsOf = values
              .map((v) => (v && typeof v === "object" && !Array.isArray(v) ? (v as GridAnswer)[row.value] : undefined))
              .filter((c): c is GridAnswer[string] => Boolean(c) && typeof c === "object");
            return {
              value: row.value,
              label: textOf(row.label),
              answered: cellsOf.filter((c) => Object.values(c).some((x) => x !== "")).length,
              columns: question.columns.map((col) => {
                const cells = cellsOf.map((c) => c[col.value]).filter((x) => x !== undefined && x !== "");
                const column: GridCellSummary = { value: col.value, label: textOf(col.label), answered: cells.length };
                if (col.cellType === "number") {
                  const nums = cells.filter((x): x is number => typeof x === "number");
                  if (nums.length) column.average = nums.reduce((a, b) => a + b, 0) / nums.length;
                } else if (col.cellType === "dropdown" || col.cellType === "boolean") {
                  const options =
                    col.cellType === "dropdown"
                      ? (col.choices ?? [])
                      : [
                          { value: "true", label: "Yes" },
                          { value: "false", label: "No" },
                        ];
                  column.counts = options.map((o) => ({ value: o.value, label: textOf(o.label), count: cells.filter((x) => String(x) === o.value).length }));
                }
                return column;
              }),
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
                label: textOf(c.label),
                averageRank: positions.length ? positions.reduce((a, b) => a + b + 1, 0) / positions.length : 0,
                firstPlace: positions.filter((i) => i === 0).length,
              };
            })
            .sort((a, b) => a.averageRank - b.averageRank);
          break;
        }
        case "signature":
        case "file": {
          const all = values.flatMap((v) => (Array.isArray(v) ? (v as FileAnswer[]).filter((f) => typeof f === "object") : []));
          summary.fileCount = all.length;
          summary.files = all.slice(-sampleSize).reverse();
          break;
        }
        case "multi-text":
          summary.samples = values
            .slice(-sampleSize)
            .reverse()
            .map((v) =>
              question.items
                .map((item) => [item.label, (v as Record<string, unknown>)?.[item.value]] as const)
                .filter(([, x]) => typeof x === "string" && x !== "")
                .map(([label, x]) => `${label}: ${x}`)
                .join("; "),
            );
          break;
        case "slider": {
          const nums = values.filter((v): v is number => typeof v === "number");
          if (nums.length) summary.average = nums.reduce((a, b) => a + b, 0) / nums.length;
          break;
        }
        case "tags": {
          summary.counts = tally(question.choices, (v) => (Array.isArray(v) ? v.map(String) : []));
          const known = new Set(question.choices.map((c) => c.value));
          const custom = values.flatMap((v) => (Array.isArray(v) ? v.map(String).filter((x) => !known.has(x)) : []));
          if (custom.length) summary.samples = custom.slice(-sampleSize).reverse();
          break;
        }
        case "image-choice":
          summary.counts = tally(question.choices, (v) => (Array.isArray(v) ? v.map(String) : [String(v)]));
          break;
        default: {
          // A registered custom type: its own summary, or the latest answers.
          const def = questionType(question.type);
          const custom = def?.summarize?.(question, values as AnswerValue[]);
          if (custom) Object.assign(summary, custom);
          else summary.samples = values.slice(-sampleSize).reverse().map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)));
        }
      }
      return summary;
    });
}

/** How many respondents got how far. */
export interface CompletionStats {
  /** Responses started: partial and complete. */
  started: number;
  completed: number;
  /** `completed / started`, 0 when nothing was started. */
  rate: number;
  /** Per question, in survey order: how many respondents got at least this far (answered it or anything after it). */
  reached: { id: string; title: string; count: number }[];
}

/**
 * Completion rate and drop-off: where partial responses stopped. A response
 * counts as having reached a question when it answered that question or any
 * later one.
 */
export function completionStats(survey: Survey, responses: SurveyResponse[], locale?: string): CompletionStats {
  const questions = allQuestions(localizeSurvey(survey, locale));
  const furthest = responses.map((r) => {
    let last = -1;
    questions.forEach((q, i) => {
      const v = r.answers[q.id];
      if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) last = i;
    });
    return r.status === "partial" ? last : questions.length - 1;
  });
  const completed = responses.filter((r) => r.status !== "partial").length;
  return {
    started: responses.length,
    completed,
    rate: responses.length ? completed / responses.length : 0,
    reached: questions.map((q, i) => ({ id: q.id, title: textOf(q.title), count: furthest.filter((f) => f >= i).length })),
  };
}
