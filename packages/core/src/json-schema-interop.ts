/**
 * JSON Schema interop, both ways:
 *
 * - `answersJsonSchema(survey)` describes what a valid set of answers looks
 *   like, so a backend that doesn't run Kvesto can still check submissions.
 *   Conditional logic can't be written in JSON Schema, so a question that is
 *   only sometimes shown or required is optional here; `validateAnswers` is
 *   the full check.
 * - `surveyFromJsonSchema(schema)` turns an existing JSON Schema (types,
 *   enums, required, ranges, lengths, patterns) into a draft survey.
 */
import {
  isCustomQuestion,
  textOf,
  type Element,
  type Question,
  type Survey,
  type SurveyInput,
  type Validator,
} from "@kvesto/schema";

type Schema = Record<string, unknown>;

const FILE: Schema = {
  type: "object",
  required: ["name", "type", "size", "url"],
  properties: { name: { type: "string", minLength: 1 }, type: { type: "string" }, size: { type: "integer", minimum: 0 }, url: { type: "string", minLength: 1 } },
};

/** Ranges and lengths from validators, as JSON Schema keywords. */
function fromValidators(validators: Validator[] | undefined, kind: "string" | "number" | "array"): Schema {
  const out: Schema = {};
  for (const v of validators ?? []) {
    if (v.type === "length" && kind === "string") {
      if (v.min !== undefined) out.minLength = v.min;
      if (v.max !== undefined) out.maxLength = v.max;
    } else if (v.type === "pattern" && kind === "string") out.pattern = `^(?:${v.pattern})$`;
    else if (v.type === "email" && kind === "string") out.format = "email";
    else if (v.type === "url" && kind === "string") out.format = "uri";
    else if (v.type === "range" && kind === "number") {
      if (typeof v.min === "number") out.minimum = v.min;
      if (typeof v.max === "number") out.maximum = v.max;
    } else if (v.type === "count" && kind === "array") {
      if (v.min !== undefined) out.minItems = v.min;
      if (v.max !== undefined) out.maxItems = v.max;
    }
  }
  return out;
}

const values = (choices: { value: string }[]) => choices.map((c) => c.value);

/** The JSON Schema of one question's answer. */
export function answerSchema(q: Question): Schema {
  const title = textOf(q.title);
  const base: Schema = { title, ...(q.description ? { description: textOf(q.description) } : {}) };
  if (isCustomQuestion(q)) return base;
  switch (q.type) {
    case "text": {
      const format = q.inputType === "email" ? { format: "email" } : q.inputType === "url" ? { format: "uri" } : q.inputType === "date" ? { format: "date" } : {};
      // Number questions answer with text, such as "42".
      const numeric = q.inputType === "number" ? { pattern: "^-?\\d+(\\.\\d+)?$" } : {};
      return { ...base, type: "string", ...format, ...numeric, ...fromValidators(q.validators, "string") };
    }
    case "comment":
      return { ...base, type: "string", ...fromValidators(q.validators, "string") };
    case "single-choice":
    case "dropdown":
      return { ...base, enum: values(q.choices) };
    case "image-choice":
      return q.multiple
        ? { ...base, type: "array", items: { enum: values(q.choices) }, uniqueItems: true, ...fromValidators(q.validators, "array") }
        : { ...base, enum: values(q.choices) };
    case "multiple-choice":
      return { ...base, type: "array", items: { enum: values(q.choices) }, uniqueItems: true, ...fromValidators(q.validators, "array") };
    case "tags":
      return {
        ...base,
        type: "array",
        items: q.allowCustom ? { type: "string", minLength: 1, maxLength: 200 } : { enum: values(q.choices) },
        uniqueItems: true,
        ...(q.maxTags !== undefined ? { maxItems: q.maxTags } : {}),
        ...fromValidators(q.validators, "array"),
      };
    case "ranking":
      return { ...base, type: "array", items: { enum: values(q.choices) }, uniqueItems: true, minItems: q.choices.length, maxItems: q.choices.length };
    case "rating":
      return { ...base, type: "integer", minimum: q.min, maximum: q.max, ...fromValidators(q.validators, "number") };
    case "slider":
      return { ...base, type: "number", minimum: q.min, maximum: q.max, multipleOf: q.step, ...fromValidators(q.validators, "number") };
    case "boolean":
      return { ...base, type: "boolean" };
    case "matrix": {
      const cell = q.multiple ? { type: "array", items: { enum: values(q.columns) }, uniqueItems: true } : { enum: values(q.columns) };
      return {
        ...base,
        type: "object",
        properties: Object.fromEntries(q.rows.map((r) => [r.value, { title: textOf(r.label), ...cell }])),
        additionalProperties: false,
        ...(q.required ? { required: values(q.rows) } : {}),
      };
    }
    case "grid": {
      const cellOf = (c: (typeof q.columns)[number]): Schema =>
        c.cellType === "number" ? { type: "number" } : c.cellType === "boolean" ? { type: "boolean" } : c.cellType === "dropdown" ? { enum: values(c.choices ?? []) } : { type: "string" };
      const row: Schema = {
        type: "object",
        properties: Object.fromEntries(q.columns.map((c) => [c.value, { title: textOf(c.label), ...cellOf(c) }])),
        additionalProperties: false,
      };
      return { ...base, type: "object", properties: Object.fromEntries(q.rows.map((r) => [r.value, { title: textOf(r.label), ...row }])), additionalProperties: false };
    }
    case "multi-text":
      return {
        ...base,
        type: "object",
        properties: Object.fromEntries(q.items.map((i) => [i.value, { title: textOf(i.label), type: "string" }])),
        additionalProperties: false,
      };
    case "file":
      return { ...base, type: "array", items: FILE, maxItems: q.maxFiles, ...fromValidators(q.validators, "array") };
    case "signature":
      return { ...base, type: "array", items: FILE, maxItems: 1 };
    case "computed":
      return { ...base, type: ["string", "number", "boolean", "array", "null"], readOnly: true };
  }
}

/**
 * A JSON Schema (draft 2020-12) for the answers of a response to `survey`.
 * Questions that are always shown and always required are `required`;
 * anything that depends on logic is optional.
 */
export function answersJsonSchema(survey: Survey): Schema {
  const required: string[] = [];
  const conditional = (el: { visibleIf?: unknown }) => el.visibleIf !== undefined;
  const collect = (elements: readonly Element[], into: Record<string, Schema>, req: string[], shownAlways: boolean) => {
    for (const el of elements) {
      if (el.type === "content" || el.type === "image") continue;
      const always = shownAlways && !conditional(el);
      if (el.type === "panel") {
        if (!el.repeat) {
          collect(el.elements, into, req, always);
          continue;
        }
        const props: Record<string, Schema> = {};
        const itemReq: string[] = [];
        collect(el.elements, props, itemReq, true);
        into[el.id] = {
          ...(el.title ? { title: textOf(el.title) } : {}),
          type: "array",
          items: { type: "object", properties: props, additionalProperties: false, ...(itemReq.length ? { required: itemReq } : {}) },
          ...(el.repeat.min !== undefined ? { minItems: el.repeat.min } : {}),
          ...(el.repeat.max !== undefined ? { maxItems: el.repeat.max } : {}),
        };
        if (always && (el.repeat.min ?? 0) > 0) req.push(el.id);
        continue;
      }
      into[el.id] = answerSchema(el);
      if (always && el.required && !el.requiredIf && el.type !== "computed") req.push(el.id);
    }
  };
  const properties: Record<string, Schema> = {};
  for (const page of survey.pages) collect(page.elements, properties, required, page.visibleIf === undefined);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `Answers to "${textOf(survey.title)}"`,
    description:
      "Generated by Kvesto from the survey. Conditional logic (visibleIf, requiredIf, expressions) can't be expressed " +
      "here, so questions that depend on it are optional; validate with Kvesto's validateAnswers for the full check.",
    type: "object",
    properties,
    additionalProperties: false,
    ...(required.length ? { required } : {}),
  };
}

// ── From JSON Schema ─────────────────────────────────────────────────────────

const ID = /^[A-Za-z0-9_-]+$/;
const asId = (key: string) => (ID.test(key) ? key : key.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "field");
const titleOf = (key: string, s: Schema) =>
  typeof s.title === "string" && s.title ? s.title : key.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * A draft survey from a JSON Schema of an object: one question per property,
 * with types, enums, `required`, ranges, lengths and patterns carried over.
 * Nested objects become panels (their fields' ids are prefixed). Anything that
 * can't be carried over is listed in `issues`.
 */
export function surveyFromJsonSchema(schema: Schema, { id = "imported", title }: { id?: string; title?: string } = {}): { survey: SurveyInput; issues: string[] } {
  const issues: string[] = [];
  const used = new Set<string>();
  const unique = (base: string) => {
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return id;
  };
  const enumChoices = (list: unknown[]) => list.map((v) => ({ value: String(v), label: String(v) }));

  const question = (key: string, s: Schema, required: boolean, path: string): Record<string, unknown> | null => {
    const qid = unique(asId(key));
    const base: Record<string, unknown> = { id: qid, title: titleOf(key, s), ...(typeof s.description === "string" ? { description: s.description } : {}), ...(required ? { required: true } : {}) };
    const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
    const validators: Record<string, unknown>[] = [];
    if (Array.isArray(s.enum)) {
      if (s.enum.some((v) => typeof v !== "string")) issues.push(`${path}: non-text enum values became text`);
      return { ...base, type: s.enum.length > 6 ? "dropdown" : "single-choice", choices: enumChoices(s.enum) };
    }
    if (type === "string") {
      const inputType = s.format === "email" ? "email" : s.format === "uri" || s.format === "url" ? "url" : s.format === "date" ? "date" : undefined;
      if (s.minLength !== undefined || s.maxLength !== undefined) {
        validators.push({ type: "length", ...(typeof s.minLength === "number" ? { min: s.minLength } : {}), ...(typeof s.maxLength === "number" ? { max: s.maxLength } : {}) });
      }
      if (typeof s.pattern === "string") {
        // JSON Schema patterns search anywhere; Kvesto's must match the whole answer.
        const p = s.pattern.replace(/^\^/, "").replace(/\$$/, "");
        validators.push({ type: "pattern", pattern: s.pattern.startsWith("^") && s.pattern.endsWith("$") ? p : `.*(?:${p}).*` });
      }
      if (s.format && !inputType) issues.push(`${path}: format "${String(s.format)}" is not carried over`);
      const long = typeof s.maxLength === "number" && s.maxLength > 200;
      return { ...base, type: long ? "comment" : "text", ...(inputType && !long ? { inputType } : {}), ...(validators.length ? { validators } : {}) };
    }
    if (type === "integer" || type === "number") {
      const min = typeof s.minimum === "number" ? s.minimum : undefined;
      const max = typeof s.maximum === "number" ? s.maximum : undefined;
      if (type === "integer" && min !== undefined && max !== undefined && max - min <= 10) return { ...base, type: "rating", min, max };
      if (min !== undefined || max !== undefined) validators.push({ type: "range", ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) });
      issues.push(`${path}: numbers are answered as text by a number input`);
      return { ...base, type: "text", inputType: "number", ...(validators.length ? { validators } : {}) };
    }
    if (type === "boolean") return { ...base, type: "boolean" };
    if (type === "array") {
      const items = (s.items ?? {}) as Schema;
      const count = s.minItems !== undefined || s.maxItems !== undefined
        ? [{ type: "count", ...(typeof s.minItems === "number" ? { min: s.minItems } : {}), ...(typeof s.maxItems === "number" ? { max: s.maxItems } : {}) }]
        : [];
      if (Array.isArray(items.enum)) return { ...base, type: "multiple-choice", choices: enumChoices(items.enum), ...(count.length ? { validators: count } : {}) };
      if (items.type === "string") {
        issues.push(`${path}: a list of free text became tags`);
        return { ...base, type: "tags", choices: [{ value: "example", label: "Example" }], allowCustom: true };
      }
      issues.push(`${path}: lists of ${String(items.type ?? "objects")} are not supported and were left out`);
      return null;
    }
    if (type === "object") return null;
    issues.push(`${path}: type ${JSON.stringify(s.type)} is not supported and was left out`);
    return null;
  };

  const elements = (s: Schema, path: string, prefix: string): Record<string, unknown>[] => {
    const props = (s.properties ?? {}) as Record<string, Schema>;
    const req = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
    const out: Record<string, unknown>[] = [];
    for (const [key, sub] of Object.entries(props)) {
      const subType = Array.isArray(sub.type) ? sub.type.find((t) => t !== "null") : sub.type;
      if (subType === "object" && sub.properties) {
        issues.push(`${path}${key}: nested objects became a panel; answers are flat, so its fields are prefixed with "${key}_"`);
        out.push({ id: unique(asId(key)), type: "panel", title: titleOf(key, sub), elements: elements(sub, `${path}${key}.`, `${key}_`) });
        continue;
      }
      const q = question(`${prefix}${key}`, sub, req.has(key), `${path}${key}`);
      if (q) out.push(q);
    }
    for (const k of ["oneOf", "anyOf", "allOf", "if", "dependentRequired", "dependentSchemas"]) {
      if (k in s) issues.push(`${path || "(root)"}: "${k}" can't be carried over; add conditions in the editor`);
    }
    return out;
  };

  const survey = {
    schemaVersion: 1,
    id: asId(id),
    title: title ?? (typeof schema.title === "string" && schema.title ? schema.title : "Imported survey"),
    ...(typeof schema.description === "string" ? { description: schema.description } : {}),
    pages: [{ id: "p1", elements: elements(schema, "", "") }],
  } as SurveyInput;
  return { survey, issues };
}
