/**
 * Answer piping: `{questionId}` placeholders in display text, filled with the
 * current answer. The result is plain text, never HTML.
 */
import { allQuestions, replacePlaceholders, type Answers, type Question, type Survey } from "@kvesto/schema";

export interface PipeOptions {
  /** Answers of the current item of a repeating panel, for `{$item.q}`. */
  item?: Answers;
  /** Other values placeholders may name, such as the survey's variables (`state.logic.variables`). */
  values?: Record<string, unknown>;
  /** Words for boolean answers without their own labels. Default "Yes" / "No". */
  yes?: string;
  no?: string;
}

const questionCache = new WeakMap<Survey, Map<string, Question>>();
function questionsById(survey: Survey): Map<string, Question> {
  let map = questionCache.get(survey);
  if (!map) {
    map = new Map(allQuestions(survey).map((q) => [q.id, q]));
    questionCache.set(survey, map);
  }
  return map;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** An answer as text: choice values become their labels, lists are joined with commas. */
export function formatAnswer(question: Question | undefined, value: unknown, path: string[] = [], options: PipeOptions = {}): string {
  if (value === undefined || value === null) return "";
  const yesNo = (b: boolean, q?: { labelTrue?: string; labelFalse?: string }) =>
    b ? (q?.labelTrue ?? options.yes ?? "Yes") : (q?.labelFalse ?? options.no ?? "No");
  if (path.length) {
    let v: unknown = value;
    for (const p of path) v = isRecord(v) ? v[p] : undefined;
    if (v === undefined || v === null) return "";
    if (question?.type === "matrix") {
      const label = (c: unknown) => question.columns.find((x) => x.value === c)?.label ?? String(c);
      return Array.isArray(v) ? v.map(label).join(", ") : label(v);
    }
    if (typeof v === "boolean") return yesNo(v);
    if (question?.type === "grid" && path.length === 2) {
      const column = question.columns.find((c) => c.value === path[1]);
      if (column?.cellType === "dropdown") return column.choices?.find((c) => c.value === v)?.label ?? String(v);
    }
    return typeof v === "object" ? "" : String(v);
  }
  if (question?.type === "computed") return formatComputed(question, value);
  if (question && "choices" in question) {
    const label = (c: unknown) => question.choices.find((x) => x.value === c)?.label ?? String(c);
    return Array.isArray(value) ? value.map(label).join(", ") : label(value);
  }
  if (typeof value === "boolean") return yesNo(value, question?.type === "boolean" ? question : undefined);
  if (Array.isArray(value)) {
    return value.map((v) => (isRecord(v) && typeof v.name === "string" ? v.name : isRecord(v) ? "" : String(v))).join(", ");
  }
  if (isRecord(value)) return "";
  return String(value);
}

/** A computed question's value for display: rounded to `decimals`, between `prefix` and `suffix`. */
export function formatComputed(question: { decimals?: number; prefix?: string; suffix?: string }, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const text =
    typeof value === "number" && question.decimals !== undefined
      ? value.toFixed(question.decimals)
      : Array.isArray(value)
        ? value.join(", ")
        : String(value);
  return `${question.prefix ?? ""}${text}${question.suffix ?? ""}`;
}

/**
 * Fill `{questionId}` placeholders in display text with answers, as text.
 * Pass the answers with hidden questions removed (`state.logic.answers`), so a
 * hidden question pipes as empty. Placeholders whose name is not a question
 * are left as they are, and `{{` / `}}` give literal braces.
 */
export function pipeText(text: string, survey: Survey, answers: Answers, options: PipeOptions = {}): string {
  const questions = questionsById(survey);
  return replacePlaceholders(text, (p) => {
    const question = questions.get(p.name);
    if (!question) {
      if (!p.scope && !p.path.length && options.values && Object.hasOwn(options.values, p.name)) {
        return formatAnswer(undefined, options.values[p.name], [], options);
      }
      return null;
    }
    const source = p.scope === "item" ? (options.item ?? {}) : answers;
    return formatAnswer(question, source[p.name], p.path, options);
  });
}
