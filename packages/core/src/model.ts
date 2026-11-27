import {
  localizeSurvey,
  type Element,
  allQuestions,
  fileRules,
  isQuestion,
  migrateSurvey,
  walkElements,
  type Panel,
  type RepeatItem,
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
import { evaluateCondition, isEmptyAnswer, repeatItems, resolveLogic, visibleElements, type LogicOptions, type SurveyLogic } from "./logic.js";
import { surveyVariables, unknownFunctions, type EvaluateOptions, type ExpressionFunctions } from "./expression.js";
import { pipeText } from "./piping.js";
import { message } from "./i18n.js";
import { checkQuestionTypes } from "./question-types.js";
import { defaultAnswer, itemKey, validateAnswer, validateFile, validateRepeat, validationTargets } from "./validate.js";
import type { CustomValidators } from "./validators.js";

export interface CreateSurveyOptions {
  /** Survey JSON. Validated (and migrated from older schema versions) on creation. */
  survey: SurveyInput | Survey | unknown;
  /** Where to save the response. Optional: without it the core is fully backend-free. */
  storage?: SurveyStorage;
  /** Called after a successful completion with the response (stored or not). */
  onComplete?: (result: CompletionResult) => void | Promise<void>;
  /** Called whenever an answer changes, with the question id (or the repeating panel id for item changes). */
  onChange?: (answers: Answers, questionId: string) => void;
  /** Pre-filled answers. */
  initialAnswers?: Answers;
  /** Extra data stored with the response (e.g. source, user id). */
  meta?: Record<string, unknown>;
  /** Functions for the survey's `custom` validators, by name. Register the same ones on the server. */
  validators?: CustomValidators;
  /** Functions the survey's expressions may call, by name. Register the same ones on the server. */
  functions?: ExpressionFunctions;
  /** The clock for `today()` and `age()` in expressions. Default: the system clock. */
  now?: () => Date;
  /**
   * The locale to show the survey in, such as "de" or "pt-BR". Missing
   * translations fall back to the language, then the survey's `defaultLocale`.
   * Default: the survey's `defaultLocale`, or "en".
   */
  locale?: string;
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
  /**
   * Error messages by key: a question id, a repeating panel id (number of
   * items), or `panelId.index.questionId` for a question inside an item.
   */
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
  /**
   * The steps of the one-question-at-a-time layout: every visible top-level
   * element (question, panel or block) of every visible page, in order.
   */
  steps: Step[];
  /** Index of the current step in `steps` (the first one on the current page until `nextStep` moves on). */
  stepIndex: number;
  /** The element id `nextStep` / `prevStep` last moved to, or null for the first step of the current page. */
  stepId: string | null;
  status: "running" | "submitting" | "completed";
  submitError: string | null;
}

type BaseState = Pick<SurveyState, "answers" | "errors" | "pageIndex" | "status" | "submitError" | "uploading" | "stepId">;

/** One screen of the one-question-at-a-time layout. */
export interface Step {
  pageIndex: number;
  /** The id of the top-level element shown on this step. */
  id: string;
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
  /** The survey with every text in `locale`. */
  readonly survey: Survey;
  /** The locale texts are shown in. */
  readonly locale: string;
  private state: SurveyState;
  private listeners = new Set<Listener>();
  /** Repeating panels by id, and which repeating panel each inner question belongs to. */
  private readonly repeats = new Map<string, Panel>();
  private readonly repeatOf = new Map<string, string>();
  /** Questions outside repeating panels, in survey order. */
  private readonly topQuestions: Question[] = [];
  private readonly logicOptions: LogicOptions;
  private readonly expression: EvaluateOptions;
  /** Questions whose `defaultExpr` has been applied (it runs once, when the question is first shown). */
  private readonly defaulted = new Set<string>();
  /** The last value of each `resetIf`, so an answer is cleared only when the condition becomes true. */
  private readonly resetState = new Map<string, boolean>();
  /** The last value of each trigger's condition, so a trigger runs only when its condition becomes true. */
  private readonly triggerState: boolean[] = [];

  constructor(private readonly options: CreateSurveyOptions) {
    const source = migrateSurvey(options.survey);
    this.locale = options.locale ?? source.defaultLocale ?? "en";
    // Every display text resolved for the locale once, so everything below sees plain strings.
    this.survey = localizeSurvey(source, this.locale);
    const typeProblems = checkQuestionTypes(this.survey);
    if (typeProblems.length) throw new Error(typeProblems.join("; "));
    const missing = unknownFunctions(this.survey, options.functions);
    if (missing.length) {
      throw new Error(`The survey's expressions call unknown functions: ${missing.join(", ")}. Register them with createSurvey({ functions }).`);
    }
    walkElements(this.survey, (el, at) => {
      if (at.repeat) this.repeatOf.set(el.id, at.repeat);
      else if (el.type === "panel" && el.repeat) this.repeats.set(el.id, el);
      else if (isQuestion(el)) this.topQuestions.push(el);
    });
    const variables = surveyVariables(this.survey);
    this.logicOptions = { functions: options.functions, now: options.now, ...(variables ? { variables } : {}) };
    this.expression = { ...this.logicOptions };
    const answers: Answers = { ...(options.initialAnswers ?? {}) };
    for (const q of this.topQuestions) {
      if (answers[q.id] === undefined && q.defaultValue !== undefined) answers[q.id] = q.defaultValue as AnswerValue;
    }
    // Repeating panels start with their minimum number of items.
    for (const [id, panel] of this.repeats) {
      const min = panel.repeat?.min ?? 0;
      if (answers[id] === undefined && min > 0) answers[id] = Array.from({ length: min }, () => this.newItem(panel));
    }
    this.state = this.compute({
      answers,
      errors: {},
      pageIndex: 0,
      status: "running",
      submitError: null,
      uploading: [],
      stepId: null,
    });
    // Conditions that already hold at the start don't clear prefilled answers.
    for (const q of this.topQuestions) {
      if (q.resetIf) this.resetState.set(q.id, evaluateCondition(q.resetIf, this.state.logic.answers, undefined, this.logicOptions));
    }
    this.applyRules();
    // Triggers whose condition already holds at the start (from prefilled answers) don't run.
    (this.survey.triggers ?? []).forEach((t, i) => {
      this.triggerState[i] = evaluateCondition(t.when, this.state.logic.answers, undefined, this.logicOptions);
    });
  }

  /**
   * Run the triggers whose condition has just become true. Actions can change
   * answers, which can make other triggers fire; that is repeated a bounded
   * number of times, so triggers that set each other can't loop forever.
   */
  private runTriggers(): void {
    const triggers = this.survey.triggers ?? [];
    let complete = false;
    for (let round = 0; round < 10 && triggers.length; round++) {
      const { logic } = this.state;
      let answers: Answers | null = null;
      let pageIndex: number | undefined;
      triggers.forEach((t, i) => {
        const holds = evaluateCondition(t.when, logic.answers, undefined, this.logicOptions);
        const before = this.triggerState[i] ?? false;
        this.triggerState[i] = holds;
        if (!holds || before) return;
        const a = t.action;
        switch (a.type) {
          case "setValue":
            answers ??= { ...this.state.answers };
            answers[a.question] = a.value as AnswerValue;
            break;
          case "copyValue": {
            answers ??= { ...this.state.answers };
            const v = logic.answers[a.from];
            if (v === undefined) delete answers[a.to];
            else answers[a.to] = v;
            break;
          }
          case "skipToPage": {
            const index = this.survey.pages.findIndex((p) => p.id === a.page);
            if (index >= 0) pageIndex = index;
            break;
          }
          case "complete":
            complete = true;
            break;
        }
      });
      if (answers) {
        this.state = this.compute({ ...this.state, answers });
        this.applyRules();
      }
      if (pageIndex !== undefined && this.state.logic.visiblePages.has(this.survey.pages[pageIndex]!.id)) {
        this.state = this.compute({ ...this.state, pageIndex });
      }
      if (!answers) break;
    }
    // After the listeners have seen the change.
    if (complete) queueMicrotask(() => void this.complete());
  }

  /** A new item of a repeating panel, with the `defaultValue` of its questions. */
  private newItem(panel: Panel): RepeatItem {
    const item: RepeatItem = {};
    walkElements({ pages: [{ elements: panel.elements }] }, (el) => {
      if (isQuestion(el) && el.defaultValue !== undefined) item[el.id] = el.defaultValue as RepeatItem[string];
    });
    return item;
  }

  /**
   * Apply `defaultExpr` (once, when a question is first shown) and `resetIf`
   * (clear the answer when the condition becomes true), until nothing changes.
   */
  private applyRules(): void {
    for (let round = 0; round < 10; round++) {
      const { logic } = this.state;
      let next: Answers | null = null;
      for (const q of this.topQuestions) {
        if (q.resetIf) {
          const holds = evaluateCondition(q.resetIf, logic.answers, undefined, this.logicOptions);
          const before = this.resetState.get(q.id) ?? false;
          this.resetState.set(q.id, holds);
          if (holds && !before && !isEmptyAnswer((next ?? this.state.answers)[q.id])) {
            next ??= { ...this.state.answers };
            delete next[q.id];
          }
        }
        if (q.defaultExpr && !this.defaulted.has(q.id) && logic.visibleQuestions.has(q.id)) {
          this.defaulted.add(q.id);
          if (isEmptyAnswer((next ?? this.state.answers)[q.id])) {
            const d = defaultAnswer(q, logic.answers, this.expression);
            if (d !== undefined) {
              next ??= { ...this.state.answers };
              next[q.id] = d;
            }
          }
        }
      }
      if (!next) return;
      this.state = this.compute({ ...this.state, answers: next });
    }
  }

  get snapshot(): SurveyState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Every question, including those inside panels and repeating panels. */
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

  /** False for computed and read-only questions, and while `enableIf` does not hold. */
  isEnabled(questionId: string): boolean {
    return !this.state.logic.disabledQuestions.has(questionId);
  }

  /**
   * Display text with `{questionId}` placeholders filled from the current
   * answers (hidden questions pipe as empty). For custom renderers; the
   * bundled renderer does this itself. `item` is a repeating panel item, for
   * `{$item.q}`: `{ panel: "children", index: 0 }`.
   */
  text(raw: string, item?: { panel: string; index: number }): string {
    const { logic } = this.state;
    const itemAnswers = item ? logic.items[item.panel]?.[item.index]?.answers : undefined;
    return pipeText(raw, this.survey, logic.answers, { values: logic.variables, ...(itemAnswers ? { item: itemAnswers } : {}) });
  }

  private question(questionId: string): Question {
    const q = this.questions.find((x) => x.id === questionId);
    if (!q) throw new Error(`Unknown question "${questionId}"`);
    return q;
  }

  private repeat(panelId: string): Panel {
    const panel = this.repeats.get(panelId);
    if (!panel) throw new Error(`"${panelId}" is not a repeating panel`);
    return panel;
  }

  /**
   * Set an answer. Pass `undefined` to clear it. Also takes a repeating
   * panel id with its whole list of items.
   */
  setValue(questionId: string, value: AnswerValue | undefined): void {
    if (this.repeats.has(questionId)) return this.setItems(questionId, repeatItems(value), value === undefined);
    const q = this.question(questionId);
    const inside = this.repeatOf.get(questionId);
    if (inside) throw new Error(`"${questionId}" is inside repeating panel "${inside}": use setItemValue`);
    if (q.type === "computed") throw new Error(`"${questionId}" is computed from other answers`);
    if (q.readOnly) throw new Error(`"${questionId}" is read-only`);
    const answers = { ...this.state.answers };
    if (value === undefined) delete answers[questionId];
    else answers[questionId] = value;
    const errors = { ...this.state.errors };
    delete errors[questionId];
    this.update({ answers, errors });
    this.options.onChange?.(this.state.answers, questionId);
  }

  /** The items of a repeating panel. */
  getItems(panelId: string): RepeatItem[] {
    this.repeat(panelId);
    return repeatItems(this.state.answers[panelId]);
  }

  /** Add an empty item to a repeating panel. Returns false when it already has `max` items. */
  addItem(panelId: string): boolean {
    const { repeat } = this.repeat(panelId);
    const items = this.getItems(panelId);
    if (repeat?.max !== undefined && items.length >= repeat.max) return false;
    this.setItems(panelId, [...items, this.newItem(this.repeat(panelId))]);
    return true;
  }

  /** Remove an item from a repeating panel. Returns false when it has only `min` items. */
  removeItem(panelId: string, index: number): boolean {
    const { repeat } = this.repeat(panelId);
    const items = this.getItems(panelId);
    if (index < 0 || index >= items.length || items.length <= (repeat?.min ?? 0)) return false;
    this.setItems(panelId, items.filter((_, i) => i !== index));
    return true;
  }

  /** Set an answer to a question inside one item of a repeating panel. Pass `undefined` to clear it. */
  setItemValue(panelId: string, index: number, questionId: string, value: AnswerValue | undefined): void {
    this.repeat(panelId);
    if (this.repeatOf.get(questionId) !== panelId) throw new Error(`"${questionId}" is not a question of "${panelId}"`);
    const items = this.getItems(panelId);
    if (index < 0 || index >= items.length) throw new Error(`"${panelId}" has no item ${index}`);
    const item: RepeatItem = { ...items[index] };
    if (value === undefined) delete item[questionId];
    else item[questionId] = value as RepeatItem[string];
    const next = items.map((it, i) => (i === index ? item : it));
    const errors = { ...this.state.errors };
    delete errors[itemKey(panelId, index, questionId)];
    this.update({ answers: { ...this.state.answers, [panelId]: next }, errors });
    this.options.onChange?.(this.state.answers, panelId);
  }

  /** Replace a repeating panel's items. Item errors are cleared, since indexes may have moved. */
  private setItems(panelId: string, items: RepeatItem[], clear = false): void {
    const answers = { ...this.state.answers };
    if (clear) delete answers[panelId];
    else answers[panelId] = items;
    const errors = Object.fromEntries(
      Object.entries(this.state.errors).filter(([k]) => k !== panelId && !k.startsWith(`${panelId}.`)),
    );
    this.update({ answers, errors });
    this.options.onChange?.(this.state.answers, panelId);
  }

  /**
   * Attach files to a file question. Each file is checked against the
   * question's `accept`, `maxSize` and `maxFiles`, then stored with the storage
   * adapter's `uploadFile`, or embedded as a data URL when there is none.
   * Returns false (and sets an error) if any file was rejected or failed.
   */
  async addFiles(questionId: string, files: Iterable<File>): Promise<boolean> {
    const question = this.question(questionId);
    if (question.type !== "file" && question.type !== "signature") throw new Error(`"${questionId}" is not a file question`);
    const q = fileRules(question);
    const list = [...files];
    // A new signature replaces the old one.
    const current = () => {
      const v = this.state.answers[questionId];
      return Array.isArray(v) && question.type !== "signature" ? (v as FileAnswer[]) : [];
    };
    const fail = (message: string) => {
      this.update({ errors: { ...this.state.errors, [questionId]: message } });
      return false;
    };
    if (current().length + list.length > q.maxFiles) {
      return fail(q.maxFiles === 1 ? message(this.locale, "fileOne") : message(this.locale, "fileMax", { max: q.maxFiles }));
    }
    for (const f of list) {
      const err = validateFile(q, f, this.locale);
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
      return fail(message(this.locale, "uploadFailed", { error: err instanceof Error ? err.message : String(err) }));
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
    const { questions, repeats } = validationTargets(page.elements);
    let ok = true;
    for (const q of questions) {
      const err = logic.visibleQuestions.has(q.id)
        ? validateAnswer(q, logic.answers[q.id], {
            required: logic.requiredQuestions.has(q.id),
            validators: this.options.validators,
            answers: logic.answers,
            expression: this.expression,
            locale: this.locale,
          })
        : null;
      if (err) {
        errors[q.id] = err;
        ok = false;
      } else delete errors[q.id];
    }
    for (const panel of repeats) {
      for (const k of Object.keys(errors)) if (k === panel.id || k.startsWith(`${panel.id}.`)) delete errors[k];
      if (!logic.visiblePanels.has(panel.id)) continue;
      for (const issue of validateRepeat(panel, this.state.answers[panel.id], logic, { validators: this.options.validators, expression: this.expression, locale: this.locale })) {
        errors[issue.questionId] = issue.message;
        ok = false;
      }
    }
    this.update({ errors });
    return ok;
  }

  /** Every visible top-level element of every visible page, in order. */
  private stepsOf(logic: SurveyLogic, visiblePages: number[]): Step[] {
    const out: Step[] = [];
    for (const pi of visiblePages) {
      for (const el of this.survey.pages[pi]!.elements) {
        const shown =
          el.type === "panel"
            ? logic.visiblePanels.has(el.id)
            : el.type === "content" || el.type === "image"
              ? logic.visibleBlocks.has(el.id)
              : logic.visibleQuestions.has(el.id);
        if (shown) out.push({ pageIndex: pi, id: el.id });
      }
    }
    return out;
  }

  private order?: Map<string, number>;
  /** The position of every top-level element in the survey, to find where a hidden step was. */
  private stepOrder(): Map<string, number> {
    if (!this.order) {
      this.order = new Map();
      let n = 0;
      for (const page of this.survey.pages) for (const el of page.elements) this.order.set(el.id, n++);
    }
    return this.order;
  }

  private visiblePageIndexes(logic = this.state.logic): number[] {
    return this.survey.pages.flatMap((p, i) => (logic.visiblePages.has(p.id) ? [i] : []));
  }

  /** Validates one top-level element (a question, or every question in a panel). */
  private validateElement(element: Element): boolean {
    const { logic } = this.state;
    const errors = { ...this.state.errors };
    const { questions, repeats } = validationTargets([element]);
    let ok = true;
    for (const q of questions) {
      const err = logic.visibleQuestions.has(q.id)
        ? validateAnswer(q, logic.answers[q.id], {
            required: logic.requiredQuestions.has(q.id),
            validators: this.options.validators,
            answers: logic.answers,
            expression: this.expression,
            locale: this.locale,
          })
        : null;
      if (err) {
        errors[q.id] = err;
        ok = false;
      } else delete errors[q.id];
    }
    for (const panel of repeats) {
      for (const k of Object.keys(errors)) if (k === panel.id || k.startsWith(`${panel.id}.`)) delete errors[k];
      if (!logic.visiblePanels.has(panel.id)) continue;
      for (const issue of validateRepeat(panel, this.state.answers[panel.id], logic, { validators: this.options.validators, expression: this.expression, locale: this.locale })) {
        errors[issue.questionId] = issue.message;
        ok = false;
      }
    }
    this.update({ errors });
    return ok;
  }

  /**
   * One-question-at-a-time layout: validate the current step and go to the
   * next visible one, crossing pages as needed. Returns false when the step
   * has errors or it is the last step (then call `complete`).
   */
  nextStep(): boolean {
    const { steps, stepIndex, uploading } = this.state;
    const step = steps[stepIndex];
    if (!step || uploading.length) return false;
    const element = this.survey.pages[step.pageIndex]!.elements.find((e) => e.id === step.id);
    if (element && !this.validateElement(element)) return false;
    const next = this.state.steps[this.state.stepIndex + 1];
    if (!next) return false;
    this.update({ pageIndex: next.pageIndex, stepId: next.id });
    return true;
  }

  /** One-question-at-a-time layout: go back one visible step. */
  prevStep(): boolean {
    const prev = this.state.steps[this.state.stepIndex - 1];
    if (!prev) return false;
    this.update({ pageIndex: prev.pageIndex, stepId: prev.id });
    return true;
  }

  next(): boolean {
    if (this.state.isLastPage || this.state.uploading.length || !this.validatePage()) return false;
    const nextIndex = this.visiblePageIndexes().find((i) => i > this.state.pageIndex);
    if (nextIndex === undefined) return false;
    this.update({ pageIndex: nextIndex, stepId: null });
    return true;
  }

  prev(): boolean {
    const prevIndex = this.visiblePageIndexes().filter((i) => i < this.state.pageIndex).at(-1);
    if (prevIndex === undefined) return false;
    this.update({ pageIndex: prevIndex, stepId: null });
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
    if (patch.answers) {
      this.applyRules();
      this.runTriggers();
    }
    for (const l of this.listeners) l(this.state);
  }

  private compute(s: BaseState): SurveyState {
    const logic =
      this.state && s.answers === this.state.answers ? this.state.logic : resolveLogic(this.survey, s.answers, this.logicOptions);
    const visible = this.visiblePageIndexes(logic);
    const page = this.survey.pages[s.pageIndex]!;
    const steps = this.stepsOf(logic, visible);
    // The current step: the remembered element if it is still shown, otherwise the next shown one on or after it.
    let stepIndex = s.stepId === null ? -1 : steps.findIndex((st) => st.id === s.stepId);
    if (stepIndex < 0) {
      const order = this.stepOrder();
      const at = s.stepId === null ? -1 : (order.get(s.stepId) ?? -1);
      stepIndex = steps.findIndex((st) => (at >= 0 ? (order.get(st.id) ?? 0) >= at : st.pageIndex >= s.pageIndex));
      if (stepIndex < 0) stepIndex = Math.max(0, steps.length - 1);
    }
    return {
      steps,
      stepIndex,
      stepId: s.stepId,
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

