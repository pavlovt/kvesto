/**
 * The Kvesto expression language: a small, safe language for conditions and
 * calculations, such as `{age} >= 18 and {role} = 'dev'` or
 * `sum({q1}, {q2}) * 2`.
 *
 * Text is parsed by a hand-written parser into a JSON syntax tree. Nothing is
 * ever passed to `eval` or `Function`. The parser lives in the schema package
 * so that survey validation can check that an expression parses and only
 * refers to earlier questions; the evaluator lives in `@kvesto/core`.
 *
 * Syntax:
 * - literals: numbers (`3`, `2.5`), strings (`'text'` or `"text"`, with `\` escapes), `true`, `false`, `null`
 * - references: `{questionId}`, `{matrixId.row}`, `{gridId.row.column}`, and inside a repeating panel
 *   `{$item.questionId}` for a question of the same item
 * - operators, loosest first: `or`, `and`, `not`, comparisons (`=` `==` `!=` `<>` `<` `<=` `>` `>=`),
 *   `+` `-`, `*` `/` `%`, unary `-`
 * - function calls: `name(arg, …)`; see the evaluator for the built-in functions
 */

/** Longest expression text accepted. */
export const MAX_EXPRESSION_LENGTH = 1000;
/** Deepest nesting of operators, calls and parentheses accepted. */
export const MAX_EXPRESSION_DEPTH = 32;

export type ExpressionLiteral = string | number | boolean | null;

export type BinaryOperator = "or" | "and" | "=" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "%";

/** A parsed expression. Plain JSON, so it can be stored, compared and walked. */
export type ExpressionNode =
  | { type: "literal"; value: ExpressionLiteral }
  /** `{a.b.c}`: `name` is `a`, `path` is `["b", "c"]`. `scope: "item"` for `{$item.a}`. */
  | { type: "ref"; name: string; path: string[]; scope?: "item" }
  | { type: "unary"; op: "-" | "not"; arg: ExpressionNode }
  | { type: "binary"; op: BinaryOperator; left: ExpressionNode; right: ExpressionNode }
  | { type: "call"; name: string; args: ExpressionNode[] };

/** A syntax error, with the character position where it was found. */
export class ExpressionError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = "ExpressionError";
  }
}

type Token =
  | { kind: "num"; value: number; pos: number }
  | { kind: "str"; value: string; pos: number }
  | { kind: "ref"; parts: string[]; scope?: "item"; pos: number }
  | { kind: "name"; value: string; pos: number }
  | { kind: "op"; value: string; pos: number }
  | { kind: "end"; pos: number };

const REF_PART = /^[A-Za-z0-9_-]+$/;
const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;
const OPERATORS = ["==", "!=", "<>", "<=", ">=", "=", "<", ">", "+", "-", "*", "/", "%", "(", ")", ","];

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const pos = i;
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i))!;
      tokens.push({ kind: "num", value: Number(m[0]), pos });
      i += m[0].length;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let value = "";
      i++;
      for (;;) {
        if (i >= text.length) throw new ExpressionError("Unterminated string", pos);
        const c = text[i]!;
        if (c === ch) break;
        if (c === "\\") {
          const next = text[i + 1];
          if (next === undefined) throw new ExpressionError("Unterminated string", pos);
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
          i += 2;
          continue;
        }
        value += c;
        i++;
      }
      i++;
      tokens.push({ kind: "str", value, pos });
      continue;
    }
    if (ch === "{") {
      const close = text.indexOf("}", i);
      if (close < 0) throw new ExpressionError("Missing } after a reference", pos);
      let body = text.slice(i + 1, close).trim();
      let scope: "item" | undefined;
      if (body.startsWith("$item.")) {
        scope = "item";
        body = body.slice("$item.".length);
      }
      const parts = body.split(".");
      if (!body || !parts.every((p) => REF_PART.test(p))) {
        throw new ExpressionError(`Invalid reference {${text.slice(i + 1, close)}}`, pos);
      }
      tokens.push({ kind: "ref", parts, ...(scope ? { scope } : {}), pos });
      i = close + 1;
      continue;
    }
    if (NAME_START.test(ch)) {
      let j = i + 1;
      while (j < text.length && NAME_CHAR.test(text[j]!)) j++;
      tokens.push({ kind: "name", value: text.slice(i, j), pos });
      i = j;
      continue;
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i));
    if (!op) throw new ExpressionError(`Unexpected character "${ch}"`, pos);
    tokens.push({ kind: "op", value: op, pos });
    i += op.length;
  }
  tokens.push({ kind: "end", pos: text.length });
  return tokens;
}

const COMPARISON: Record<string, BinaryOperator> = { "=": "=", "==": "=", "!=": "!=", "<>": "!=", "<": "<", "<=": "<=", ">": ">", ">=": ">=" };

/** Parse expression text into a syntax tree. Throws an `ExpressionError` for malformed input. */
export function parseExpression(text: string): ExpressionNode {
  if (text.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(`Expression is longer than ${MAX_EXPRESSION_LENGTH} characters`, MAX_EXPRESSION_LENGTH);
  }
  const tokens = tokenize(text);
  let at = 0;
  let depth = 0;
  const peek = () => tokens[at]!;
  const isOp = (v: string) => {
    const t = peek();
    return t.kind === "op" && t.value === v;
  };
  const isWord = (v: string) => {
    const t = peek();
    return t.kind === "name" && t.value === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExpressionError(`Expected "${v}"`, peek().pos);
    at++;
  };
  const nested = <T>(fn: () => T): T => {
    if (++depth > MAX_EXPRESSION_DEPTH) throw new ExpressionError("Expression is nested too deeply", peek().pos);
    try {
      return fn();
    } finally {
      depth--;
    }
  };

  const binaryLevel = (next: () => ExpressionNode, match: () => BinaryOperator | null) => (): ExpressionNode =>
    nested(() => {
      let left = next();
      for (let op = match(); op; op = match()) {
        at++;
        left = { type: "binary", op, left, right: nested(next) };
      }
      return left;
    });

  const primary = (): ExpressionNode =>
    nested(() => {
      const t = peek();
      switch (t.kind) {
        case "num":
          at++;
          return { type: "literal", value: t.value };
        case "str":
          at++;
          return { type: "literal", value: t.value };
        case "ref":
          at++;
          return { type: "ref", name: t.parts[0]!, path: t.parts.slice(1), ...(t.scope ? { scope: t.scope } : {}) };
        case "name": {
          at++;
          if (t.value === "true" || t.value === "false") return { type: "literal", value: t.value === "true" };
          if (t.value === "null") return { type: "literal", value: null };
          if (["and", "or", "not"].includes(t.value)) throw new ExpressionError(`Unexpected "${t.value}"`, t.pos);
          if (!isOp("(")) throw new ExpressionError(`Unknown word "${t.value}": put question ids in braces, like {${t.value}}`, t.pos);
          at++;
          const args: ExpressionNode[] = [];
          if (!isOp(")")) {
            args.push(or());
            while (isOp(",")) {
              at++;
              args.push(or());
            }
          }
          expect(")");
          return { type: "call", name: t.value, args };
        }
        case "op":
          if (t.value === "(") {
            at++;
            const inner = or();
            expect(")");
            return inner;
          }
          throw new ExpressionError(`Unexpected "${t.value}"`, t.pos);
        case "end":
          throw new ExpressionError("Unexpected end of expression", t.pos);
      }
    });

  const unary = (): ExpressionNode =>
    nested(() => {
      if (isOp("-")) {
        at++;
        return { type: "unary", op: "-", arg: unary() };
      }
      if (isOp("+")) {
        at++;
        return unary();
      }
      return primary();
    });

  const opOf = (ops: string[]) => () => {
    const t = peek();
    return t.kind === "op" && ops.includes(t.value) ? (t.value as BinaryOperator) : null;
  };
  const multiplicative = binaryLevel(unary, opOf(["*", "/", "%"]));
  const additive = binaryLevel(multiplicative, opOf(["+", "-"]));
  const comparison = binaryLevel(additive, () => {
    const t = peek();
    return t.kind === "op" ? (COMPARISON[t.value] ?? null) : null;
  });
  const not = (): ExpressionNode =>
    nested(() => {
      if (isWord("not")) {
        at++;
        return { type: "unary", op: "not", arg: not() };
      }
      return comparison();
    });
  const and = binaryLevel(not, () => (isWord("and") ? "and" : null));
  const or: () => ExpressionNode = binaryLevel(and, () => (isWord("or") ? "or" : null));

  if (peek().kind === "end") throw new ExpressionError("Empty expression", 0);
  const tree = or();
  if (peek().kind !== "end") throw new ExpressionError("Unexpected text after the expression", peek().pos);
  return tree;
}

/** A reference inside an expression. */
export interface ExpressionRef {
  name: string;
  path: string[];
  scope?: "item";
}

/** Every reference in an expression, in order. */
export function expressionRefs(node: ExpressionNode): ExpressionRef[] {
  switch (node.type) {
    case "literal":
      return [];
    case "ref":
      return [{ name: node.name, path: node.path, ...(node.scope ? { scope: node.scope } : {}) }];
    case "unary":
      return expressionRefs(node.arg);
    case "binary":
      return [...expressionRefs(node.left), ...expressionRefs(node.right)];
    case "call":
      return node.args.flatMap(expressionRefs);
  }
}

/** The names of every function an expression calls. */
export function expressionFunctions(node: ExpressionNode): string[] {
  switch (node.type) {
    case "literal":
    case "ref":
      return [];
    case "unary":
      return expressionFunctions(node.arg);
    case "binary":
      return [...expressionFunctions(node.left), ...expressionFunctions(node.right)];
    case "call":
      return [node.name, ...node.args.flatMap(expressionFunctions)];
  }
}
