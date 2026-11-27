/**
 * Custom question types. A host registers a type once with
 * `registerQuestionType`, and surveys then use it as `"type": "x-…"`. The
 * runner, the server's validation and the dashboard summaries all look the
 * type up here.
 */
import {
  CustomQuestionTypeSchema,
  isCustomQuestion,
  walkElements,
  type AnswerValue,
  type CustomQuestion,
  type CustomQuestionType,
  type Survey,
  type z,
} from "@kvesto/schema";

/** What a custom type's `render` gets. */
export interface QuestionRenderContext {
  question: CustomQuestion;
  /** The current answer. */
  value: AnswerValue | undefined;
  /** Change the answer (undefined clears it). */
  setValue(value: AnswerValue | undefined): void;
  document: Document;
  /** A unique id for the main input, and the id of the question's title (for `aria-labelledby`). */
  id: string;
  labelId: string;
}

/** A rendered custom question: its element, and an optional hook to show a changed answer. */
export interface QuestionTypeView {
  element: HTMLElement;
  update?(value: AnswerValue | undefined): void;
}

/** What a custom type adds to the dashboard summary. */
export interface CustomSummary {
  counts?: { value: string; label: string; count: number }[];
  average?: number;
  samples?: string[];
}

export interface QuestionTypeDefinition {
  /** The type name used in survey JSON, such as `"x-signature"`. */
  type: CustomQuestionType;
  /** A short name for the editor palette. Default: the type name. */
  label?: string;
  /** Checks the question's JSON (all of it, including the common fields) when a survey is loaded or saved. */
  schema?: z.ZodType;
  /**
   * Checks a non-empty answer, in the browser and on the server. Return an
   * error message, or null when it is valid. Without it any JSON answer is accepted.
   */
  validate?(question: CustomQuestion, value: AnswerValue): string | null;
  /** Draws the input. Without it the runner shows a plain text input. */
  render?(context: QuestionRenderContext): QuestionTypeView;
  /** Summarises the non-empty answers for the dashboard. Without it the latest answers are listed. */
  summarize?(question: CustomQuestion, values: AnswerValue[]): CustomSummary;
  /** Extra fields for a new question of this type added from the editor palette. */
  editorDefaults?: Record<string, unknown>;
}

const registry = new Map<string, QuestionTypeDefinition>();

/**
 * Register a custom question type. Register the same type in the browser
 * (runner, editor, dashboard) and on the server (`createApp({ questionTypes })`)
 * so both sides validate answers the same way.
 */
export function registerQuestionType(definition: QuestionTypeDefinition): void {
  if (!CustomQuestionTypeSchema.safeParse(definition.type).success) {
    throw new Error(`Custom question types are named "x-" and then lower-case letters, digits and dashes, not "${definition.type}"`);
  }
  registry.set(definition.type, definition);
}

/** Remove a registered type (mainly for tests). */
export function unregisterQuestionType(type: string): void {
  registry.delete(type);
}

/** The definition of a registered custom type, if any. */
export function questionType(type: string): QuestionTypeDefinition | undefined {
  return registry.get(type);
}

/** Every registered custom type, in registration order. */
export function registeredQuestionTypes(): QuestionTypeDefinition[] {
  return [...registry.values()];
}

/**
 * Problems with a survey's custom questions: types that are not registered,
 * and questions their type's schema refuses. Empty when all is well.
 */
export function checkQuestionTypes(survey: Survey): string[] {
  const problems: string[] = [];
  walkElements(survey, (el) => {
    if (el.type === "panel" || !isCustomQuestion(el)) return;
    const def = registry.get(el.type);
    if (!def) {
      problems.push(`"${el.id}" uses the unknown question type "${el.type}": register it with registerQuestionType`);
      return;
    }
    const result = def.schema?.safeParse(el);
    if (result && !result.success) {
      for (const issue of result.error.issues) {
        const where = issue.path.length ? ` (${issue.path.join(".")})` : "";
        problems.push(`"${el.id}"${where}: ${issue.message}`);
      }
    }
  });
  return problems;
}
