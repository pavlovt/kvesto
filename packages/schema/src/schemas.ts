/**
 * The Kvesto survey JSON format.
 *
 * Every survey document carries a `schemaVersion`. Bump `SURVEY_SCHEMA_VERSION`
 * when the format changes in a breaking way and add a migration in `migrate.ts`.
 */
import { regexRisk } from "./regex.js";
import { answerLimitIssues, surveyLimitIssues } from "./limits.js";
import { z } from "zod";
import { isQuestion, walkElements } from "./elements.js";
import { textPlaceholders } from "./placeholders.js";
import { LOCALE_PATTERN, type LocalizedText } from "./i18n.js";
import { ExpressionError, MAX_EXPRESSION_LENGTH, expressionRefs, parseExpression, type ExpressionRef } from "./expression.js";

export const SURVEY_SCHEMA_VERSION = 1 as const;

/** Text per locale: `{ "en": "Your name", "bg": "Вашето име" }`. */
export const LocalizedTextSchema = z.record(z.string().regex(LOCALE_PATTERN, "Use a locale code such as en or pt-BR"), z.string());

/**
 * Human-readable text shown to respondents (titles, descriptions, labels,
 * placeholders): a plain string in the survey's default locale, or an object
 * of strings per locale.
 */
export const DisplayTextSchema = z.union([z.string(), LocalizedTextSchema]);
/** Display text that must not be empty (in the default locale, or in some locale). */
export const RequiredDisplayTextSchema = z.union([
  z.string().min(1),
  LocalizedTextSchema.refine((t) => Object.values(t).some((v) => v !== ""), "Text must not be empty"),
]);
/** Display text of at most `max` characters in each locale. */
const boundedText = (max: number) =>
  DisplayTextSchema.refine((t) => (typeof t === "string" ? [t] : Object.values(t)).every((v) => v.length <= max), {
    message: `Text is limited to ${max} characters`,
  });
export type DisplayText = z.infer<typeof DisplayTextSchema>;

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, '-' or '_'");

/** A literal a condition compares an answer with. */
export const ConditionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const ConditionOperatorSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "notContains",
  "in",
  "notIn",
  "empty",
  "notEmpty",
]);

/** Compares the answer to one question (or one matrix row) with a value. */
export const ComparisonSchema = z.object({
  question: id,
  /** For matrix questions: the row whose answer is compared. */
  row: z.string().min(1).optional(),
  /**
   * Inside a repeating panel: `"item"` compares the answer in the same item
   * (an earlier question of that panel). Without it, the question must be
   * outside every repeating panel.
   */
  scope: z.literal("item").optional(),
  op: ConditionOperatorSchema,
  /** Omitted for `empty` / `notEmpty`; an array for `in` / `notIn`. */
  value: z.union([ConditionValueSchema, z.array(ConditionValueSchema)]).optional(),
});

export type ConditionValue = z.infer<typeof ConditionValueSchema>;
export type ConditionOperator = z.infer<typeof ConditionOperatorSchema>;
export type Comparison = z.infer<typeof ComparisonSchema>;
/** A condition written in the expression language, e.g. `{ "expr": "{age} >= 18 and {role} = 'dev'" }`. */
export interface ExpressionCondition {
  expr: string;
}
export type Condition = Comparison | ExpressionCondition | { all: Condition[] } | { any: Condition[] } | { not: Condition };

/** Expression text that must parse. */
export const ExpressionTextSchema = z
  .string()
  .min(1)
  .max(MAX_EXPRESSION_LENGTH)
  .superRefine((text, ctx) => {
    try {
      parseExpression(text);
    } catch (e) {
      if (!(e instanceof ExpressionError)) throw e;
      ctx.addIssue({ code: "custom", message: `${e.message} (at character ${e.position + 1})` });
    }
  });

export const ExpressionConditionSchema = z.object({ expr: ExpressionTextSchema }).strict();

/**
 * Conditional logic as plain JSON data (never evaluated as code).
 *
 * - `{ "question": "role", "op": "eq", "value": "dev" }`
 * - `{ "all": [ ... ] }`, `{ "any": [ ... ] }`, `{ "not": { ... } }`
 *
 * A condition may only refer to questions that come earlier in the survey.
 */
export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    ComparisonSchema.strict(),
    ExpressionConditionSchema,
    z.object({ all: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ any: z.array(ConditionSchema).min(1) }).strict(),
    z.object({ not: ConditionSchema }).strict(),
  ]),
).meta({ id: "Condition", description: "Conditional logic: a comparison, or all / any / not of conditions." });

/** An optional error message shown instead of the validator's default one. */
const validatorMessage = { message: DisplayTextSchema.optional() };
const bound = z.number().int().nonnegative();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

/** Longest regular expression accepted in a `pattern` validator. */
export const MAX_PATTERN_LENGTH = 500;

/** Text must match a regular expression (the whole answer, so `^`/`$` are implied). For text and comment. */
export const PatternValidatorSchema = z.object({
  type: z.literal("pattern"),
  pattern: z
    .string()
    .min(1)
    .max(MAX_PATTERN_LENGTH)
    .superRefine((p, ctx) => {
      const risk = regexRisk(p);
      if (risk) ctx.addIssue({ code: "custom", message: risk });
    }),
  /** Regular expression flags: any of `i`, `m`, `s`, `u`. */
  flags: z.string().regex(/^[imsu]*$/, "Use only the flags i, m, s and u").optional(),
  ...validatorMessage,
});

/** Number of characters. For text and comment. */
export const LengthValidatorSchema = z.object({
  type: z.literal("length"),
  min: bound.optional(),
  max: bound.optional(),
  ...validatorMessage,
});

/**
 * Allowed values. Numbers for ratings and `inputType: "number"` text,
 * YYYY-MM-DD dates for `inputType: "date"` text.
 */
export const RangeValidatorSchema = z.object({
  type: z.literal("range"),
  min: z.union([z.number(), isoDate]).optional(),
  max: z.union([z.number(), isoDate]).optional(),
  ...validatorMessage,
});

/** How many options are picked (multiple choice), files attached, or matrix rows answered. */
export const CountValidatorSchema = z.object({
  type: z.literal("count"),
  min: bound.optional(),
  max: bound.optional(),
  ...validatorMessage,
});

/** A well-formed email address. For text. */
export const EmailValidatorSchema = z.object({ type: z.literal("email"), ...validatorMessage });

/** An absolute http(s) URL. For text. */
export const UrlValidatorSchema = z.object({ type: z.literal("url"), ...validatorMessage });

/**
 * An expression that must hold for the answer, e.g. `{end} > {start}` on the
 * `end` question. May use the question itself and earlier questions.
 */
export const ExpressionValidatorSchema = z.object({ type: z.literal("expression"), expr: ExpressionTextSchema, ...validatorMessage });

/**
 * A rule implemented by the host application: a function registered under
 * `name` with `createSurvey({ validators })` and the server's `createApp({ validators })`.
 */
export const CustomValidatorSchema = z.object({
  type: z.literal("custom"),
  name: id,
  /** Passed to the registered function as-is. */
  options: z.record(z.string(), z.unknown()).optional(),
  ...validatorMessage,
});

export const ValidatorSchema = z
  .discriminatedUnion("type", [
    PatternValidatorSchema,
    LengthValidatorSchema,
    RangeValidatorSchema,
    CountValidatorSchema,
    EmailValidatorSchema,
    UrlValidatorSchema,
    ExpressionValidatorSchema,
    CustomValidatorSchema,
  ])
  .meta({ id: "Validator", description: "A rule an answer must follow, checked by the runner and the server." });

export type Validator = z.infer<typeof ValidatorSchema>;
export type ValidatorType = Validator["type"];
export type PatternValidator = z.infer<typeof PatternValidatorSchema>;
export type RangeValidator = z.infer<typeof RangeValidatorSchema>;
export type CustomValidator = z.infer<typeof CustomValidatorSchema>;
export type ExpressionValidator = z.infer<typeof ExpressionValidatorSchema>;

const questionBase = {
  id,
  title: RequiredDisplayTextSchema,
  description: DisplayTextSchema.optional(),
  required: z.boolean().optional(),
  /** Show the question only while this condition holds. Hidden questions are not validated or submitted. */
  visibleIf: ConditionSchema.optional(),
  /** Make the question required while this condition holds (in addition to `required`). */
  requiredIf: ConditionSchema.optional(),
  /** Extra rules for a non-empty answer. Empty answers are only checked by `required`. */
  validators: z.array(ValidatorSchema).optional(),
  /** The starting answer. */
  // Lazy: the answer schemas are defined further down.
  defaultValue: z.lazy(() => ItemAnswerValueSchema).optional(),
  /** A starting answer worked out when the question is first shown, e.g. `"{price} * {quantity}"`. */
  defaultExpr: ExpressionTextSchema.optional(),
  /** Shown but not editable. The server refuses an answer that differs from the default. */
  readOnly: z.boolean().optional(),
  /**
   * Personal data. The server masks the answer in response lists, exports and webhooks unless the caller may
   * `response:read-pii`.
   */
  pii: z.boolean().optional(),
  /** Editable only while this condition holds; otherwise shown read-only. */
  enableIf: ConditionSchema.optional(),
  /** Clear the answer whenever this condition becomes true (for example when an earlier choice changes). */
  resetIf: ConditionSchema.optional(),
  /** Quizzes: the right answer (a list for several choices, an object of row → column for a matrix). */
  correctAnswer: z.lazy(() => ItemAnswerValueSchema).optional(),
  /** What a right answer is worth. Default 1. */
  points: z.number().nonnegative().optional(),
  /** Lists and matrices: points for each right part instead of all or nothing. */
  partialCredit: z.boolean().optional(),
  /** With partial credit: points taken off for each wrong choice (never below zero). */
  penalty: z.number().nonnegative().optional(),
  /** Shown after submitting, when the quiz shows correct answers. */
  feedback: z.object({ correct: DisplayTextSchema.optional(), wrong: DisplayTextSchema.optional() }).optional(),
};

export const ChoiceSchema = z.object({
  value: z.string().min(1),
  label: RequiredDisplayTextSchema,
  /** Assessments: what picking this choice scores. */
  score: z.number().optional(),
});

/** An image source: an http(s) URL, a relative path, or a `data:image/…` URL. Never `javascript:` and the like. */
export const ImageSourceSchema = z
  .string()
  .min(1)
  .max(2_000_000)
  .refine((src) => /^(https?:\/\/|data:image\/[a-z+.-]+[;,]|\/|\.{1,2}\/|[A-Za-z0-9_-][^:]*$)/i.test(src), {
    message: "Use an http(s) URL, a relative path or a data:image URL",
  });

/** A choice shown as a picture. The label is the picture's text alternative too. */
export const ImageChoiceSchema = ChoiceSchema.extend({ imageUrl: ImageSourceSchema });

export const TextQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("text"),
  placeholder: DisplayTextSchema.optional(),
  inputType: z.enum(["text", "email", "number", "date", "url", "tel"]).optional(),
  /**
   * The HTML `autocomplete` token, so browsers can fill personal data (WCAG 1.3.5), e.g. "name", "email",
   * "postal-code". Email, phone and URL inputs get one by default.
   */
  autocomplete: z.string().max(100).regex(/^[a-z0-9 -]+$/).optional(),
});

export const CommentQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("comment"),
  placeholder: DisplayTextSchema.optional(),
  rows: z.number().int().positive().optional(),
});

export const SingleChoiceQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("single-choice"),
  choices: z.array(ChoiceSchema).min(1),
});

export const MultipleChoiceQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("multiple-choice"),
  choices: z.array(ChoiceSchema).min(1),
});

export const DropdownQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("dropdown"),
  choices: z.array(ChoiceSchema).min(1),
  /** Type to filter the choices, for long lists. */
  searchable: z.boolean().optional(),
});

/** One input of a multi-text question. */
export const MultiTextItemSchema = z.object({
  value: z.string().min(1),
  label: RequiredDisplayTextSchema,
  inputType: z.enum(["text", "number", "email", "tel", "url", "date"]).optional(),
  /** This input must be filled in whenever the question is answered (or required). */
  required: z.boolean().optional(),
  /**
   * The HTML `autocomplete` token, so browsers can fill personal data (WCAG 1.3.5), e.g. "name", "email",
   * "postal-code". Email, phone and URL inputs get one by default.
   */
  autocomplete: z.string().max(100).regex(/^[a-z0-9 -]+$/).optional(),
});

/** Several labelled inputs in one question. Answer: `{ [itemValue]: string }`. */
export const MultiTextQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("multi-text"),
  items: z.array(MultiTextItemSchema).min(1),
});

/** A number picked on a slider. Answer: a number. */
export const SliderQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("slider"),
  min: z.number().default(0),
  max: z.number().default(100),
  step: z.number().positive().default(1),
  /** Shown after the value, such as "%" or "km". */
  unit: DisplayTextSchema.optional(),
});

/** Pick several from a searchable list, optionally adding your own. Answer: choice values (and typed entries). */
export const TagsQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("tags"),
  choices: z.array(ChoiceSchema).min(1),
  /** Let respondents add entries that aren't in the list. */
  allowCustom: z.boolean().optional(),
  /** Most entries. */
  maxTags: z.number().int().positive().optional(),
});

/** Choose pictures. Answer: a choice value, or several with `multiple`. */
export const ImageChoiceQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("image-choice"),
  choices: z.array(ImageChoiceSchema).min(1),
  multiple: z.boolean().optional(),
});

export const RatingQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("rating"),
  min: z.number().int().default(1),
  max: z.number().int().default(5),
});

export const BooleanQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("boolean"),
  labelTrue: DisplayTextSchema.optional(),
  labelFalse: DisplayTextSchema.optional(),
  /**
   * A consent checkbox: the title is what the respondent agrees to. It must be ticked before the survey can be
   * submitted, and the server records the text and the time with the response (`meta.consent`).
   */
  consent: z.boolean().optional(),
});

/**
 * A grid: each row is a statement, each column is one of a shared set of answers.
 * Answer: `{ [rowValue]: columnValue }`, or `{ [rowValue]: columnValue[] }` with `multiple`.
 * `required` means every row must be answered.
 */
export const MatrixQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("matrix"),
  rows: z.array(ChoiceSchema).min(1),
  columns: z.array(ChoiceSchema).min(1),
  /** Allow several columns per row (checkboxes instead of radio buttons). */
  multiple: z.boolean().optional(),
});

/** One column of a grid question: what kind of input each cell of the column has. */
export const GridColumnSchema = z.object({
  value: z.string().min(1),
  label: RequiredDisplayTextSchema,
  /** The input in each cell. */
  cellType: z.enum(["text", "number", "dropdown", "boolean"]),
  /** The options of a `dropdown` column. */
  choices: z.array(ChoiceSchema).min(1).optional(),
  /** Every row the respondent fills in must have this column too. */
  required: z.boolean().optional(),
  /** Rules for each non-empty cell (pattern and length for text, range for number). */
  validators: z.array(ValidatorSchema).optional(),
});

/**
 * A grid of inputs: each row is a statement, each column an input of its own type.
 * Answer: `{ [rowValue]: { [columnValue]: string | number | boolean } }`.
 * `required` means at least one row filled in; a `required` column must be filled in every row that is.
 */
export const GridQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("grid"),
  rows: z.array(ChoiceSchema).min(1),
  columns: z.array(GridColumnSchema).min(1),
});

/** Order a list of choices. Answer: every choice value, most preferred first. */
export const RankingQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("ranking"),
  choices: z.array(ChoiceSchema).min(2),
});

/**
 * File upload. Files go through the storage adapter's `uploadFile`; without one
 * they are embedded in the answer as data URLs.
 */
export const FileQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("file"),
  /** Accepted MIME types or extensions, e.g. ["image/*", "application/pdf", ".csv"]. Default: anything. */
  accept: z.array(z.string().min(1)).optional(),
  /** Maximum size per file in bytes. */
  maxSize: z.number().int().positive().optional(),
  /** How many files a respondent may attach. Default 1. */
  maxFiles: z.number().int().positive().default(1),
});

/**
 * A read-only value worked out from an expression, such as a total. It is
 * shown to the respondent and stored with the response under its id; the
 * server recalculates it rather than trusting the client.
 */
export const ComputedQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("computed"),
  expr: ExpressionTextSchema,
  /** Round numbers to this many decimals for display. */
  decimals: z.number().int().min(0).max(10).optional(),
  /** Text before and after the value, such as a currency sign or a unit. */
  prefix: DisplayTextSchema.optional(),
  suffix: DisplayTextSchema.optional(),
});

/** A named value worked out from answers, usable in expressions and piping as `{name}`. */
export const VariableSchema = z.object({ name: id, expr: ExpressionTextSchema });
export type Variable = z.infer<typeof VariableSchema>;

/** What a trigger does when its condition becomes true. */
export const TriggerActionSchema = z.discriminatedUnion("type", [
  /** Set a question's answer. */
  z.object({ type: z.literal("setValue"), question: id, value: z.lazy(() => ItemAnswerValueSchema) }),
  /** Copy one question's answer to another. */
  z.object({ type: z.literal("copyValue"), from: id, to: id }),
  /** Go to a page. */
  z.object({ type: z.literal("skipToPage"), page: id }),
  /** Submit the survey. */
  z.object({ type: z.literal("complete") }),
]);

/**
 * Runs an action when its condition becomes true (not on every change while
 * it stays true). Evaluated by the runner on every answer change.
 */
export const TriggerSchema = z.object({ when: ConditionSchema, action: TriggerActionSchema });
export type Trigger = z.infer<typeof TriggerSchema>;
export type TriggerAction = z.infer<typeof TriggerActionSchema>;

/**
 * A signature drawn with a mouse, pen or finger. Saved as a PNG through the
 * storage adapter's `uploadFile`, like a file question, so the answer is a
 * one-item list of files.
 */
export const SignatureQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("signature"),
  /** Drawing area in CSS pixels. */
  width: z.number().int().min(100).max(2000).default(400),
  height: z.number().int().min(50).max(1000).default(160),
  /** Pen colour, a CSS colour. Default black. */
  penColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional(),
  /** Largest PNG in bytes. Default 512 KB. */
  maxSize: z.number().int().positive().optional(),
});

/** The type name of a custom question type: `x-` and then lower-case letters, digits and dashes. */
export const CustomQuestionTypeSchema = z.templateLiteral(["x-", z.string().regex(/^[a-z0-9][a-z0-9-]*$/)]);
export type CustomQuestionType = z.infer<typeof CustomQuestionTypeSchema>;

/**
 * A question of a type registered by the host with `registerQuestionType`
 * (`"type": "x-signature"`). Its own fields are checked against the
 * registered schema when the survey is loaded; here only the common fields are.
 */
export const CustomQuestionSchema = z.looseObject({ ...questionBase, type: CustomQuestionTypeSchema });
export type CustomQuestion = z.infer<typeof CustomQuestionSchema>;

/** The built-in question types. */
export const BuiltinQuestionSchema = z.discriminatedUnion("type", [
  TextQuestionSchema,
  CommentQuestionSchema,
  SingleChoiceQuestionSchema,
  MultipleChoiceQuestionSchema,
  DropdownQuestionSchema,
  RatingQuestionSchema,
  BooleanQuestionSchema,
  MatrixQuestionSchema,
  RankingQuestionSchema,
  FileQuestionSchema,
  GridQuestionSchema,
  ComputedQuestionSchema,
  MultiTextQuestionSchema,
  SliderQuestionSchema,
  TagsQuestionSchema,
  ImageChoiceQuestionSchema,
  SignatureQuestionSchema,
]);

export const QuestionSchema = z.union([BuiltinQuestionSchema, CustomQuestionSchema]);

/** Largest signature image accepted by default, in bytes. */
export const DEFAULT_SIGNATURE_MAX_SIZE = 512 * 1024;

/**
 * The upload rules of a signature, as a file question: one PNG, up to
 * `maxSize`. Signatures are stored and checked exactly like uploaded files.
 */
export function signatureFileRules(q: SignatureQuestion): FileQuestion {
  return { ...q, type: "file", accept: ["image/png"], maxSize: q.maxSize ?? DEFAULT_SIGNATURE_MAX_SIZE, maxFiles: 1 } as FileQuestion;
}

/** A file or signature question as the file rules that apply to it. */
export function fileRules(q: FileQuestion | SignatureQuestion): FileQuestion {
  return q.type === "signature" ? signatureFileRules(q) : q;
}

/** Is this a question of a registered custom type (`x-…`)? */
export function isCustomQuestion(q: { type: string }): q is CustomQuestion {
  return q.type.startsWith("x-");
}

/**
 * A group of elements with an optional title, shown as one block. Panels can
 * be nested. Hiding a panel hides everything in it. Panels don't change the
 * answers: questions keep unique ids across the survey and answers stay flat,
 * keyed by question id.
 */
export interface Panel {
  type: "panel";
  id: string;
  title?: DisplayText;
  description?: DisplayText;
  /** Show the panel (and everything in it) only while this condition holds. */
  visibleIf?: Condition;
  /** Make the panel repeatable: respondents add and remove copies of its contents. */
  repeat?: Repeat;
  elements: Element[];
}

/**
 * Settings of a repeating panel. Its answer is stored under the panel id as a
 * list of items, each an object of answers keyed by question id:
 * `{ "children": [{ "name": "Ana", "age": 7 }, { "name": "Ivo", "age": 4 }] }`.
 */
export interface Repeat {
  /** Fewest items. The runner starts with this many. Default 0. */
  min?: number;
  /** Most items. Default: no limit. */
  max?: number;
  /** Text of the add button. */
  addLabel?: DisplayText;
  /** Text of each item's remove button. */
  removeLabel?: DisplayText;
  /** Title of each item; `{n}` is replaced by the item number. */
  itemTitle?: DisplayText;
}

export const RepeatSchema: z.ZodType<Repeat> = z.object({
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().positive().optional(),
  addLabel: DisplayTextSchema.optional(),
  removeLabel: DisplayTextSchema.optional(),
  itemTitle: DisplayTextSchema.optional(),
});

/** Longest content block text accepted. */
export const MAX_CONTENT_LENGTH = 20_000;

/**
 * A block of formatted text: a small, safe Markdown subset (paragraphs,
 * `**bold**`, `*italic*`, `[links](https://…)`, and `-` or `1.` lists), with
 * answer placeholders. Raw HTML in `html` is shown only when the host passes
 * a `sanitizeHtml` function to the renderer; otherwise it is ignored.
 */
export const ContentElementSchema = z.object({
  type: z.literal("content"),
  id,
  visibleIf: ConditionSchema.optional(),
  markdown: boundedText(MAX_CONTENT_LENGTH).optional(),
  html: z.string().max(MAX_CONTENT_LENGTH).optional(),
});

/** An image. `alt` describes it for screen readers; use `""` only for a purely decorative image. */
export const ImageElementSchema = z.object({
  type: z.literal("image"),
  id,
  visibleIf: ConditionSchema.optional(),
  src: ImageSourceSchema,
  alt: DisplayTextSchema,
  /** Width in CSS pixels. Default: the image's own width, never wider than the survey. */
  width: z.number().int().positive().max(4000).optional(),
});

export type ContentElement = z.infer<typeof ContentElementSchema>;
export type ImageElement = z.infer<typeof ImageElementSchema>;
/** Something shown on a page that takes no answer. */
export type DisplayElement = ContentElement | ImageElement;

/** How the survey is presented and behaves. Every field is optional. */
export const SurveySettingsSchema = z.looseObject({
  /** `"page"` shows a page at a time (default); `"question"` one question (or panel, or block) at a time. */
  layout: z.enum(["page", "question"]).optional(),
  /** Show a progress bar. Default: on in the question layout, off in the page layout. */
  progressBar: z.boolean().optional(),
  /** In the question layout, go on by itself after a single-choice, yes/no or rating answer. Default true. */
  autoAdvance: z.boolean().optional(),
  /** Make the survey a quiz: scores, a pass mark, time limits. */
  get quiz() {
    return QuizSettingsSchema.optional();
  },
  /**
   * The look: a preset ("light", "dark", "auto", "compact", "contrast"), or theme variables without their
   * `--kv-` prefix, optionally with a `preset` to start from. The renderer's `theme` option overrides it.
   */
  theme: z
    .union([
      z.enum(["light", "dark", "auto", "compact", "contrast"]),
      z.record(
        z.string().regex(/^[a-z0-9-]+$/, "Use the variable name without --kv-, such as color-primary"),
        z.string().max(200).regex(/^[^;{}<>\\]*$/, "Not a CSS value"),
      ),
    ])
    .optional(),
  /** When the survey opens (ISO date-time with a zone). Before then it shows `closedMessage` and takes no responses. */
  opensAt: z.iso.datetime({ offset: true }).optional(),
  /** When the survey closes (ISO date-time with a zone). */
  closesAt: z.iso.datetime({ offset: true }).optional(),
  /** Stop taking responses after this many complete ones. */
  maxResponses: z.number().int().positive().max(100_000_000).optional(),
  /**
   * One response per browser (kept in the browser, so easy to get around) or per respondent (the id the server's
   * `identifyRespondent` gives, enforced by the server).
   */
  oneResponsePer: z.enum(["browser", "respondent"]).optional(),
  /** Only respondents the server identifies (signed in to the host system) may answer. */
  requireRespondent: z.boolean().optional(),
  /**
   * Keep nothing that identifies the respondent: no respondent id (only a salted hash, enough to enforce
   * `oneResponsePer`), no hidden fields except those in `anonymousHidden`, and no client meta beyond progress.
   */
  anonymous: z.boolean().optional(),
  /** Hidden fields an anonymous survey still keeps because they don't identify anyone, such as a campaign. */
  anonymousHidden: z.array(id).optional(),
  /** Delete responses (and their files) this many days after they were created. */
  retentionDays: z.number().int().min(1).max(36_500).optional(),
  /** Shown instead of the survey when it isn't open, is full, or was already answered. */
  closedMessage: DisplayTextSchema.optional(),
  /** Bot friction, enforced by the server. All optional. */
  antiSpam: z
    .object({
      /** A field people can't see; a response that fills it in is refused. */
      honeypot: z.boolean().optional(),
      /** Refuse responses submitted sooner than this many seconds after the survey was loaded. */
      minSeconds: z.number().int().min(1).max(3600).optional(),
      /** Require a CAPTCHA token, checked by the server's `verifyChallenge`. */
      challenge: z.boolean().optional(),
      /** Refuse the same answers from the same address and browser within this many seconds. */
      duplicateWindow: z.number().int().min(1).max(86_400).optional(),
    })
    .optional(),
}).refine((s) => !s.opensAt || !s.closesAt || Date.parse(s.opensAt) < Date.parse(s.closesAt), {
  message: "closesAt must be after opensAt",
  path: ["closesAt"],
});
export type SurveySettings = z.infer<typeof SurveySettingsSchema>;

/** Quiz settings: scoring is on when this is set. */
export const QuizSettingsSchema = z.object({
  /** Show the score after submitting. Default true. */
  showScore: z.boolean().optional(),
  /** Show each question's correct answer and feedback after submitting. Default false. */
  showCorrect: z.boolean().optional(),
  /** The share of the maximum score needed to pass, from 0 to 1. */
  passMark: z.number().min(0).max(1).optional(),
  /** Seconds for the whole survey; then it submits what was answered. */
  timeLimit: z.number().int().positive().max(86_400).optional(),
  /** "immediately" (default), or "manual": scores are kept back until someone releases them. */
  releaseScores: z.enum(["immediately", "manual"]).optional(),
});

/** Survey JSON for a panel as authored, before defaults are applied. */
export interface PanelInput {
  type: "panel";
  id: string;
  title?: DisplayText;
  description?: DisplayText;
  visibleIf?: Condition;
  repeat?: Repeat;
  elements: ElementInput[];
}

/** Something a page or panel can hold: a question, a panel, or a display element (content, image). */
export type Element = Question | Panel | DisplayElement;
export type ElementInput =
  | z.input<typeof QuestionSchema>
  | PanelInput
  | z.input<typeof ContentElementSchema>
  | z.input<typeof ImageElementSchema>;
export type ElementType = Element["type"];

export const PanelSchema: z.ZodType<Panel, PanelInput> = z
  .object({
    type: z.literal("panel"),
    id,
    title: DisplayTextSchema.optional(),
    description: DisplayTextSchema.optional(),
    visibleIf: ConditionSchema.optional(),
    repeat: RepeatSchema.optional(),
    get elements() {
      return z.array(ElementSchema);
    },
  })
  .meta({ id: "Panel", description: "A titled group of questions and panels." }) as unknown as z.ZodType<Panel, PanelInput>;

export const ElementSchema: z.ZodType<Element, ElementInput> = z
  .lazy(() => z.union([QuestionSchema, PanelSchema, ContentElementSchema, ImageElementSchema]))
  .meta({ id: "Element", description: "A question, a panel, or a content block or image." });

export const PageSchema = z.object({
  id,
  title: DisplayTextSchema.optional(),
  /** Show the page only while this condition holds. Hidden pages are skipped. */
  visibleIf: ConditionSchema.optional(),
  /** Seconds the respondent has for this page; then the survey moves on (or submits on the last page). */
  timeLimit: z.number().int().positive().max(86_400).optional(),
  /** Questions and panels, in order. */
  elements: z.array(ElementSchema),
});

/**
 * A grid cell as a stand-alone question, so cell values can be validated
 * with the same rules as questions: text and number cells become text
 * questions (`inputType: "number"`), dropdowns dropdowns, booleans booleans.
 */
export function gridCellQuestion(grid: { id: string }, column: GridColumn): Question {
  const base = { id: `${grid.id}.${column.value}`, title: column.label, ...(column.validators ? { validators: column.validators } : {}) };
  switch (column.cellType) {
    case "text":
      return { ...base, type: "text" };
    case "number":
      return { ...base, type: "text", inputType: "number" };
    case "dropdown":
      return { ...base, type: "dropdown", choices: column.choices ?? [] };
    case "boolean":
      return { ...base, type: "boolean" };
  }
}

/** Is `validator` meaningful for `question`? Returns the reason when not. */
export function validatorProblem(question: Question, validator: Validator): string | null {
  const textual = question.type === "text" || question.type === "comment";
  switch (validator.type) {
    case "pattern":
      try {
        new RegExp(validator.pattern, validator.flags);
      } catch (e) {
        return `Invalid regular expression: ${(e as Error).message}`;
      }
      return textual ? null : "pattern only applies to text and comment questions";
    case "length":
      return textual ? null : "length only applies to text and comment questions";
    case "email":
    case "url":
      return question.type === "text" ? null : `${validator.type} only applies to text questions`;
    case "count":
      return question.type === "multiple-choice" ||
        question.type === "file" ||
        question.type === "matrix" ||
        question.type === "tags" ||
        (question.type === "image-choice" && question.multiple)
        ? null
        : "count only applies to multiple-choice, tags, image-choice with multiple, file and matrix questions";
    case "range": {
      const kind =
        question.type === "rating" || question.type === "slider" || (question.type === "text" && question.inputType === "number")
          ? "number"
          : question.type === "text" && question.inputType === "date"
            ? "string"
            : null;
      if (!kind) return 'range only applies to ratings and text questions with inputType "number" or "date"';
      for (const v of [validator.min, validator.max]) {
        if (v !== undefined && typeof v !== kind) {
          return kind === "number" ? "range bounds must be numbers here" : "range bounds must be YYYY-MM-DD dates here";
        }
      }
      return null;
    }
    case "expression":
    case "custom":
      return null;
  }
}

/** Every comparison inside a condition tree (expression conditions are not comparisons). */
export function conditionComparisons(condition: Condition): Comparison[] {
  if ("all" in condition) return condition.all.flatMap(conditionComparisons);
  if ("any" in condition) return condition.any.flatMap(conditionComparisons);
  if ("not" in condition) return conditionComparisons(condition.not);
  if ("expr" in condition) return [];
  return [condition];
}

/** The text of every expression condition inside a condition tree. */
export function conditionExpressions(condition: Condition): string[] {
  if ("all" in condition) return condition.all.flatMap(conditionExpressions);
  if ("any" in condition) return condition.any.flatMap(conditionExpressions);
  if ("not" in condition) return conditionExpressions(condition.not);
  if ("expr" in condition) return [condition.expr];
  return [];
}

/** The references of an expression, or none when it does not parse (the schema reports that separately). */
export function safeExpressionRefs(text: string): ExpressionRef[] {
  try {
    return expressionRefs(parseExpression(text));
  } catch {
    return [];
  }
}

const uniqueValues = (items: { value: string }[]) => new Set(items.map((i) => i.value)).size === items.length;

export const SurveySchema = z
  .object({
    /** Optional link to the published JSON Schema, so editors can autocomplete and check the file. Ignored by Kvesto. */
    $schema: z.string().optional(),
    schemaVersion: z.literal(SURVEY_SCHEMA_VERSION),
    id,
    title: RequiredDisplayTextSchema,
    description: DisplayTextSchema.optional(),
    pages: z.array(PageSchema).min(1),
    /** Shown after the respondent submits. Takes answer placeholders such as `{name}`. */
    completedText: DisplayTextSchema.optional(),
    /** Named values worked out from answers, usable in expressions and piping as `{name}`. */
    variables: z.array(VariableSchema).optional(),
    /** Actions run when a condition becomes true: set or copy a value, skip to a page, or submit. */
    triggers: z.array(TriggerSchema).optional(),
    /** Presentation and behaviour settings. */
    settings: SurveySettingsSchema.optional(),
    /** The locale of plain-string texts, and the fallback for missing translations. Default "en". */
    defaultLocale: z.string().regex(LOCALE_PATTERN).optional(),
    /** The locales this survey is translated into (the default locale included). */
    locales: z.array(z.string().regex(LOCALE_PATTERN)).optional(),
    /**
     * Values the host fills in without a visible question (a campaign, a user id), from the `hidden`
     * option or, when allowed, URL parameters. Usable in conditions, expressions and piping as `{name}`;
     * stored in the response's `meta.hidden`.
     */
    hiddenFields: z.array(id).optional(),
    /** Machine-translated texts that nobody has checked yet, as text keys per locale. Ignored by the runner. */
    translationsToReview: z.record(z.string().regex(LOCALE_PATTERN), z.array(z.string())).optional(),
  })
  .superRefine((survey, ctx) => {
    for (const issue of surveyLimitIssues(survey)) ctx.addIssue({ code: "custom", ...issue });
    // Questions seen so far, in survey order (conditions may only look back), with the repeating panel they are in.
    const seen = new Map<string, { question: Question; repeat: string | undefined }>();
    const repeats = new Set<string>();
    const repeatOf = (panels: string[]) => panels.find((p) => repeats.has(p));
    const checkCondition = (
      condition: Condition | undefined,
      path: (string | number)[],
      earlierOnly: Set<string>,
      repeat: string | undefined,
    ) => {
      if (!condition) return;
      for (const c of conditionComparisons(condition)) {
        // A hidden field is known from the start.
        if (hiddenNames.has(c.question) && !c.scope && c.row === undefined) continue;
        const target = seen.get(c.question);
        const issue = (message: string) => ctx.addIssue({ code: "custom", path, message });
        if (!target || !earlierOnly.has(c.question)) {
          issue(`Condition refers to "${c.question}", which is not an earlier question`);
        } else if (c.scope === "item" && !repeat) {
          issue(`scope "item" can only be used inside a repeating panel`);
        } else if (c.scope === "item" && target.repeat !== repeat) {
          issue(`"${c.question}" is not in the same repeating panel`);
        } else if (c.scope !== "item" && target.repeat) {
          issue(
            repeat === target.repeat
              ? `"${c.question}" is in this repeating panel: add "scope": "item" to compare the same item`
              : `"${c.question}" is inside a repeating panel, so it has no single answer here`,
          );
        } else if (c.row !== undefined && (target.question.type !== "matrix" || !target.question.rows.some((r) => r.value === c.row))) {
          issue(`"${c.row}" is not a row of matrix question "${c.question}"`);
        }
      }
      for (const text of conditionExpressions(condition)) {
        for (const message of refProblems(safeExpressionRefs(text), earlierOnly, repeat)) {
          ctx.addIssue({ code: "custom", path, message });
        }
      }
    };

    /** What is wrong with each expression reference, given the questions allowed at this point. */
    const refProblems = (refs: ExpressionRef[], earlierOnly: Set<string>, repeat: string | undefined): string[] => {
      const out: string[] = [];
      for (const r of refs) {
        const target = seen.get(r.name);
        const shown = `{${r.scope ? "$item." : ""}${[r.name, ...r.path].join(".")}}`;
        const variable = variableDeps.get(r.name);
        if (hiddenNames.has(r.name) && !r.scope) {
          if (r.path.length) out.push(`${shown}: a hidden field has no parts`);
        } else if (variable && !r.scope) {
          const later = [...variable].filter((q) => !earlierOnly.has(q));
          if (r.path.length) out.push(`${shown}: a variable has no parts`);
          else if (later.length) out.push(`${shown} uses ${later.map((q) => `"${q}"`).join(", ")}, which does not come earlier`);
        } else if (!target || !earlierOnly.has(r.name)) out.push(`${shown} does not refer to an earlier question`);
        else if (r.scope === "item" && !repeat) out.push(`${shown}: $item can only be used inside a repeating panel`);
        else if (r.scope === "item" && target.repeat !== repeat) out.push(`${shown}: "${r.name}" is not in the same repeating panel`);
        else if (r.scope !== "item" && target.repeat) {
          out.push(
            repeat === target.repeat
              ? `${shown}: "${r.name}" is in this repeating panel, use {$item.${r.name}} for the same item`
              : `${shown}: "${r.name}" is inside a repeating panel, so it has no single answer here`,
          );
        } else if (r.path.length) {
          const q = target.question;
          const [row, column, ...rest] = r.path;
          const rowOk = (q.type === "matrix" || q.type === "grid") && q.rows.some((x) => x.value === row);
          const columnOk = column === undefined || (q.type === "grid" && q.columns.some((x) => x.value === column));
          if (!rowOk || !columnOk || rest.length) out.push(`${shown}: "${r.path.join(".")}" is not a part of "${r.name}"`);
        }
      }
      return out;
    };

    // Every question id, so placeholders can tell a question from other text in braces.
    const questionIds = new Set<string>();
    const inRepeat = new Set<string>();
    const allIds = new Set<string>();
    walkElements(survey, (el, at) => {
      allIds.add(el.id);
      if (isQuestion(el)) questionIds.add(el.id);
      if (at.repeat) inRepeat.add(el.id);
    });

    // Variables: unique names, references to questions outside repeats or to other variables, and no cycles.
    // `variableDeps` holds the questions each variable depends on, directly or through other variables.
    const variableDeps = new Map<string, Set<string>>();
    const hiddenNames = new Set(survey.hiddenFields ?? []);
    (survey.hiddenFields ?? []).forEach((name, i) => {
      if (survey.hiddenFields!.indexOf(name) !== i) {
        ctx.addIssue({ code: "custom", path: ["hiddenFields", i], message: `Duplicate hidden field "${name}"` });
      } else if (allIds.has(name) || survey.variables?.some((v) => v.name === name)) {
        ctx.addIssue({ code: "custom", path: ["hiddenFields", i], message: `"${name}" is already an element id or a variable` });
      }
    });
    const variables = survey.variables ?? [];
    const varIndex = new Map(variables.map((v, i) => [v.name, i]));
    variables.forEach((v, i) => {
      if (varIndex.get(v.name) !== i) {
        ctx.addIssue({ code: "custom", path: ["variables", i, "name"], message: `Duplicate variable "${v.name}"` });
      } else if (allIds.has(v.name)) {
        ctx.addIssue({ code: "custom", path: ["variables", i, "name"], message: `"${v.name}" is already an element id` });
      }
    });
    const resolving = new Set<string>();
    const depsOf = (name: string, path: (string | number)[]): Set<string> => {
      const known = variableDeps.get(name);
      if (known) return known;
      const deps = new Set<string>();
      if (resolving.has(name)) {
        ctx.addIssue({ code: "custom", path, message: `Variable "${name}" depends on itself` });
        return deps;
      }
      resolving.add(name);
      const i = varIndex.get(name)!;
      for (const r of safeExpressionRefs(variables[i]!.expr)) {
        const at = ["variables", i, "expr"];
        if (r.scope) ctx.addIssue({ code: "custom", path: at, message: "Variables cannot use $item" });
        else if (varIndex.has(r.name)) for (const d of depsOf(r.name, at)) deps.add(d);
        else if (hiddenNames.has(r.name)) continue;
        else if (!questionIds.has(r.name)) ctx.addIssue({ code: "custom", path: at, message: `{${r.name}} is not a question or variable` });
        else if (inRepeat.has(r.name)) {
          ctx.addIssue({ code: "custom", path: at, message: `"${r.name}" is inside a repeating panel, so it has no single answer here` });
        } else deps.add(r.name);
      }
      resolving.delete(name);
      variableDeps.set(name, deps);
      return deps;
    };
    variables.forEach((v, i) => depsOf(v.name, ["variables", i, "expr"]));
    /** Expressions in elements: they may only refer to earlier questions (and variables built from them). */
    const checkExpression = (text: string | undefined, path: (string | number)[], earlierOnly: Set<string>, repeat: string | undefined) => {
      if (!text) return;
      for (const message of refProblems(safeExpressionRefs(text), earlierOnly, repeat)) ctx.addIssue({ code: "custom", path, message });
    };
    /** Answer placeholders in display text may only refer to earlier questions. Braces around anything else are plain text. */
    const checkText = (
      text: string | LocalizedText | undefined,
      path: (string | number)[],
      earlierOnly: Set<string>,
      repeat: string | undefined,
      { itemRefs = true } = {},
    ) => {
      if (!text) return;
      const all = typeof text === "string" ? text : Object.values(text).join(" ");
      if (!all.includes("{")) return;
      const refs = textPlaceholders(all).filter(
        (r) => (questionIds.has(r.name) || ((variableDeps.has(r.name) || hiddenNames.has(r.name)) && !r.scope)) && (itemRefs || r.scope !== "item"),
      );
      for (const message of refProblems(refs, earlierOnly, repeat)) ctx.addIssue({ code: "custom", path, message });
    };

    const elementIds = new Set<string>();
    let pageIndex = -1;
    walkElements(survey, (el, at) => {
      if (at.pageIndex !== pageIndex) {
        pageIndex = at.pageIndex;
        // A page condition can only use questions from earlier pages.
        const page = survey.pages[pageIndex]!;
        checkCondition(page.visibleIf, ["pages", pageIndex, "visibleIf"], new Set(seen.keys()), undefined);
        checkText(page.title, ["pages", pageIndex, "title"], new Set(seen.keys()), undefined);
      }
      const path = at.path;
      const earlier = new Set(seen.keys());
      const repeat = repeatOf(at.panels);
      checkCondition(el.visibleIf, [...path, "visibleIf"], earlier, repeat);
      if (elementIds.has(el.id)) {
        ctx.addIssue({ code: "custom", path: [...path, "id"], message: `Duplicate element id "${el.id}"` });
      }
      elementIds.add(el.id);
      if (el.type === "content" || el.type === "image") {
        checkText(el.type === "content" ? el.markdown : el.alt, [...path, el.type === "content" ? "markdown" : "alt"], earlier, repeat);
        return;
      }
      checkText(el.title, [...path, "title"], earlier, repeat);
      checkText(el.description, [...path, "description"], earlier, repeat);
      if (el.type === "panel") {
        if (el.repeat) {
          if (repeat) {
            ctx.addIssue({ code: "custom", path: [...path, "repeat"], message: "Repeating panels cannot be nested" });
          }
          repeats.add(el.id);
          // `{$item.q}` in an item title may use any question of the item.
          checkText(el.repeat.itemTitle, [...path, "repeat", "itemTitle"], earlier, repeat, { itemRefs: false });
          const { min, max } = el.repeat;
          if (min !== undefined && max !== undefined && min > max) {
            ctx.addIssue({ code: "custom", path: [...path, "repeat", "max"], message: "max must be at least min" });
          }
        }
        return;
      }
      const q = el;
      checkCondition(q.requiredIf, [...path, "requiredIf"], earlier, repeat);
      checkCondition(q.enableIf, [...path, "enableIf"], earlier, repeat);
      checkCondition(q.resetIf, [...path, "resetIf"], earlier, repeat);
      checkExpression(q.defaultExpr, [...path, "defaultExpr"], earlier, repeat);
      if (q.type === "computed") checkExpression(q.expr, [...path, "expr"], earlier, repeat);
      if (repeat && (q.type === "file" || q.type === "signature")) {
        ctx.addIssue({ code: "custom", path: [...path, "type"], message: `${q.type === "file" ? "File" : "Signature"} questions are not supported in repeating panels yet` });
      }
      if (!isCustomQuestion(q) && "choices" in q && !uniqueValues(q.choices)) {
        ctx.addIssue({ code: "custom", path: [...path, "choices"], message: "Choice values must be unique" });
      }
      if (!isCustomQuestion(q) && "choices" in q) q.choices.forEach((c, ci) => checkText(c.label, [...path, "choices", ci, "label"], earlier, repeat));
      if (q.type === "matrix") {
        if (!uniqueValues(q.rows)) ctx.addIssue({ code: "custom", path: [...path, "rows"], message: "Row values must be unique" });
        if (!uniqueValues(q.columns)) {
          ctx.addIssue({ code: "custom", path: [...path, "columns"], message: "Column values must be unique" });
        }
      }
      if (q.type === "grid") {
        if (!uniqueValues(q.rows)) ctx.addIssue({ code: "custom", path: [...path, "rows"], message: "Row values must be unique" });
        if (!uniqueValues(q.columns)) {
          ctx.addIssue({ code: "custom", path: [...path, "columns"], message: "Column values must be unique" });
        }
        q.columns.forEach((col, ci) => {
          const cpath = [...path, "columns", ci];
          if (col.cellType === "dropdown" && !col.choices) {
            ctx.addIssue({ code: "custom", path: [...cpath, "choices"], message: "A dropdown column needs choices" });
          }
          if (col.choices && !uniqueValues(col.choices)) {
            ctx.addIssue({ code: "custom", path: [...cpath, "choices"], message: "Choice values must be unique" });
          }
          col.validators?.forEach((v, vi) => {
            const problem = validatorProblem(gridCellQuestion(q, col), v);
            if (problem) ctx.addIssue({ code: "custom", path: [...cpath, "validators", vi], message: problem });
          });
        });
      }
      if ((q.type === "rating" || q.type === "slider") && q.min > q.max) {
        ctx.addIssue({ code: "custom", path: [...path, "max"], message: "max must be at least min" });
      }
      if (q.type === "multi-text" && !uniqueValues(q.items)) {
        ctx.addIssue({ code: "custom", path: [...path, "items"], message: "Item values must be unique" });
      }
      // Known from here on: the question's own expression rules may use its answer.
      seen.set(q.id, { question: q, repeat });
      q.validators?.forEach((v, vi) => {
        const vpath = [...path, "validators", vi];
        const problem = validatorProblem(q, v);
        if (problem) ctx.addIssue({ code: "custom", path: vpath, message: problem });
        // An expression rule may also use the answer it checks.
        if (v.type === "expression") checkExpression(v.expr, [...vpath, "expr"], new Set([...earlier, q.id]), repeat);
        if ("min" in v && v.min !== undefined && v.max !== undefined && v.min > v.max) {
          ctx.addIssue({ code: "custom", path: [...vpath, "max"], message: "max must be at least min" });
        }
      });
    });
    // Pages without elements still get their condition checked.
    survey.pages.forEach((page, pi) => {
      if (page.elements.length === 0) {
        checkCondition(page.visibleIf, ["pages", pi, "visibleIf"], new Set(seen.keys()), undefined);
        checkText(page.title, ["pages", pi, "title"], new Set(seen.keys()), undefined);
      }
    });
    // Triggers may use any question outside repeating panels, and act on questions that take typed answers.
    const all = new Set([...seen].filter(([, v]) => !v.repeat).map(([k]) => k));
    survey.triggers?.forEach((t, ti) => {
      const at = ["triggers", ti];
      checkCondition(t.when, [...at, "when"], all, undefined);
      const target = (qid: string, key: string) => {
        const q = seen.get(qid);
        if (!q || q.repeat) ctx.addIssue({ code: "custom", path: [...at, "action", key], message: `"${qid}" is not a question outside a repeating panel` });
        else if (key !== "from" && q.question.type === "computed") {
          ctx.addIssue({ code: "custom", path: [...at, "action", key], message: `"${qid}" is computed, so it can't be set` });
        }
      };
      const a = t.action;
      if (a.type === "setValue") target(a.question, "question");
      if (a.type === "copyValue") {
        target(a.from, "from");
        target(a.to, "to");
      }
      if (a.type === "skipToPage" && !survey.pages.some((p) => p.id === a.page)) {
        ctx.addIssue({ code: "custom", path: [...at, "action", "page"], message: `No page "${a.page}"` });
      }
    });
    // The survey's title and description come before every question; the completion text after all of them.
    checkText(survey.title, ["title"], new Set(), undefined);
    checkText(survey.description, ["description"], new Set(), undefined);
    checkText(survey.completedText, ["completedText"], new Set(seen.keys()), undefined);
  });

/** One uploaded file, as stored in an answer. */
export const FileAnswerSchema = z.object({
  name: z.string().min(1),
  /** MIME type, "" when unknown. */
  type: z.string(),
  /** Size in bytes. */
  size: z.number().int().nonnegative(),
  /** Where to fetch the file: a URL returned by the storage adapter, or a `data:` URL. */
  url: z.string().min(1),
});

/** A matrix answer: row value → column value (or values with `multiple`). */
export const MatrixAnswerSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

/** A grid answer: row value → column value → cell value. */
export const GridAnswerSchema = z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])));

export const ItemAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(FileAnswerSchema),
  MatrixAnswerSchema,
  GridAnswerSchema,
  z.null(),
]);

/** One item of a repeating panel: answers keyed by question id. */
export const RepeatItemSchema = z.record(z.string(), ItemAnswerValueSchema);

/** The answer of a repeating panel: its items, in order. */
export const RepeatAnswerSchema = z.array(RepeatItemSchema);

/**
 * A single answer value. Shape depends on the question type:
 * text/choice → string, rating → number, boolean → boolean,
 * multiple-choice/ranking → string[], file → FileAnswer[], matrix → object,
 * and a repeating panel → a list of answer objects.
 */
export const AnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(FileAnswerSchema),
  MatrixAnswerSchema,
  GridAnswerSchema,
  RepeatAnswerSchema,
  z.null(),
]);

export const AnswersSchema = z.record(z.string(), AnswerValueSchema).superRefine((answers, ctx) => {
  for (const issue of answerLimitIssues(answers)) ctx.addIssue({ code: "custom", ...issue });
});

/** Whether a response was submitted, or saved along the way so the respondent can come back. */
export const ResponseStatusSchema = z.enum(["partial", "complete"]);
export type ResponseStatus = z.infer<typeof ResponseStatusSchema>;

/**
 * What a client sends when a respondent completes a survey, or (with
 * `status: "partial"`) saves their progress. Partial answers are checked
 * like complete ones, except that nothing is required yet.
 */
export const ResponseInputSchema = z.object({
  answers: AnswersSchema,
  meta: z.record(z.string(), z.unknown()).optional(),
  /** Default "complete". */
  status: ResponseStatusSchema.optional(),
});

/** Updates a partial response: more answers, or (with `status: "complete"`) its submission. */
export const ResponseUpdateSchema = ResponseInputSchema.extend({
  /** The resume token returned when the partial response was created. */
  token: z.string().min(1).max(200),
});
export type ResponseUpdate = z.infer<typeof ResponseUpdateSchema>;

/** A stored response. */
export const SurveyResponseSchema = ResponseInputSchema.extend({
  id: z.string(),
  surveyId: id,
  createdAt: z.string(),
  /** When a partial response was last saved, or the response completed. */
  updatedAt: z.string().optional(),
  /**
   * Only in the reply that creates a partial response: the secret that
   * updates, completes or resumes it. Keep it with the respondent.
   */
  resumeToken: z.string().optional(),
  /** Who answered, from the server's `identifyRespondent`. Not kept for anonymous surveys. Set by the server only. */
  respondentId: z.string().max(200).optional(),
});

export type Choice = z.infer<typeof ChoiceSchema>;
export type MatrixQuestion = z.infer<typeof MatrixQuestionSchema>;
export type RankingQuestion = z.infer<typeof RankingQuestionSchema>;
export type FileQuestion = z.infer<typeof FileQuestionSchema>;
export type SignatureQuestion = z.infer<typeof SignatureQuestionSchema>;
export type FileAnswer = z.infer<typeof FileAnswerSchema>;
export type MatrixAnswer = z.infer<typeof MatrixAnswerSchema>;
export type GridAnswer = z.infer<typeof GridAnswerSchema>;
export type GridQuestion = z.infer<typeof GridQuestionSchema>;
export type GridColumn = z.infer<typeof GridColumnSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type BuiltinQuestion = z.infer<typeof BuiltinQuestionSchema>;
export type QuestionType = Question["type"];
export type Page = z.infer<typeof PageSchema>;
export type Survey = z.infer<typeof SurveySchema>;
/** Survey JSON as authored, before defaults are applied. */
export type SurveyInput = z.input<typeof SurveySchema>;
export type AnswerValue = z.infer<typeof AnswerValueSchema>;
export type RepeatItem = z.infer<typeof RepeatItemSchema>;
export type Answers = z.infer<typeof AnswersSchema>;
export type ResponseInput = z.infer<typeof ResponseInputSchema>;
export type SurveyResponse = z.infer<typeof SurveyResponseSchema>;

export { z };
