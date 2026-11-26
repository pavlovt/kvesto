import {

  migrateSurvey,
  type AnswerValue,
  type Answers,
  type Page,
  type Question,
  type ResponseInput,
  type Survey,
  type SurveyInput,
  type SurveyResponse,
} from "@kvesto/schema";
import type { SurveyStorage } from "./storage.js";
import { validateAnswer } from "./validate.js";

export interface CreateSurveyOptions {
  /** Survey JSON. Validated (and migrated from older schema versions) on creation. */
  survey: SurveyInput | Survey | unknown;
  /** Where to save the response. Optional: without it the core is fully backend-free. */
  storage?: SurveyStorage;
  /** Called after a successful completion with the response (stored or not). */
  onComplete?: (result: CompletionResult) => void | Promise<void>;
  /** Called whenever an answer changes. */
  onChange?: (answers: Answers, questionId: string) => void;
  /** Pre-filled answers. */
  initialAnswers?: Answers;
  /** Extra data stored with the response (e.g. source, user id). */
  meta?: Record<string, unknown>;
}

export interface CompletionResult {
  surveyId: string;
  response: ResponseInput;
  /** Present when a storage adapter saved the response. */
  saved?: SurveyResponse;
}

export interface SurveyState {
  survey: Survey;
  answers: Answers;
  errors: Record<string, string>;
  pageIndex: number;
  page: Page;
  isFirstPage: boolean;
  isLastPage: boolean;
  status: "running" | "submitting" | "completed";
  submitError: string | null;
}

export type Listener = (state: SurveyState) => void;

/**
 * A survey runtime with no DOM and no framework dependency.
 *
 * `subscribe` follows the Svelte store contract (the listener runs immediately
 * and on every change), so the model can be used as a store in Svelte and
 * wrapped easily in React, Vue or plain JS.
 */
export class SurveyModel {
  readonly survey: Survey;
  private state: SurveyState;
  private listeners = new Set<Listener>();

  constructor(private readonly options: CreateSurveyOptions) {
    this.survey = migrateSurvey(options.survey);
    this.state = this.compute({
      answers: { ...(options.initialAnswers ?? {}) },
      errors: {},
      pageIndex: 0,
      status: "running",
      submitError: null,
    });
  }

  get snapshot(): SurveyState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  get questions(): Question[] {
    return this.survey.pages.flatMap((p) => p.elements);
  }

  getValue(questionId: string): AnswerValue | undefined {
    return this.state.answers[questionId];
  }

  setValue(questionId: string, value: AnswerValue): void {
    if (!this.questions.some((q) => q.id === questionId)) {
      throw new Error(`Unknown question "${questionId}"`);
    }
    const answers = { ...this.state.answers, [questionId]: value };
    const errors = { ...this.state.errors };
    delete errors[questionId];
    this.update({ answers, errors });
    this.options.onChange?.(answers, questionId);
  }

  /** Validates the given page (default: current). Returns true when it has no errors. */
  validatePage(pageIndex = this.state.pageIndex): boolean {
    const page = this.survey.pages[pageIndex];
    if (!page) return true;
    const errors = { ...this.state.errors };
    for (const q of page.elements) {
      const err = validateAnswer(q, this.state.answers[q.id]);
      if (err) errors[q.id] = err;
      else delete errors[q.id];
    }
    this.update({ errors });
    return page.elements.every((q) => !errors[q.id]);
  }

  next(): boolean {
    if (this.state.isLastPage || !this.validatePage()) return false;
    this.update({ pageIndex: this.state.pageIndex + 1 });
    return true;
  }

  prev(): boolean {
    if (this.state.isFirstPage) return false;
    this.update({ pageIndex: this.state.pageIndex - 1 });
    return true;
  }

  /** Validates every page, saves through the storage adapter if any, then calls onComplete. */
  async complete(): Promise<CompletionResult | null> {
    if (this.state.status !== "running") return null;
    for (let i = 0; i < this.survey.pages.length; i++) {
      if (!this.validatePage(i)) {
        this.update({ pageIndex: i });
        return null;
      }
    }
    const response: ResponseInput = {
      answers: this.answersForQuestions(),
      ...(this.options.meta ? { meta: this.options.meta } : {}),
    };
    this.update({ status: "submitting", submitError: null });
    try {
      const saved = await this.options.storage?.saveResponse(this.survey.id, response);
      const result: CompletionResult = { surveyId: this.survey.id, response, ...(saved ? { saved } : {}) };
      this.update({ status: "completed" });
      await this.options.onComplete?.(result);
      return result;
    } catch (err) {
      this.update({ status: "running", submitError: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  private answersForQuestions(): Answers {
    const out: Answers = {};
    for (const q of this.questions) {
      const v = this.state.answers[q.id];
      if (v !== undefined) out[q.id] = v;
    }
    return out;
  }

  private update(patch: Partial<Pick<SurveyState, "answers" | "errors" | "pageIndex" | "status" | "submitError">>) {
    this.state = this.compute({ ...this.state, ...patch });
    for (const l of this.listeners) l(this.state);
  }

  private compute(s: Pick<SurveyState, "answers" | "errors" | "pageIndex" | "status" | "submitError">): SurveyState {
    const last = this.survey.pages.length - 1;
    return {
      ...s,
      survey: this.survey,
      page: this.survey.pages[s.pageIndex]!,
      isFirstPage: s.pageIndex === 0,
      isLastPage: s.pageIndex === last,
    };
  }
}

/** Create a survey runtime from survey JSON. */
export function createSurvey(options: CreateSurveyOptions): SurveyModel {
  return new SurveyModel(options);
}

/** Load survey JSON by id from a storage adapter, then create the runtime. */
export async function loadSurvey(
  id: string,
  options: Omit<CreateSurveyOptions, "survey"> & { storage: SurveyStorage },
): Promise<SurveyModel> {
  const survey = await options.storage.loadSurvey(id);
  if (!survey) throw new Error(`Survey "${id}" not found`);
  return createSurvey({ ...options, survey });
}

