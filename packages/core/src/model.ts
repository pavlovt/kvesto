import {
  allQuestions,
  migrateSurvey,
  pageQuestions,
  type AnswerValue,
  type Answers,
  type FileAnswer,
  type Page,
  type Question,
  type ResponseInput,
  type Survey,
  type SurveyInput,
  type SurveyResponse,
} from "@kvesto/schema";
import type { SurveyStorage } from "./storage.js";
import { fileToDataUrl } from "./files.js";
import { resolveLogic, visibleElements, type SurveyLogic } from "./logic.js";
import { validateAnswer, validateFile } from "./validate.js";

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
  /** Everything the respondent entered, including answers to questions that are now hidden. */
  answers: Answers;
  errors: Record<string, string>;
  /** Index into `survey.pages` (hidden pages are skipped by next/prev). */
  pageIndex: number;
  page: Page;
  /** The visible questions of the current page. */
  questions: Question[];
  /** Visible pages, in order. */
  pages: Page[];
  /** Position of the current page among the visible pages (0-based). */
  visiblePageIndex: number;
  /** Which questions and pages are visible or required right now. */
  logic: SurveyLogic;
  isFirstPage: boolean;
  isLastPage: boolean;
  /** Ids of file questions with an upload in progress. */
  uploading: string[];
  status: "running" | "submitting" | "completed";
  submitError: string | null;
}

type BaseState = Pick<SurveyState, "answers" | "errors" | "pageIndex" | "status" | "submitError" | "uploading">;

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
      uploading: [],
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
    return allQuestions(this.survey);
  }

  getValue(questionId: string): AnswerValue | undefined {
    return this.state.answers[questionId];
  }

  isVisible(questionId: string): boolean {
    return this.state.logic.visibleQuestions.has(questionId);
  }

  isRequired(questionId: string): boolean {
    return this.state.logic.requiredQuestions.has(questionId);
  }

  private question(questionId: string): Question {
    const q = this.questions.find((x) => x.id === questionId);
    if (!q) throw new Error(`Unknown question "${questionId}"`);
    return q;
  }

  /** Set an answer. Pass `undefined` to clear it. */
  setValue(questionId: string, value: AnswerValue | undefined): void {
    this.question(questionId);
    const answers = { ...this.state.answers };
    if (value === undefined) delete answers[questionId];
    else answers[questionId] = value;
    const errors = { ...this.state.errors };
    delete errors[questionId];
    this.update({ answers, errors });
    this.options.onChange?.(answers, questionId);
  }

  /**
   * Attach files to a file question. Each file is checked against the
   * question's `accept`, `maxSize` and `maxFiles`, then stored with the storage
   * adapter's `uploadFile`, or embedded as a data URL when there is none.
   * Returns false (and sets an error) if any file was rejected or failed.
   */
  async addFiles(questionId: string, files: Iterable<File>): Promise<boolean> {
    const q = this.question(questionId);
    if (q.type !== "file") throw new Error(`"${questionId}" is not a file question`);
    const list = [...files];
    const current = () => {
      const v = this.state.answers[questionId];
      return Array.isArray(v) ? (v as FileAnswer[]) : [];
    };
    const fail = (message: string) => {
      this.update({ errors: { ...this.state.errors, [questionId]: message } });
      return false;
    };
    if (current().length + list.length > q.maxFiles) {
      return fail(q.maxFiles === 1 ? "Attach only one file." : `Attach at most ${q.maxFiles} files.`);
    }
    for (const f of list) {
      const err = validateFile(q, f);
      if (err) return fail(err);
    }
    this.update({ uploading: [...this.state.uploading, questionId] });
    try {
      const upload = this.options.storage?.uploadFile?.bind(this.options.storage);
      const uploaded = await Promise.all(
        list.map((f) => (upload ? upload(this.survey.id, questionId, f) : fileToDataUrl(f))),
      );
      this.setValue(questionId, [...current(), ...uploaded]);
      return true;
    } catch (err) {
      return fail(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      const rest = [...this.state.uploading];
      rest.splice(rest.indexOf(questionId), 1);
      this.update({ uploading: rest });
    }
  }

  /** Remove one attached file from a file question's answer. */
  removeFile(questionId: string, index: number): void {
    const v = this.state.answers[questionId];
    if (!Array.isArray(v)) return;
    const next = (v as FileAnswer[]).filter((_, i) => i !== index);
    this.setValue(questionId, next.length ? next : undefined);
  }

  /** Validates the given page (default: current). Hidden questions are skipped. Returns true when it has no errors. */
  validatePage(pageIndex = this.state.pageIndex): boolean {
    const page = this.survey.pages[pageIndex];
    if (!page) return true;
    const { logic } = this.state;
    const errors = { ...this.state.errors };
    const questions = pageQuestions(page);
    for (const q of questions) {
      const err = logic.visibleQuestions.has(q.id)
        ? validateAnswer(q, this.state.answers[q.id], { required: logic.requiredQuestions.has(q.id) })
        : null;
      if (err) errors[q.id] = err;
      else delete errors[q.id];
    }
    this.update({ errors });
    return questions.every((q) => !errors[q.id]);
  }

  private visiblePageIndexes(logic = this.state.logic): number[] {
    return this.survey.pages.flatMap((p, i) => (logic.visiblePages.has(p.id) ? [i] : []));
  }

  next(): boolean {
    if (this.state.isLastPage || this.state.uploading.length || !this.validatePage()) return false;
    const nextIndex = this.visiblePageIndexes().find((i) => i > this.state.pageIndex);
    if (nextIndex === undefined) return false;
    this.update({ pageIndex: nextIndex });
    return true;
  }

  prev(): boolean {
    const prevIndex = this.visiblePageIndexes().filter((i) => i < this.state.pageIndex).at(-1);
    if (prevIndex === undefined) return false;
    this.update({ pageIndex: prevIndex });
    return true;
  }

  /** Validates every visible page, saves through the storage adapter if any, then calls onComplete. */
  async complete(): Promise<CompletionResult | null> {
    if (this.state.status !== "running" || this.state.uploading.length) return null;
    for (const i of this.visiblePageIndexes()) {
      if (!this.validatePage(i)) {
        this.update({ pageIndex: i });
        return null;
      }
    }
    const response: ResponseInput = {
      // Only visible questions: answers to questions hidden by logic are dropped.
      answers: { ...this.state.logic.answers },
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

  private update(patch: Partial<BaseState>) {
    this.state = this.compute({ ...this.state, ...patch });
    for (const l of this.listeners) l(this.state);
  }

  private compute(s: BaseState): SurveyState {
    const logic =
      this.state && s.answers === this.state.answers ? this.state.logic : resolveLogic(this.survey, s.answers);
    const visible = this.visiblePageIndexes(logic);
    const page = this.survey.pages[s.pageIndex]!;
    return {
      answers: s.answers,
      errors: s.errors,
      pageIndex: s.pageIndex,
      status: s.status,
      submitError: s.submitError,
      uploading: s.uploading,
      survey: this.survey,
      page,
      questions: visibleElements(page, logic),
      pages: visible.map((i) => this.survey.pages[i]!),
      visiblePageIndex: Math.max(0, visible.indexOf(s.pageIndex)),
      logic,
      isFirstPage: !visible.some((i) => i < s.pageIndex),
      isLastPage: !visible.some((i) => i > s.pageIndex),
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

