/**
 * Quiz and assessment scoring. A question scores through `correctAnswer`
 * (worth `points`, default 1, with optional `partialCredit` and `penalty`
 * for lists), or through `score` on its choices (assessments, personality
 * tests). Only visible questions count. The server recalculates scores, so a
 * client-sent score is never trusted.
 */
import { allQuestions, isCustomQuestion, type AnswerValue, type Answers, type Question, type Survey } from "@kvesto/schema";

export interface QuestionScore {
  questionId: string;
  score: number;
  max: number;
  /** Whether the answer is fully right, for questions with a `correctAnswer`. */
  correct?: boolean;
}

export interface SurveyScore {
  score: number;
  max: number;
  /** `score / max`, 0 when nothing can be scored. */
  ratio: number;
  /** Against `settings.quiz.passMark` (a share from 0 to 1), when set. */
  passed?: boolean;
  questions: QuestionScore[];
}

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)]);
const round = (n: number) => Math.round(n * 1000) / 1000;

type Scorable = Question & { correctAnswer?: unknown; points?: number; partialCredit?: boolean; penalty?: number };

/** The score of one answer, or null when the question isn't scored. */
export function scoreQuestion(question: Question, value: AnswerValue | undefined): QuestionScore | null {
  if (isCustomQuestion(question)) return null;
  const q = question as Scorable;
  const choices = "choices" in q && Array.isArray(q.choices) ? (q.choices as { value: string; score?: number }[]) : [];
  const answered = !(value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0));

  if (q.correctAnswer !== undefined) {
    const points = q.points ?? 1;
    const expected = q.correctAnswer;
    const multi = Array.isArray(expected) && q.type !== "ranking";
    if (q.type === "matrix" && expected && typeof expected === "object" && !Array.isArray(expected)) {
      const rows = Object.entries(expected as Record<string, unknown>);
      const given = (value ?? {}) as Record<string, unknown>;
      const right = rows.filter(([row, col]) => same(given[row], col)).length;
      const correct = right === rows.length;
      const score = q.partialCredit ? (rows.length ? (points * right) / rows.length : 0) : correct ? points : 0;
      return { questionId: q.id, score: round(score), max: points, correct };
    }
    if (multi) {
      const want = new Set(list(expected));
      const got = list(value);
      const right = got.filter((v) => want.has(v)).length;
      const wrong = got.length - right;
      const correct = right === want.size && wrong === 0;
      let score = correct ? points : 0;
      if (q.partialCredit && !correct) score = Math.max(0, (points * right) / Math.max(want.size, 1) - (q.penalty ?? 0) * wrong);
      return { questionId: q.id, score: round(score), max: points, correct };
    }
    const correct = answered && same(value, expected);
    return { questionId: q.id, score: correct ? points : 0, max: points, correct };
  }

  // Assessments: the scores of the picked choices.
  if (choices.some((c) => typeof c.score === "number")) {
    const scoreOf = (v: string) => choices.find((c) => c.value === v)?.score ?? 0;
    const multi = q.type === "multiple-choice" || q.type === "tags" || (q.type === "image-choice" && Boolean((q as { multiple?: boolean }).multiple));
    const scores = choices.map((c) => c.score ?? 0);
    const max = multi ? scores.filter((s) => s > 0).reduce((a, b) => a + b, 0) : Math.max(0, ...scores);
    const score = list(value).reduce((sum, v) => sum + scoreOf(v), 0);
    return { questionId: q.id, score: round(score), max: round(max) };
  }
  return null;
}

/** The score of a set of answers (pass the answers with hidden questions removed). */
export function scoreSurvey(survey: Survey, answers: Answers, visible?: Set<string>): SurveyScore {
  const questions = allQuestions(survey)
    .filter((q) => !visible || visible.has(q.id))
    .map((q) => scoreQuestion(q, answers[q.id]))
    .filter((s): s is QuestionScore => s !== null);
  const score = round(questions.reduce((a, s) => a + s.score, 0));
  const max = round(questions.reduce((a, s) => a + s.max, 0));
  const ratio = max ? score / max : 0;
  const passMark = survey.settings?.quiz?.passMark;
  return { score, max, ratio, ...(passMark !== undefined ? { passed: ratio >= passMark } : {}), questions };
}
