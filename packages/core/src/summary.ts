import type { Question, Survey, SurveyResponse } from "@kvesto/schema";

export interface QuestionSummary {
  question: Question;
  answered: number;
  /** For choice, dropdown, boolean and rating questions: count per option. */
  counts?: { value: string; label: string; count: number }[];
  /** For rating questions. */
  average?: number;
  /** For text and comment questions: the most recent answers. */
  samples?: string[];
}

/** Aggregate responses per question. Used by the dashboard; handy for custom reports too. */
export function summarizeResponses(survey: Survey, responses: SurveyResponse[], sampleSize = 5): QuestionSummary[] {
  return survey.pages
    .flatMap((p) => p.elements)
    .map((question) => {
      const values = responses.map((r) => r.answers[question.id]).filter((v) => v !== undefined && v !== null && v !== "");
      const summary: QuestionSummary = { question, answered: values.length };

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
      }
      return summary;
    });
}
