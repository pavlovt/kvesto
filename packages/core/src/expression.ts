/**
 * Evaluating Kvesto expressions. The parser is in `@kvesto/schema`
 * (`parseExpression`); this walks the syntax tree it returns. Nothing is
 * compiled or run as code.
 */
import {
  isQuestion,
  conditionExpressions,
  expressionFunctions,
  parseExpression,
  walkElements,
  type Answers,
  type Condition,
  type ExpressionNode,
  type Survey,
} from "@kvesto/schema";

/**
 * A host-provided function callable from expressions, registered with
 * `createSurvey({ functions })` and the server's `createApp({ functions })`.
 * Must be synchronous and side-effect free: it runs on every change, in the
 * browser and on the server.
 */
export type ExpressionFunction = (...args: unknown[]) => unknown;
export type ExpressionFunctions = Record<string, ExpressionFunction>;

export interface EvaluateOptions {
  /** Answers of the current item of a repeating panel, for `{$item.q}` references. */
  item?: Answers;
  /** Extra functions, by name. Built-in functions cannot be replaced. */
  functions?: ExpressionFunctions;
  /** The clock for `today()` and `age()`. Default: the system clock. */
  now?: () => Date;
  /** Survey variables by name (`{ total: "{a} + {b}" }`), worked out when an expression refers to them. */
  variables?: Record<string, string>;
}

/** Raised for problems found while evaluating, such as an unknown function. */
export class ExpressionEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionEvaluationError";
  }
}

const cache = new Map<string, ExpressionNode>();

/** Parse with a cache: the same expression text is evaluated on every change. */
export function compileExpression(text: string): ExpressionNode {
  let node = cache.get(text);
  if (!node) {
    node = parseExpression(text);
    if (cache.size > 1000) cache.clear();
    cache.set(text, node);
  }
  return node;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Empty in the same sense as an unanswered question. */
export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isRecord(v)) return Object.keys(v).length === 0;
  return typeof v === "number" && Number.isNaN(v);
}

/** A number, or null. Numeric strings count (text questions with `inputType: "number"` answer with strings). */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Truthiness for conditions: `true`, a non-zero number, or any non-empty answer. */
export function isTruthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  return !isEmptyValue(v);
}

function equals(a: unknown, b: unknown): boolean {
  const ea = isEmptyValue(a);
  const eb = isEmptyValue(b);
  if (ea || eb) return ea && eb;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x) => b.some((y) => equals(x, y)));
  if (typeof a === typeof b) return a === b;
  if (typeof a === "number" || typeof b === "number") {
    const na = toNumber(a);
    return na !== null && na === toNumber(b);
  }
  return false;
}

function compare(a: unknown, b: unknown): number | null {
  if (isEmptyValue(a) || isEmptyValue(b)) return null;
  // Number questions answer with text ("2", "10"): two numeric values compare as numbers, not alphabetically.
  if (typeof a === "number" || typeof b === "number" || (toNumber(a) !== null && toNumber(b) !== null)) {
    const na = toNumber(a);
    const nb = toNumber(b);
    return na === null || nb === null ? null : na - nb;
  }
  // ISO dates and other strings compare lexicographically.
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

/** Numbers from arguments, flattening lists and skipping empty values. */
function numbers(args: unknown[]): number[] {
  const out: number[] = [];
  for (const a of args.flat()) {
    const n = toNumber(a);
    if (n !== null) out.push(n);
  }
  return out;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string") return null;
  const m = DATE.exec(v);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Whole months from `a` to `b` (both UTC dates). */
function monthsBetween(a: Date, b: Date): number {
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (months > 0 && b.getUTCDate() < a.getUTCDate()) months--;
  if (months < 0 && b.getUTCDate() > a.getUTCDate()) months++;
  return months;
}

function dateDiff(from: unknown, to: unknown, unit: unknown = "days"): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return null;
  if (unit === "days") return Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (unit === "months") return monthsBetween(a, b);
  if (unit === "years") return Math.trunc(monthsBetween(a, b) / 12);
  return null;
}

type Builtin = (args: unknown[], now: () => Date) => unknown;

/** The built-in functions. `iif` is handled by the evaluator so only one branch is evaluated. */
const BUILTINS: Record<string, Builtin> = {
  isEmpty: ([x]) => isEmptyValue(x),
  count: ([x]) => (isEmptyValue(x) ? 0 : Array.isArray(x) ? x.length : isRecord(x) ? Object.values(x).filter((v) => !isEmptyValue(v)).length : 1),
  sum: (args) => numbers(args).reduce((s, n) => s + n, 0),
  avg: (args) => {
    const ns = numbers(args);
    return ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : null;
  },
  min: (args) => {
    const ns = numbers(args);
    return ns.length ? Math.min(...ns) : null;
  },
  max: (args) => {
    const ns = numbers(args);
    return ns.length ? Math.max(...ns) : null;
  },
  round: ([x, digits]) => {
    const n = toNumber(x);
    if (n === null) return null;
    const f = 10 ** Math.max(0, Math.min(10, Math.trunc(toNumber(digits) ?? 0)));
    return Math.round(n * f) / f;
  },
  abs: ([x]) => {
    const n = toNumber(x);
    return n === null ? null : Math.abs(n);
  },
  number: ([x]) => toNumber(x),
  length: ([x]) => (typeof x === "string" ? x.length : Array.isArray(x) ? x.length : isEmptyValue(x) ? 0 : String(x).length),
  lower: ([x]) => (typeof x === "string" ? x.toLowerCase() : x ?? null),
  upper: ([x]) => (typeof x === "string" ? x.toUpperCase() : x ?? null),
  trim: ([x]) => (typeof x === "string" ? x.trim() : x ?? null),
  concat: (args) => args.map((a) => (isEmptyValue(a) ? "" : Array.isArray(a) ? a.join(", ") : String(a))).join(""),
  contains: ([haystack, needle]) => {
    if (isEmptyValue(haystack) || isEmptyValue(needle)) return false;
    if (typeof haystack === "string") return haystack.includes(String(needle));
    if (Array.isArray(haystack)) return haystack.some((x) => equals(x, needle));
    return false;
  },
  today: (_args, now) => isoDay(now()),
  age: ([birth], now) => {
    const b = parseDate(birth);
    return b ? dateDiff(birth, isoDay(now()), "years") : null;
  },
  dateDiff: ([from, to, unit]) => dateDiff(from, to, unit ?? "days"),
  year: ([d]) => parseDate(d)?.getUTCFullYear() ?? null,
};

/** Names of the built-in functions (plus `iif`). */
export const BUILTIN_FUNCTIONS: readonly string[] = ["iif", ...Object.keys(BUILTINS)];

/** Look up a reference such as `{q}`, `{matrix.row}` or `{$item.q}`. */
function lookup(node: Extract<ExpressionNode, { type: "ref" }>, answers: Answers, item: Answers | undefined): unknown {
  let v: unknown = (node.scope === "item" ? (item ?? {}) : answers)[node.name];
  for (const part of node.path) v = isRecord(v) ? v[part] : undefined;
  return v === undefined ? null : v;
}

/** How deep variables may refer to other variables while evaluating (the schema already refuses cycles). */
const MAX_VARIABLE_DEPTH = 32;

/** Evaluate a parsed expression against answers. */
export function evaluateNode(node: ExpressionNode, answers: Answers, options: EvaluateOptions = {}, depth = 0): unknown {
  const now = options.now ?? (() => new Date());
  const run = (n: ExpressionNode): unknown => {
    switch (n.type) {
      case "literal":
        return n.value;
      case "ref":
        if (!n.scope && options.variables && Object.hasOwn(options.variables, n.name)) {
          if (depth >= MAX_VARIABLE_DEPTH) throw new ExpressionEvaluationError(`Variable "${n.name}" is nested too deeply`);
          const v = evaluateNode(compileExpression(options.variables[n.name]!), answers, { ...options, item: undefined }, depth + 1);
          return v === undefined ? null : v;
        }
        return lookup(n, answers, options.item);
      case "unary": {
        const v = run(n.arg);
        if (n.op === "not") return !isTruthy(v);
        const num = toNumber(v);
        return num === null ? null : -num;
      }
      case "binary": {
        if (n.op === "and") return isTruthy(run(n.left)) && isTruthy(run(n.right));
        if (n.op === "or") return isTruthy(run(n.left)) || isTruthy(run(n.right));
        const a = run(n.left);
        const b = run(n.right);
        switch (n.op) {
          case "=":
            return equals(a, b);
          case "!=":
            return !equals(a, b);
          case "<":
          case "<=":
          case ">":
          case ">=": {
            const d = compare(a, b);
            if (d === null) return false;
            return n.op === "<" ? d < 0 : n.op === "<=" ? d <= 0 : n.op === ">" ? d > 0 : d >= 0;
          }
          case "+": {
            const na = toNumber(a);
            const nb = toNumber(b);
            if (na !== null && nb !== null) return na + nb;
            if (typeof a === "string" || typeof b === "string") return `${a ?? ""}${b ?? ""}`;
            return null;
          }
          default: {
            const na = toNumber(a);
            const nb = toNumber(b);
            if (na === null || nb === null) return null;
            if (n.op === "-") return na - nb;
            if (n.op === "*") return na * nb;
            if (nb === 0) return null;
            return n.op === "/" ? na / nb : na % nb;
          }
        }
      }
      case "call": {
        if (n.name === "iif") {
          const [cond, then, otherwise] = n.args;
          if (!cond) return null;
          return isTruthy(run(cond)) ? (then ? run(then) : null) : otherwise ? run(otherwise) : null;
        }
        // Own properties only, so names such as "constructor" never reach Object.prototype.
        if (Object.hasOwn(BUILTINS, n.name)) return BUILTINS[n.name]!(n.args.map(run), now);
        const custom = options.functions && Object.hasOwn(options.functions, n.name) ? options.functions[n.name] : undefined;
        if (typeof custom !== "function") throw new ExpressionEvaluationError(`Unknown function "${n.name}"`);
        const result = custom(...n.args.map(run));
        return result === undefined ? null : result;
      }
    }
  };
  return run(node);
}

/** Parse (cached) and evaluate expression text. Throws for syntax errors and unknown functions. */
export function evaluateExpression(text: string, answers: Answers, options: EvaluateOptions = {}): unknown {
  return evaluateNode(compileExpression(text), answers, options);
}

/**
 * Evaluate an expression condition. A condition that cannot be evaluated
 * (an unknown function, or a custom function that throws) is false.
 */
export function evaluateExpressionCondition(text: string, answers: Answers, options: EvaluateOptions = {}): boolean {
  try {
    return isTruthy(evaluateExpression(text, answers, options));
  } catch {
    return false;
  }
}

/** Every expression text in a survey: conditions, variables, computed questions, defaults and expression rules. */
export function surveyExpressions(survey: Survey): string[] {
  const out: string[] = [];
  const add = (c: Condition | undefined) => {
    if (c) out.push(...conditionExpressions(c));
  };
  for (const page of survey.pages) add(page.visibleIf);
  for (const v of survey.variables ?? []) out.push(v.expr);
  for (const t of survey.triggers ?? []) add(t.when);
  walkElements(survey, (el) => {
    add(el.visibleIf);
    if (!isQuestion(el)) return;
    add(el.requiredIf);
    add(el.enableIf);
    add(el.resetIf);
    if (el.defaultExpr) out.push(el.defaultExpr);
    if (el.type === "computed") out.push(el.expr);
    for (const v of el.validators ?? []) if (v.type === "expression") out.push(v.expr);
  });
  return out;
}

/** A survey's variables as a name → expression map, for `EvaluateOptions.variables`. */
export function surveyVariables(survey: Survey): Record<string, string> | undefined {
  if (!survey.variables?.length) return undefined;
  return Object.fromEntries(survey.variables.map((v) => [v.name, v.expr]));
}

/** An expression result as an answer: scalars and lists of text stay, anything else becomes text or null. */
export function toAnswerValue(v: unknown): string | number | boolean | string[] | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map((x) => String(x));
  return null;
}

/** Functions a survey's expressions call that are neither built in nor in `functions`. */
export function unknownFunctions(survey: Survey, functions: ExpressionFunctions = {}): string[] {
  const missing = new Set<string>();
  for (const text of surveyExpressions(survey)) {
    for (const name of expressionFunctions(compileExpression(text))) {
      if (!BUILTIN_FUNCTIONS.includes(name) && !Object.hasOwn(functions, name)) missing.add(name);
    }
  }
  return [...missing];
}
