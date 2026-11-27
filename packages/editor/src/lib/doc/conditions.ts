/**
 * The model behind the visual logic builder: which questions a condition may
 * refer to, which operators and values fit each question, editing a condition
 * tree by path, and saying a condition in plain words. Pure functions over
 * survey JSON as authored.
 */
import {
  ExpressionError,
  parseExpression,
  safeExpressionRefs,
  type Comparison,
  type Condition,
  type ConditionOperator,
  type ConditionValue,
  type ElementInput,
  type PanelInput,
  type SurveyInput,
} from "@kvesto/core";

// Survey JSON as authored may be mid-edit, so question fields are read loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

/** What a condition is attached to. A survey-level condition (a trigger) may use every question outside repeats. */
export type ConditionOwner = { element: string } | { page: string } | { survey: true };

/** A question a condition may refer to. */
export interface ConditionSource {
  id: string;
  label: string;
  type: string;
  /** Set for questions in the same repeating panel as the owner: compares the same item. */
  scope?: "item";
  question: Loose;
}

interface Walked {
  element: ElementInput;
  pageIndex: number;
  /** The repeating panel the element is in, if any. */
  repeat: string | undefined;
}

function walk(survey: SurveyInput): Walked[] {
  const out: Walked[] = [];
  const visit = (list: ElementInput[], pageIndex: number, repeat: string | undefined) => {
    for (const element of list ?? []) {
      out.push({ element, pageIndex, repeat });
      if (element.type === "panel") {
        const panel = element as PanelInput;
        visit(panel.elements, pageIndex, repeat ?? (panel.repeat ? panel.id : undefined));
      }
    }
  };
  survey.pages.forEach((page, i) => visit(page.elements as ElementInput[], i, undefined));
  return out;
}

const labelOf = (el: Loose) => (typeof el.title === "string" && el.title ? el.title : el.id);

/**
 * The questions a condition on `owner` may use, in survey order: earlier
 * questions only (earlier pages for a page condition), outside repeating
 * panels, plus earlier questions of the owner's own repeating panel, which
 * compare the same item. Grids can't be compared.
 */
export function conditionSources(
  survey: SurveyInput,
  owner: ConditionOwner,
  /** Also list grids: expressions can refer to a grid cell (`{grid.row.column}`), comparisons can't. */
  { includeGrids = false }: { includeGrids?: boolean } = {},
): ConditionSource[] {
  const all = walk(survey);
  let end: number;
  let repeat: string | undefined;
  if ("survey" in owner) {
    end = all.length;
  } else if ("page" in owner) {
    const pageIndex = survey.pages.findIndex((p) => p.id === owner.page);
    end = all.findIndex((w) => w.pageIndex >= pageIndex);
    if (end < 0) end = all.length;
  } else {
    end = all.findIndex((w) => w.element.id === owner.element);
    if (end < 0) return [];
    // A repeating panel's own condition is evaluated outside its items: `repeat` is the panel around the owner.
    repeat = all[end]!.repeat;
  }
  const out: ConditionSource[] = [];
  for (const w of all.slice(0, end)) {
    const el = w.element as Loose;
    if (el.type === "panel" || el.type === "content" || el.type === "image" || (el.type === "grid" && !includeGrids)) continue;
    if (w.repeat && w.repeat !== repeat) continue;
    out.push({
      id: el.id,
      label: labelOf(el),
      type: el.type,
      ...(w.repeat ? { scope: "item" as const } : {}),
      question: el,
    });
  }
  return out;
}

const ORDER: ConditionOperator[] = ["gt", "gte", "lt", "lte"];

/** The operators that make sense for a question (or for one matrix row). */
export function operatorsFor(source: ConditionSource): ConditionOperator[] {
  const q = source.question;
  const presence: ConditionOperator[] = ["empty", "notEmpty"];
  switch (source.type) {
    case "text":
      if (q.inputType === "number" || q.inputType === "date") return ["eq", "neq", ...ORDER, ...presence];
      return ["eq", "neq", "contains", "notContains", "in", "notIn", ...presence];
    case "comment":
      return ["eq", "neq", "contains", "notContains", ...presence];
    case "single-choice":
    case "dropdown":
      return ["eq", "neq", "in", "notIn", ...presence];
    case "multiple-choice":
    case "ranking":
      return ["contains", "notContains", "in", "notIn", ...presence];
    case "rating":
      return ["eq", "neq", ...ORDER, "in", "notIn", ...presence];
    case "boolean":
      return ["eq", "neq", ...presence];
    case "computed":
      return ["eq", "neq", ...ORDER, ...presence];
    case "matrix":
      return q.multiple ? ["contains", "notContains", ...presence] : ["eq", "neq", "in", "notIn", ...presence];
    default:
      return presence;
  }
}

/** How the value of a comparison is entered. */
export type ValueKind = "none" | "choice" | "choices" | "number" | "numbers" | "date" | "text" | "texts" | "boolean";

export function valueKind(source: ConditionSource, op: ConditionOperator): ValueKind {
  if (op === "empty" || op === "notEmpty") return "none";
  const many = op === "in" || op === "notIn";
  const q = source.question;
  switch (source.type) {
    case "single-choice":
    case "dropdown":
    case "multiple-choice":
    case "ranking":
    case "matrix":
      return many ? "choices" : "choice";
    case "boolean":
      return "boolean";
    case "rating":
    case "computed":
      return many ? "numbers" : "number";
    case "text":
      if (q.inputType === "number") return many ? "numbers" : "number";
      if (q.inputType === "date") return "date";
      return many ? "texts" : "text";
    default:
      return many ? "texts" : "text";
  }
}

/** The values a choice-like question offers: choices, or a matrix's columns. */
export function choicesOf(source: ConditionSource): { value: string; label: string }[] {
  const q = source.question;
  const list = source.type === "matrix" ? q.columns : q.choices;
  return Array.isArray(list) ? list : [];
}

function defaultValue(source: ConditionSource, kind: ValueKind): Comparison["value"] {
  const first = choicesOf(source)[0]?.value;
  switch (kind) {
    case "none":
      return undefined;
    case "choice":
      return first ?? "";
    case "choices":
      return first === undefined ? [] : [first];
    case "boolean":
      return true;
    case "number":
      return typeof source.question.min === "number" ? source.question.min : 0;
    case "numbers":
      return [];
    case "date":
    case "text":
      return "";
    case "texts":
      return [];
  }
}

/**
 * A comparison on `source`, keeping as much of `previous` as still fits: the
 * operator if the question supports it, the value if it is the same kind.
 */
export function comparisonFor(source: ConditionSource, previous?: Partial<Comparison>): Comparison {
  const ops = operatorsFor(source);
  const op = previous?.op && ops.includes(previous.op) ? previous.op : ops[0]!;
  const kind = valueKind(source, op);
  const sameQuestion = previous?.question === source.id;
  const keepValue = sameQuestion && previous?.op !== undefined && valueKind(source, previous.op) === kind;
  const value = keepValue ? previous!.value : defaultValue(source, kind);
  const out: Comparison = { question: source.id, op };
  if (source.type === "matrix") {
    const rows = (source.question.rows ?? []) as { value: string }[];
    const row = sameQuestion && rows.some((r) => r.value === previous?.row) ? previous!.row : rows[0]?.value;
    if (row !== undefined) out.row = row;
  }
  if (source.scope) out.scope = "item";
  if (value !== undefined) out.value = value;
  return out;
}

/** Change the operator of a comparison, adapting the value to the new operator. */
export function withOperator(source: ConditionSource, c: Comparison, op: ConditionOperator): Comparison {
  const kind = valueKind(source, op);
  const before = valueKind(source, c.op);
  const next: Comparison = { ...c, op };
  if (kind === before) return next;
  delete next.value;
  // Carry a single value into a list and back, so switching eq ↔ in doesn't lose it.
  const v = c.value;
  if ((kind === "choices" || kind === "numbers" || kind === "texts") && v !== undefined && !Array.isArray(v)) next.value = [v];
  else if ((kind === "choice" || kind === "number" || kind === "text") && Array.isArray(v) && v.length) next.value = v[0];
  else {
    const fresh = defaultValue(source, kind);
    if (fresh !== undefined) next.value = fresh;
  }
  return next;
}

// ── Editing a condition tree by path ─────────────────────────────────────────

/** A path into a condition: an index into an `all` / `any` list, or "not". */
export type ConditionPath = (number | "not")[];

export const isGroup = (c: Condition): c is { all: Condition[] } | { any: Condition[] } => "all" in c || "any" in c;
export const groupItems = (c: Condition): Condition[] => ("all" in c ? c.all : "any" in c ? c.any : []);
const withItems = (c: Condition, items: Condition[]): Condition => ("all" in c ? { all: items } : { any: items });

export function getAt(root: Condition, path: ConditionPath): Condition | undefined {
  let at: Condition | undefined = root;
  for (const step of path) {
    if (!at) return undefined;
    at = step === "not" ? ("not" in at ? at.not : undefined) : groupItems(at)[step];
  }
  return at;
}

/**
 * Replace the node at `path` (or remove it, with `undefined`). A group left
 * empty, or a "not" left without its condition, is removed too. Returns the
 * new root, or undefined when nothing is left.
 */
export function setAt(root: Condition | undefined, path: ConditionPath, value: Condition | undefined): Condition | undefined {
  if (path.length === 0) return value;
  if (!root) return root;
  const [step, ...rest] = path;
  if (step === "not") {
    if (!("not" in root)) return root;
    const inner = setAt(root.not, rest, value);
    return inner ? { not: inner } : undefined;
  }
  if (!isGroup(root)) return root;
  const items = [...groupItems(root)];
  const inner = setAt(items[step!], rest, value);
  if (inner) items[step!] = inner;
  else items.splice(step!, 1);
  return items.length ? withItems(root, items) : undefined;
}

/** Wrap in "not", or unwrap a "not". */
export const toggleNot = (c: Condition): Condition => ("not" in c ? c.not : { not: c });

/** Switch a group between all and any. */
export const switchGroup = (c: Condition, kind: "all" | "any"): Condition =>
  isGroup(c) ? (kind === "all" ? { all: groupItems(c) } : { any: groupItems(c) }) : c;

/** Add a condition next to `c`: into it when it is a group, or by making an "all" group of both. */
export function addTo(c: Condition, added: Condition): Condition {
  if (isGroup(c)) return withItems(c, [...groupItems(c), added]);
  return { all: [c, added] };
}

// ── Plain words ──────────────────────────────────────────────────────────────

const PHRASES: Record<ConditionOperator, string> = {
  eq: "is",
  neq: "is not",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "includes",
  notContains: "does not include",
  in: "is one of",
  notIn: "is none of",
  empty: "is not answered",
  notEmpty: "is answered",
};

export const operatorLabel = (op: ConditionOperator): string => PHRASES[op];

/** A condition in plain words: `Role is "Developer" and Age is at least 18`. */
export function describeCondition(survey: SurveyInput, condition: Condition): string {
  const byId = new Map(walk(survey).map((w) => [w.element.id, w.element as Loose]));
  const say = (c: Condition, nested: boolean): string => {
    if ("not" in c) return `not (${say(c.not, false)})`;
    if ("expr" in c) return `the expression ${c.expr.trim() || "…"} holds`;
    if (isGroup(c)) {
      const parts = groupItems(c).map((x) => say(x, true));
      const text = parts.join("all" in c ? " and " : " or ");
      return nested && parts.length > 1 ? `(${text})` : text;
    }
    const q = byId.get(c.question);
    let subject = q ? labelOf(q) : `"${c.question}" (missing)`;
    if (c.row !== undefined) {
      const row = (q?.rows as { value: string; label: string }[] | undefined)?.find((r) => r.value === c.row);
      subject += ` › ${row?.label ?? c.row}`;
    }
    if (c.scope === "item") subject += " (same item)";
    const options: { value: string; label: string }[] = (q?.type === "matrix" ? q.columns : q?.choices) ?? [];
    const word = (v: ConditionValue) => {
      if (typeof v === "boolean") return v ? (q?.labelTrue ?? "Yes") : (q?.labelFalse ?? "No");
      if (typeof v === "number") return String(v);
      const choice = options.find((o) => o.value === v);
      return `"${choice?.label ?? v}"`;
    };
    if (c.op === "empty" || c.op === "notEmpty") return `${subject} ${PHRASES[c.op]}`;
    const value = c.value === undefined ? "…" : Array.isArray(c.value) ? c.value.map(word).join(", ") || "…" : word(c.value);
    return `${subject} ${PHRASES[c.op]} ${value}`;
  };
  return say(condition, false);
}

/** The syntax error in expression text, or null when it parses. */
export function expressionError(text: string): string | null {
  try {
    parseExpression(text);
    return null;
  } catch (e) {
    if (e instanceof ExpressionError) return `${e.message} (at character ${e.position + 1})`;
    throw e;
  }
}

/** A new expression condition, starting from the last question the owner may use. */
export function expressionFor(source: ConditionSource | undefined): Condition {
  return { expr: source ? `{${source.scope ? "$item." : ""}${source.id}} != null` : "" };
}

/** Comparisons and expression references in a condition that refer to a question the owner may not use. */
export function invalidReferences(survey: SurveyInput, owner: ConditionOwner, condition: Condition): string[] {
  const sources = conditionSources(survey, owner, { includeGrids: true });
  const allowed = new Map(sources.filter((s) => s.type !== "grid").map((s) => [s.id, s]));
  const anyType = new Map(sources.map((s) => [s.id, s]));
  const bad: string[] = [];
  const visit = (c: Condition) => {
    if ("not" in c) return visit(c.not);
    if (isGroup(c)) return groupItems(c).forEach(visit);
    if ("expr" in c) {
      for (const r of safeExpressionRefs(c.expr)) {
        const s = anyType.get(r.name);
        if (!s || (s.scope ?? undefined) !== (r.scope ?? undefined)) bad.push(r.name);
      }
      return;
    }
    const s = allowed.get(c.question);
    if (!s || (s.scope ?? undefined) !== (c.scope ?? undefined)) bad.push(c.question);
  };
  visit(condition);
  return bad;
}
