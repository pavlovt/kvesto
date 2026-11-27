import {
  textOf,
  type LocalizedText,
  type DisplayElement,
  type Answers,
  type AnswerValue,
  type Element,
  type Panel,
  type FileAnswer,
  type FileQuestion,
  type GridAnswer,
  type GridQuestion,
  type MatrixAnswer,
  type MatrixQuestion,
  type Question,
  type RankingQuestion,
} from "@kvesto/schema";
import { createSurvey, type CreateSurveyOptions, type SurveyModel, type SurveyState } from "./model.js";
import { repeatItems } from "./logic.js";
import { formatBytes, itemKey } from "./validate.js";
import { formatComputed, pipeText } from "./piping.js";
import { labelsFor, type Labels } from "./i18n.js";
import { applyTheme, type Theme } from "./theme.js";
import { questionType } from "./question-types.js";
import { parseMarkdown, type MarkdownInline } from "./markdown.js";

export interface RenderOptions {
  /** Text overrides for the built-in buttons and messages. */
  labels?: Partial<Labels>;
  /**
   * Turns a content block's raw `html` into safe HTML (use a sanitizer such as
   * DOMPurify). Without it `html` is never shown: only the block's Markdown is.
   */
  sanitizeHtml?: (html: string) => string;
  /**
   * `"page"` (default) shows a page at a time; `"question"` one question,
   * panel or block at a time, with Enter to go on and number keys for choices.
   * Default: the survey's `settings.layout`.
   */
  layout?: "page" | "question";
  /** Show a progress bar. Default: the survey's `settings.progressBar`, else on in the question layout only. */
  progressBar?: boolean;
  /** In the question layout, go on by itself after a single-choice, yes/no or rating answer. Default: `settings.autoAdvance`, else true. */
  autoAdvance?: boolean;
  /** A preset ("dark", "auto", …) or theme variables. Default: the survey's `settings.theme`, else the light look. */
  theme?: Theme;
}

/** Question types answered with one click, which auto-advance and take number keys. */
const ONE_CLICK = new Set(["single-choice", "boolean", "rating", "image-choice"]);



export interface RenderedSurvey {
  model: SurveyModel;
  destroy(): void;
}

type El = HTMLElement;

const isRecordValue = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Create an element. Text children may be display text: the model's survey is
 * already localized, so they are strings, but the type allows either.
 */
function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Record<string, string | LocalizedText> = {},
  ...children: (Node | string | LocalizedText)[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, textOf(v));
  for (const c of children) el.append(typeof c === "string" || c instanceof Node ? c : textOf(c));
  return el;
}

/**
 * Where a rendered question reads and writes its answer: the survey's answers
 * for most questions, or one item of a repeating panel.
 */
interface Binding {
  /** Error key in `state.errors`, and the unique part of DOM ids. */
  key: string;
  get(state: SurveyState): AnswerValue | undefined;
  set(value: AnswerValue | undefined): void;
  visible(state: SurveyState): boolean;
  required(state: SurveyState): boolean;
  /** False for read-only and computed questions, and while `enableIf` does not hold. */
  enabled(state: SurveyState): boolean;
  /** The answer as submitted: for computed questions, the worked-out value. */
  shown(state: SurveyState): AnswerValue | undefined;
  /** Inside a repeating panel: the item's answers, for `{$item.q}` placeholders. */
  item?: (state: SurveyState) => Answers | undefined;
}

/** A rendered question: its element, plus a hook to refresh it from new state. */
interface QuestionView {
  el: El;
  update(state: SurveyState): void;
}

/**
 * Renders a survey into a DOM element using plain, unstyled-by-default HTML
 * (class names are prefixed with `kv-`; import "@kvesto/core/styles.css" for
 * a basic theme). Works in any framework or none.
 *
 * Questions hidden by conditional logic stay in the DOM with the `hidden`
 * attribute, so typing elsewhere on the page never loses focus.
 */
export function renderSurvey(target: El, model: SurveyModel, options: RenderOptions = {}): RenderedSurvey {
  const doc = target.ownerDocument;
  // The built-in texts in the model's locale, with any overrides on top.
  const labels: Labels = { ...labelsFor(model.locale), ...options.labels };
  const root = h(doc, "form", { class: "kv-survey", novalidate: "" });
  applyTheme(root, options.theme ?? (model.survey.settings?.theme as Theme | undefined));
  target.replaceChildren(root);

  let renderedPage = -1;
  let renderedStatus: SurveyState["status"] | null = null;
  let views: QuestionView[] = [];
  const settings = model.survey.settings ?? {};
  const byQuestion = (options.layout ?? settings.layout ?? "page") === "question";
  const showProgress = options.progressBar ?? settings.progressBar ?? byQuestion;
  const autoAdvance = byQuestion && (options.autoAdvance ?? settings.autoAdvance ?? true);
  /** The page's top-level elements, by id: in the question layout only the current step's is shown. */
  let topNodes: [string, El][] = [];
  let renderedStep: string | undefined;
  const currentStep = (s: SurveyState) => s.steps[s.stepIndex];
  const isLastStep = (s: SurveyState) => s.stepIndex >= s.steps.length - 1;
  /** Refreshers for display text with answer placeholders, on the current page (or the repeat item being built). */
  let texts: ((state: SurveyState) => void)[] = [];

  const pipeOptions = { yes: labels.yes, no: labels.no };
  /**
   * Display text, with `{questionId}` placeholders filled from the answers and
   * kept up to date as they change. Always text, never HTML.
   */
  const txt = (text: string | LocalizedText, item?: (s: SurveyState) => Answers | undefined): Node | string => {
    const raw = textOf(text);
    if (!raw.includes("{") && !raw.includes("}")) return raw;
    const node = doc.createTextNode("");
    const refresh = (s: SurveyState) => {
      const next = pipeText(raw, s.survey, s.logic.answers, { ...pipeOptions, values: { ...model.hidden, ...s.logic.variables }, item: item?.(s) });
      if (node.data !== next) node.data = next;
    };
    refresh(model.snapshot);
    texts.push(refresh);
    return node;
  };

  const onSubmit = (e: Event) => {
    e.preventDefault();
    const s = model.snapshot;
    if (byQuestion) {
      if (isLastStep(s)) void model.complete();
      else model.nextStep();
    } else if (s.isLastPage) void model.complete();
    else model.next();
  };
  root.addEventListener("submit", onSubmit);

  const stepNode = () => {
    const step = currentStep(model.snapshot);
    return step ? topNodes.find(([id]) => id === step.id)?.[1] : undefined;
  };
  const stepQuestion = () => {
    const step = currentStep(model.snapshot);
    return step ? model.survey.pages[step.pageIndex]!.elements.find((e) => e.id === step.id) : undefined;
  };
  // Number keys pick the nth option of a one-click question (or that rating).
  const onKeydown = (e: KeyboardEvent) => {
    if (!byQuestion || !/^[0-9]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.closest("input:not([type=radio]):not([type=checkbox]), textarea, select")) return;
    const q = stepQuestion();
    const node = stepNode();
    if (!q || !node || !(ONE_CLICK.has(q.type) || q.type === "multiple-choice")) return;
    const radios = [...node.querySelectorAll<HTMLInputElement>("input[type=radio], input[type=checkbox]")];
    const pick = q.type === "rating" ? radios.find((r) => r.value === e.key) : radios[Number(e.key) - 1];
    if (!pick) return;
    e.preventDefault();
    pick.click();
  };
  root.addEventListener("keydown", onKeydown);
  // After a one-click answer, go on to the next step (never submit by itself).
  const onChange = (e: Event) => {
    if (!autoAdvance || !(e.target instanceof HTMLInputElement) || e.target.type !== "radio") return;
    const q = stepQuestion();
    if (!q || !ONE_CLICK.has(q.type) || (q.type === "image-choice" && q.multiple)) return;
    if (!stepNode()?.contains(e.target) || isLastStep(model.snapshot)) return;
    queueMicrotask(() => model.nextStep());
  };
  root.addEventListener("change", onChange);

  const unsubscribe = model.subscribe((state) => {
    if (state.status === "completed") {
      if (renderedStatus !== "completed") {
        const done = pipeText(state.survey.completedText ?? labels.completed, state.survey, state.logic.answers, {
          ...pipeOptions,
          values: { ...model.hidden, ...state.logic.variables },
        });
        root.replaceChildren(h(doc, "p", { class: "kv-completed", role: "status" }, done));
      }
      renderedStatus = state.status;
      return;
    }
    if (state.pageIndex !== renderedPage) {
      renderPage(state);
      renderedPage = state.pageIndex;
    }
    for (const v of views) v.update(state);
    for (const t of texts) t(state);
    if (byQuestion) {
      const step = currentStep(state);
      for (const [id, node] of topNodes) if (id !== step?.id) node.hidden = true;
      if (step && step.id !== renderedStep) {
        // Move focus to the new step, except on the first render.
        if (renderedStep !== undefined) {
          topNodes.find(([id]) => id === step.id)?.[1].querySelector<HTMLElement>("input, select, textarea, button, canvas")?.focus();
        }
        renderedStep = step.id;
      }
    }
    const progress = root.querySelector<HTMLProgressElement>(".kv-progress-bar");
    if (progress) {
      const n = byQuestion ? state.stepIndex + 1 : state.visiblePageIndex + 1;
      const total = byQuestion ? state.steps.length : state.pages.length;
      progress.max = Math.max(total, 1);
      progress.value = Math.min(n, total);
      const text = labels.progress.replaceAll("{n}", String(n)).replaceAll("{total}", String(total));
      progress.setAttribute("aria-valuetext", text);
      root.querySelector(".kv-progress-text")!.textContent = text;
    }
    const submit = root.querySelector<HTMLButtonElement>(".kv-next");
    if (submit) {
      submit.disabled = state.status === "submitting" || state.uploading.length > 0;
      submit.textContent = (byQuestion ? isLastStep(state) : state.isLastPage) ? labels.complete : labels.next;
    }
    const back = root.querySelector<HTMLButtonElement>(".kv-prev");
    if (back) back.hidden = byQuestion ? state.stepIndex === 0 : state.isFirstPage;
    const err = root.querySelector<El>(".kv-submit-error");
    if (err) {
      err.textContent = state.submitError ?? "";
      err.hidden = !state.submitError;
    }
    renderedStatus = state.status;
  });

  function renderPage(state: SurveyState) {
    const parts: Node[] = [];
    views = [];
    texts = [];
    topNodes = [];
    if (showProgress) {
      parts.push(
        h(
          doc,
          "div",
          { class: "kv-progress" },
          h(doc, "progress", { class: "kv-progress-bar", "aria-label": labels.progressLabel }),
          h(doc, "span", { class: "kv-progress-text", "aria-hidden": "true" }),
        ),
      );
    }
    if (state.visiblePageIndex === 0) {
      parts.push(h(doc, "h2", { class: "kv-title" }, txt(state.survey.title)));
      if (state.survey.description) parts.push(h(doc, "p", { class: "kv-description" }, txt(state.survey.description)));
    }
    if (state.page.title) parts.push(h(doc, "h3", { class: "kv-page-title" }, txt(state.page.title)));
    for (const el of state.page.elements) {
      const node = renderElement(el, state);
      topNodes.push([el.id, node]);
      parts.push(node);
    }

    const nav = h(doc, "div", { class: "kv-nav" });
    const back = h(doc, "button", { type: "button", class: "kv-prev" }, labels.prev);
    back.addEventListener("click", () => (byQuestion ? model.prevStep() : model.prev()));
    nav.append(back, h(doc, "button", { type: "submit", class: "kv-next" }, labels.next));
    parts.push(h(doc, "p", { class: "kv-submit-error", role: "alert", hidden: "" }), nav);
    root.replaceChildren(...parts);
  }

  /** Render a question or a panel (with its contents), registering a view for each. */
  function topBinding(q: Question): Binding {
    return {
      key: q.id,
      get: (s) => s.answers[q.id],
      set: (v) => model.setValue(q.id, v),
      visible: (s) => s.logic.visibleQuestions.has(q.id),
      required: (s) => s.logic.requiredQuestions.has(q.id),
      enabled: (s) => !s.logic.disabledQuestions.has(q.id),
      shown: (s) => s.logic.answers[q.id],
    };
  }

  /** A content block or an image. `item` gives the repeat item's answers for `{$item.q}`. */
  function renderBlock(el: DisplayElement, item?: (s: SurveyState) => Answers | undefined): El {
    const wrap = h(doc, "div", { class: `kv-block kv-${el.type}`, "data-block": el.id });
    if (el.type === "image") {
      const img = h(doc, "img", { src: el.src, alt: "", loading: "lazy" });
      if (el.width) img.width = el.width;
      const alt = txt(el.alt, item);
      // Keep the alt text up to date when it pipes answers.
      if (typeof alt === "string") img.alt = alt;
      else {
        img.alt = alt.textContent ?? "";
        texts.push(() => void (img.alt = alt.textContent ?? ""));
      }
      wrap.append(img);
    } else if (el.html && options.sanitizeHtml) {
      wrap.innerHTML = options.sanitizeHtml(el.html);
    } else {
      const inline = (nodes: MarkdownInline[]): (Node | string)[] =>
        nodes.map((n) => {
          if (n.type === "text") return txt(n.text, item);
          if (n.type === "link") {
            return h(doc, "a", { href: n.href, target: "_blank", rel: "noopener noreferrer" }, ...inline(n.children));
          }
          return h(doc, n.type === "strong" ? "strong" : "em", {}, ...inline(n.children));
        });
      for (const block of parseMarkdown(textOf(el.markdown))) {
        if (block.type === "paragraph") wrap.append(h(doc, "p", {}, ...inline(block.children)));
        else wrap.append(h(doc, block.ordered ? "ol" : "ul", {}, ...block.items.map((i) => h(doc, "li", {}, ...inline(i)))));
      }
    }
    return wrap;
  }

  function renderElement(el: Element, state: SurveyState): El {
    if (el.type === "content" || el.type === "image") {
      const block = renderBlock(el);
      views.push({ el: block, update: (s) => void (block.hidden = !s.logic.visibleBlocks.has(el.id)) });
      return block;
    }
    if (el.type !== "panel") {
      const view = renderQuestion(el, state, topBinding(el));
      views.push(view);
      return view.el;
    }
    if (el.repeat) return renderRepeat(el, state);
    const wrap = h(doc, "fieldset", { class: "kv-panel", "data-panel": el.id });
    if (el.title) wrap.append(h(doc, "legend", { class: "kv-panel-title" }, txt(el.title)));
    if (el.description) wrap.append(h(doc, "p", { class: "kv-panel-description" }, txt(el.description)));
    const body = h(doc, "div", { class: "kv-panel-body" });
    for (const child of el.elements) body.append(renderElement(child, state));
    wrap.append(body);
    views.push({ el: wrap, update: (s) => void (wrap.hidden = !s.logic.visiblePanels.has(el.id)) });
    return wrap;
  }

  /**
   * A repeating panel: its items, each with its own copy of the panel's
   * contents, plus add and remove buttons. Items are rebuilt only when their
   * number changes, so typing never loses focus.
   */
  function renderRepeat(panel: Panel, state: SurveyState): El {
    const repeat = panel.repeat ?? {};
    const wrap = h(doc, "fieldset", { class: "kv-panel kv-repeat", "data-panel": panel.id });
    if (panel.title) wrap.append(h(doc, "legend", { class: "kv-panel-title" }, txt(panel.title)));
    if (panel.description) wrap.append(h(doc, "p", { class: "kv-panel-description" }, txt(panel.description)));
    const list = h(doc, "div", { class: "kv-repeat-items" });
    const add = h(doc, "button", { type: "button", class: "kv-repeat-add" }, repeat.addLabel ?? labels.addItem);
    add.addEventListener("click", () => model.addItem(panel.id));
    const err = h(doc, "p", { class: "kv-error", role: "alert", hidden: "" });
    wrap.append(list, add, err);

    let itemViews: QuestionView[] = [];
    let itemTexts: ((state: SurveyState) => void)[] = [];
    let renderedCount = -1;
    const build = (s: SurveyState) => {
      const items = repeatItems(s.answers[panel.id]);
      itemViews = [];
      // Texts inside items are refreshed by this panel, and dropped with the items when they are rebuilt.
      const pageTexts = texts;
      texts = itemTexts = [];
      list.replaceChildren(
        ...items.map((_, index) => {
          const item = h(doc, "div", { class: "kv-repeat-item", "data-item": String(index) });
          const itemAnswers = (st: SurveyState) => st.logic.items[panel.id]?.[index]?.answers;
          const rawTitle = textOf(repeat.itemTitle ?? labels.itemTitle).replaceAll("{n}", String(index + 1));
          const title = pipeText(rawTitle, s.survey, s.logic.answers, { ...pipeOptions, item: itemAnswers(s) });
          const remove = h(
            doc,
            "button",
            { type: "button", class: "kv-repeat-remove", "aria-label": `${repeat.removeLabel ?? labels.removeItem}: ${title}` },
            repeat.removeLabel ?? labels.removeItem,
          );
          remove.addEventListener("click", () => model.removeItem(panel.id, index));
          item.append(h(doc, "div", { class: "kv-repeat-item-head" }, h(doc, "span", { class: "kv-repeat-item-title" }, txt(rawTitle, itemAnswers)), remove));
          const logicOf = (st: SurveyState) => st.logic.items[panel.id]?.[index];
          const renderChild = (el: Element): El => {
            if (el.type === "content" || el.type === "image") {
              const block = renderBlock(el, itemAnswers);
              itemViews.push({ el: block, update: (st) => void (block.hidden = !logicOf(st)?.visibleBlocks.has(el.id)) });
              return block;
            }
            if (el.type === "panel") {
              const box = h(doc, "fieldset", { class: "kv-panel", "data-panel": el.id });
              if (el.title) box.append(h(doc, "legend", { class: "kv-panel-title" }, txt(el.title, itemAnswers)));
              if (el.description) box.append(h(doc, "p", { class: "kv-panel-description" }, txt(el.description, itemAnswers)));
              const body = h(doc, "div", { class: "kv-panel-body" });
              for (const c of el.elements) body.append(renderChild(c));
              box.append(body);
              itemViews.push({ el: box, update: (st) => void (box.hidden = !logicOf(st)?.visiblePanels.has(el.id)) });
              return box;
            }
            const view = renderQuestion(el, s, {
              key: itemKey(panel.id, index, el.id),
              get: (st) => repeatItems(st.answers[panel.id])[index]?.[el.id],
              set: (v) => model.setItemValue(panel.id, index, el.id, v),
              visible: (st) => Boolean(logicOf(st)?.visibleQuestions.has(el.id)),
              required: (st) => Boolean(logicOf(st)?.requiredQuestions.has(el.id)),
              enabled: (st) => !logicOf(st)?.disabledQuestions.has(el.id),
              shown: (st) => logicOf(st)?.answers[el.id],
              item: itemAnswers,
            });
            itemViews.push(view);
            return view.el;
          };
          const body = h(doc, "div", { class: "kv-panel-body" });
          for (const c of panel.elements) body.append(renderChild(c));
          item.append(body);
          return item;
        }),
      );
      texts = pageTexts;
    };

    views.push({
      el: wrap,
      update(s) {
        wrap.hidden = !s.logic.visiblePanels.has(panel.id);
        const count = repeatItems(s.answers[panel.id]).length;
        if (count !== renderedCount) {
          renderedCount = count;
          build(s);
        }
        const { min = 0, max } = repeat;
        add.hidden = max !== undefined && count >= max;
        for (const btn of list.querySelectorAll<HTMLButtonElement>(".kv-repeat-remove")) btn.hidden = count <= min;
        err.textContent = s.errors[panel.id] ?? "";
        err.hidden = !s.errors[panel.id];
        for (const v of itemViews) v.update(s);
        for (const t of itemTexts) t(s);
      },
    });
    return wrap;
  }

  function renderQuestion(q: Question, state: SurveyState, b: Binding): QuestionView {
    const value = b.get(state);
    const qid = `kv-${model.survey.id}-${b.key}`;
    const wrap = h(doc, "fieldset", { class: `kv-question kv-question--${q.type}`, "data-question": q.id, "data-key": b.key });
    const legend = h(doc, "legend", { class: "kv-question-title", id: `${qid}-title` }, txt(q.title, b.item));
    const star = h(doc, "span", { class: "kv-required", "aria-hidden": "true" }, " *");
    legend.append(star);
    wrap.append(legend);
    if (q.description) wrap.append(h(doc, "p", { class: "kv-question-description" }, txt(q.description, b.item)));

    const set = b.set;
    const current = () => b.get(model.snapshot);
    let refresh: (state: SurveyState) => void = () => {};

    switch (q.type) {
      case "text": {
        const input = h(doc, "input", { id: qid, type: q.inputType ?? "text", "aria-labelledby": `${qid}-title` });
        if (q.placeholder) input.placeholder = textOf(q.placeholder);
        input.value = typeof value === "string" ? value : "";
        input.addEventListener("input", () => set(input.value));
        wrap.append(input);
        refresh = syncText(input, b);
        break;
      }
      case "comment": {
        const ta = h(doc, "textarea", { id: qid, rows: String(q.rows ?? 4), "aria-labelledby": `${qid}-title` });
        if (q.placeholder) ta.placeholder = textOf(q.placeholder);
        ta.value = typeof value === "string" ? value : "";
        ta.addEventListener("input", () => set(ta.value));
        wrap.append(ta);
        refresh = syncText(ta, b);
        break;
      }
      case "computed": {
        const out = h(doc, "output", { id: qid, class: "kv-computed", "aria-labelledby": `${qid}-title`, "aria-live": "polite" });
        wrap.append(out);
        refresh = (s) => {
          const text = formatComputed(q, b.shown(s));
          if (out.textContent !== text) out.textContent = text;
        };
        break;
      }
      case "dropdown": {
        if (q.searchable) {
          refresh = renderSearchable(q, qid, wrap, b);
          break;
        }
        const select = h(doc, "select", { id: qid, "aria-labelledby": `${qid}-title` }, h(doc, "option", { value: "" }, ""));
        for (const c of q.choices) select.append(h(doc, "option", { value: c.value }, txt(c.label, b.item)));
        select.value = typeof value === "string" ? value : "";
        select.addEventListener("change", () => set(select.value || null));
        wrap.append(select);
        refresh = (s) => {
          const v = b.get(s);
          const want = typeof v === "string" ? v : "";
          if (select.value !== want) select.value = want;
        };
        break;
      }
      case "single-choice":
      case "multiple-choice": {
        const multi = q.type === "multiple-choice";
        const inputs: [HTMLInputElement, string][] = [];
        refresh = (s) => {
          const v = b.get(s);
          for (const [input, choice] of inputs) {
            input.checked = multi ? Array.isArray(v) && (v as string[]).includes(choice) : v === choice;
          }
        };
        for (const c of q.choices) {
          const input = h(doc, "input", { type: multi ? "checkbox" : "radio", name: qid, value: c.value });
          input.checked = multi ? Array.isArray(value) && (value as string[]).includes(c.value) : value === c.value;
          inputs.push([input, c.value]);
          input.addEventListener("change", () => {
            if (!multi) return set(c.value);
            const v = current();
            const picked = new Set(Array.isArray(v) ? (v as string[]) : []);
            if (input.checked) picked.add(c.value);
            else picked.delete(c.value);
            set(q.choices.map((x) => x.value).filter((x) => picked.has(x)));
          });
          wrap.append(h(doc, "label", { class: "kv-choice" }, input, " ", txt(c.label, b.item)));
        }
        break;
      }
      case "rating": {
        const row = h(doc, "div", { class: "kv-rating", role: "radiogroup", "aria-labelledby": `${qid}-title` });
        for (let n = q.min; n <= q.max; n++) {
          const input = h(doc, "input", { type: "radio", name: qid, value: String(n) });
          input.checked = value === n;
          input.addEventListener("change", () => set(n));
          row.append(h(doc, "label", { class: "kv-rating-item" }, input, ` ${n}`));
        }
        wrap.append(row);
        break;
      }
      case "boolean": {
        for (const [v, label] of [
          [true, q.labelTrue ?? labels.yes],
          [false, q.labelFalse ?? labels.no],
        ] as const) {
          const input = h(doc, "input", { type: "radio", name: qid, value: String(v) });
          input.checked = value === v;
          input.addEventListener("change", () => set(v));
          const prev = refresh;
          refresh = (s) => {
            prev(s);
            input.checked = b.get(s) === v;
          };
          wrap.append(h(doc, "label", { class: "kv-choice" }, input, ` ${label}`));
        }
        break;
      }
      case "matrix":
        wrap.append(renderMatrix(q, qid, value, b));
        break;
      case "grid":
        wrap.append(renderGrid(q, qid, value, b));
        break;
      case "ranking":
        refresh = renderRanking(q, wrap, b);
        break;
      case "file":
        refresh = renderFile(q, qid, wrap);
        break;
      case "multi-text": {
        const inputs: [HTMLInputElement, string][] = [];
        const box = h(doc, "div", { class: "kv-multi-text" });
        for (const item of q.items) {
          const input = h(doc, "input", { id: `${qid}-${item.value}`, type: item.inputType ?? "text", "data-item": item.value });
          const cur = isRecordValue(value) ? value[item.value] : undefined;
          input.value = typeof cur === "string" ? cur : "";
          input.addEventListener("input", () => {
            const prev = b.get(model.snapshot);
            const next: Record<string, string> = { ...(isRecordValue(prev) ? (prev as Record<string, string>) : {}) };
            if (input.value === "") delete next[item.value];
            else next[item.value] = input.value;
            set(Object.keys(next).length ? next : undefined);
          });
          inputs.push([input, item.value]);
          box.append(h(doc, "label", { class: "kv-multi-text-item", for: input.id }, h(doc, "span", {}, txt(item.label, b.item)), input));
        }
        wrap.append(box);
        refresh = (s) => {
          const v = b.get(s);
          for (const [input, key] of inputs) {
            const want = isRecordValue(v) && typeof v[key] === "string" ? (v[key] as string) : "";
            if (input.value !== want && doc.activeElement !== input) input.value = want;
          }
        };
        break;
      }
      case "slider": {
        const input = h(doc, "input", {
          id: qid,
          type: "range",
          min: String(q.min),
          max: String(q.max),
          step: String(q.step),
          "aria-labelledby": `${qid}-title`,
        });
        const out = h(doc, "output", { class: "kv-slider-value", for: qid });
        input.addEventListener("input", () => set(Number(input.value)));
        wrap.append(h(doc, "div", { class: "kv-slider" }, input, out));
        refresh = (s) => {
          const v = b.get(s);
          const answered = typeof v === "number";
          if (answered && doc.activeElement !== input) input.value = String(v);
          // An untouched slider has no answer yet: say so instead of showing the thumb's starting value.
          input.classList.toggle("kv-slider--unset", !answered);
          input.setAttribute("aria-valuetext", answered ? `${v}${q.unit ? ` ${q.unit}` : ""}` : labels.notSet);
          out.textContent = answered ? `${v}${q.unit ? ` ${q.unit}` : ""}` : labels.notSet;
        };
        break;
      }
      case "tags":
        refresh = renderTags(q, qid, wrap, b);
        break;
      case "signature":
        refresh = renderSignature(q, qid, wrap, b);
        break;
      case "image-choice": {
        const multi = Boolean(q.multiple);
        const inputs: [HTMLInputElement, string][] = [];
        const grid = h(doc, "div", { class: "kv-image-choices" });
        for (const c of q.choices) {
          const input = h(doc, "input", { type: multi ? "checkbox" : "radio", name: qid, value: c.value });
          input.addEventListener("change", () => {
            if (!multi) return set(c.value);
            const v = current();
            const picked = new Set(Array.isArray(v) ? (v as string[]) : []);
            if (input.checked) picked.add(c.value);
            else picked.delete(c.value);
            const next = q.choices.map((x) => x.value).filter((x) => picked.has(x));
            set(next.length ? next : undefined);
          });
          inputs.push([input, c.value]);
          const img = h(doc, "img", { src: c.imageUrl, alt: "", loading: "lazy" });
          grid.append(h(doc, "label", { class: "kv-image-choice" }, input, img, h(doc, "span", {}, txt(c.label, b.item))));
        }
        wrap.append(grid);
        refresh = (s) => {
          const v = b.get(s);
          for (const [input, choice] of inputs) {
            input.checked = multi ? Array.isArray(v) && (v as string[]).includes(choice) : v === choice;
          }
        };
        break;
      }
      default: {
        // A registered custom type draws itself; without a renderer it gets a plain text input.
        const def = questionType(q.type);
        if (def?.render) {
          const view = def.render({ question: q, value, setValue: set, document: doc, id: qid, labelId: `${qid}-title` });
          wrap.append(view.element);
          if (view.update) refresh = (s) => view.update!(b.get(s));
        } else {
          const input = h(doc, "input", { id: qid, type: "text", "aria-labelledby": `${qid}-title` });
          input.value = typeof value === "string" ? value : "";
          input.addEventListener("input", () => set(input.value));
          wrap.append(input);
          refresh = syncText(input, b);
        }
      }
    }

    const err = h(doc, "p", { class: "kv-error", role: "alert", hidden: "" });
    wrap.append(err);
    return {
      el: wrap,
      update(s) {
        wrap.hidden = !b.visible(s);
        star.hidden = !b.required(s);
        // A disabled fieldset disables every input inside it.
        wrap.disabled = q.type !== "computed" && !b.enabled(s);
        err.textContent = s.errors[b.key] ?? "";
        err.hidden = !s.errors[b.key];
        refresh(s);
      },
    };
  }

  /**
   * A signature pad: draw with a mouse, pen or finger (pointer events). Each
   * finished stroke saves the drawing as a PNG through `model.addFiles`, so it
   * is uploaded and checked like any file.
   */
  function renderSignature(q: Extract<Question, { type: "signature" }>, qid: string, wrap: El, b: Binding) {
    const canvas = h(doc, "canvas", {
      id: qid,
      class: "kv-signature-pad",
      width: String(q.width),
      height: String(q.height),
      role: "img",
      "aria-labelledby": `${qid}-title`,
    });
    canvas.style.touchAction = "none";
    const clear = h(doc, "button", { type: "button", class: "kv-signature-clear" }, labels.clearSignature);
    const status = h(doc, "p", { class: "kv-signature-status", "aria-live": "polite" });
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = q.penColor ?? "#000";
    }
    let drawing = false;
    let strokes = 0;
    const point = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const sx = r.width ? canvas.width / r.width : 1;
      const sy = r.height ? canvas.height / r.height : 1;
      return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy] as const;
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (!ctx) return;
      drawing = true;
      canvas.setPointerCapture?.(e.pointerId);
      const [x, y] = point(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drawing || !ctx) return;
      const [x, y] = point(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
    const finish = () => {
      if (!drawing) return;
      drawing = false;
      strokes++;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], "signature.png", { type: "image/png" });
        void model.addFiles(q.id, [file]);
      }, "image/png");
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    clear.addEventListener("click", () => {
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      strokes = 0;
      b.set(undefined);
    });
    wrap.append(canvas, h(doc, "div", { class: "kv-signature-actions" }, clear, status));
    return (s: SurveyState) => {
      const v = b.get(s);
      const signed = Array.isArray(v) && v.length > 0;
      clear.hidden = !signed && strokes === 0;
      status.textContent = s.uploading.includes(q.id) ? labels.uploading : signed ? labels.signed : "";
      // Cleared from outside (a reset): wipe the pad too.
      if (!signed && strokes > 0 && !s.uploading.includes(q.id) && !drawing && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokes = 0;
      }
    };
  }

  /** A dropdown you can type into: an input with a list of the choice labels. */
  function renderSearchable(q: Extract<Question, { type: "dropdown" }>, qid: string, wrap: El, b: Binding) {
    const list = h(doc, "datalist", { id: `${qid}-list` });
    for (const c of q.choices) list.append(h(doc, "option", { value: c.label }));
    const input = h(doc, "input", { id: qid, type: "text", list: list.id, autocomplete: "off", "aria-labelledby": `${qid}-title` });
    const labelOf = (v: unknown) => textOf(q.choices.find((c) => c.value === v)?.label);
    input.value = labelOf(b.get(model.snapshot));
    // Only a label that matches a choice sets the answer; anything else clears it.
    input.addEventListener("input", () => {
      const match = q.choices.find((c) => textOf(c.label).toLowerCase() === input.value.trim().toLowerCase());
      b.set(match ? match.value : undefined);
    });
    wrap.append(input, list);
    return (s: SurveyState) => {
      const want = labelOf(b.get(s));
      if (doc.activeElement !== input && input.value !== want) input.value = want;
    };
  }

  /** Tags: chips for the picked entries, and an input that suggests choices (and takes new entries with `allowCustom`). */
  function renderTags(q: Extract<Question, { type: "tags" }>, qid: string, wrap: El, b: Binding) {
    const chips = h(doc, "ul", { class: "kv-tags", "aria-label": labels.selected });
    const list = h(doc, "datalist", { id: `${qid}-list` });
    for (const c of q.choices) list.append(h(doc, "option", { value: c.label }));
    const input = h(doc, "input", { id: qid, type: "text", list: list.id, autocomplete: "off", "aria-labelledby": `${qid}-title` });
    const picked = (): string[] => {
      const v = b.get(model.snapshot);
      return Array.isArray(v) ? (v as string[]) : [];
    };
    const add = () => {
      const text = input.value.trim();
      if (!text) return;
      const match = q.choices.find((c) => textOf(c.label).toLowerCase() === text.toLowerCase() || c.value === text);
      const value = match ? match.value : q.allowCustom ? text : undefined;
      if (value === undefined) return;
      input.value = "";
      if (!picked().includes(value)) b.set([...picked(), value]);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        add();
      }
    });
    // Picking a suggestion from the list adds it straight away.
    input.addEventListener("change", add);
    wrap.append(chips, input, list);
    let rendered = "";
    return (s: SurveyState) => {
      const v = b.get(s);
      const items = Array.isArray(v) ? (v as string[]) : [];
      const key = items.join("\u0000");
      if (key === rendered) return;
      rendered = key;
      chips.replaceChildren(
        ...items.map((value) => {
          const label = q.choices.find((c) => c.value === value)?.label ?? value;
          const remove = h(doc, "button", { type: "button", class: "kv-tag-remove", "aria-label": `${labels.removeFile}: ${label}` }, "×");
          remove.addEventListener("click", () => {
            const next = picked().filter((x) => x !== value);
            b.set(next.length ? next : undefined);
          });
          return h(doc, "li", { class: "kv-tag" }, label, remove);
        }),
      );
    };
  }

  /** Keep a text input showing the answer when the model changes it (a default or a reset), without fighting typing. */
  function syncText(input: HTMLInputElement | HTMLTextAreaElement, b: Binding) {
    return (s: SurveyState) => {
      const v = b.get(s);
      const want = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
      if (input.value !== want && doc.activeElement !== input) input.value = want;
    };
  }

  function renderMatrix(q: MatrixQuestion, qid: string, value: AnswerValue | undefined, b: Binding) {
    const set = b.set;
    const current = (): MatrixAnswer => {
      const v = b.get(model.snapshot);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as MatrixAnswer) : {};
    };
    const initial = value && typeof value === "object" && !Array.isArray(value) ? (value as MatrixAnswer) : {};
    const table = h(doc, "table", { class: "kv-matrix", "aria-labelledby": `${qid}-title` });
    const headRow = h(doc, "tr", {}, h(doc, "td", {}));
    for (const col of q.columns) headRow.append(h(doc, "th", { scope: "col" }, col.label));
    table.append(h(doc, "thead", {}, headRow));
    const body = h(doc, "tbody");
    for (const row of q.rows) {
      const rowId = `${qid}-row-${row.value}`;
      const tr = h(doc, "tr", {}, h(doc, "th", { scope: "row", id: rowId }, row.label));
      for (const col of q.columns) {
        const input = h(doc, "input", {
          type: q.multiple ? "checkbox" : "radio",
          name: rowId,
          value: col.value,
          "aria-label": `${row.label}: ${col.label}`,
        });
        const cell = initial[row.value];
        input.checked = Array.isArray(cell) ? cell.includes(col.value) : cell === col.value;
        input.addEventListener("change", () => {
          const next = { ...current() };
          if (q.multiple) {
            const prev = next[row.value];
            const picked = new Set(Array.isArray(prev) ? prev : []);
            if (input.checked) picked.add(col.value);
            else picked.delete(col.value);
            const ordered = q.columns.map((c) => c.value).filter((c) => picked.has(c));
            if (ordered.length) next[row.value] = ordered;
            else delete next[row.value];
          } else {
            next[row.value] = col.value;
          }
          set(Object.keys(next).length ? next : undefined);
        });
        tr.append(h(doc, "td", {}, h(doc, "label", { class: "kv-matrix-cell" }, input)));
      }
      body.append(tr);
    }
    table.append(body);
    return h(doc, "div", { class: "kv-matrix-scroll" }, table);
  }

  /** A table with one input per cell; each column has its own input type. */
  function renderGrid(q: GridQuestion, qid: string, value: AnswerValue | undefined, b: Binding) {
    const current = (): GridAnswer => {
      const v = b.get(model.snapshot);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as GridAnswer) : {};
    };
    const initial = value && typeof value === "object" && !Array.isArray(value) ? (value as GridAnswer) : {};
    const setCell = (row: string, col: string, cell: string | number | boolean | undefined) => {
      const next: GridAnswer = { ...current() };
      const cells = { ...(next[row] ?? {}) };
      if (cell === undefined || cell === "") delete cells[col];
      else cells[col] = cell;
      if (Object.keys(cells).length) next[row] = cells;
      else delete next[row];
      b.set(Object.keys(next).length ? next : undefined);
    };
    const table = h(doc, "table", { class: "kv-grid", "aria-labelledby": `${qid}-title` });
    const headRow = h(doc, "tr", {}, h(doc, "td", {}));
    for (const col of q.columns) headRow.append(h(doc, "th", { scope: "col" }, col.label));
    table.append(h(doc, "thead", {}, headRow));
    const body = h(doc, "tbody");
    for (const row of q.rows) {
      const tr = h(doc, "tr", {}, h(doc, "th", { scope: "row" }, row.label));
      for (const col of q.columns) {
        const label = `${row.label}: ${col.label}`;
        const cell = initial[row.value]?.[col.value];
        let input: HTMLInputElement | HTMLSelectElement;
        if (col.cellType === "dropdown" || col.cellType === "boolean") {
          const options =
            col.cellType === "dropdown"
              ? (col.choices ?? [])
              : [
                  { value: "true", label: labels.yes },
                  { value: "false", label: labels.no },
                ];
          const select = h(doc, "select", { "aria-label": label }, h(doc, "option", { value: "" }, ""));
          for (const o of options) select.append(h(doc, "option", { value: o.value }, o.label));
          select.value = cell === undefined ? "" : String(cell);
          select.addEventListener("change", () =>
            setCell(row.value, col.value, col.cellType === "boolean" ? (select.value === "" ? undefined : select.value === "true") : select.value),
          );
          input = select;
        } else {
          const field = h(doc, "input", { type: col.cellType === "number" ? "number" : "text", "aria-label": label });
          field.value = cell === undefined ? "" : String(cell);
          field.addEventListener("input", () => {
            const raw = field.value;
            if (col.cellType !== "number") return setCell(row.value, col.value, raw);
            const n = raw.trim() === "" ? undefined : Number(raw);
            setCell(row.value, col.value, n !== undefined && Number.isFinite(n) ? n : undefined);
          });
          input = field;
        }
        input.dataset.cell = `${row.value}.${col.value}`;
        tr.append(h(doc, "td", {}, input));
      }
      body.append(tr);
    }
    table.append(body);
    return h(doc, "div", { class: "kv-matrix-scroll" }, table);
  }

  function renderRanking(q: RankingQuestion, wrap: El, b: Binding) {
    const set = b.set;
    const labelOf = new Map(q.choices.map((c) => [c.value, c.label]));
    const order = (): string[] => {
      const v = b.get(model.snapshot);
      const valid = Array.isArray(v) && v.length === q.choices.length && v.every((x) => typeof x === "string" && labelOf.has(x));
      return valid ? [...(v as string[])] : q.choices.map((c) => c.value);
    };
    const move = (from: number, to: number) => {
      const next = order();
      if (to < 0 || to >= next.length || from === to) return;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      set(next);
    };

    wrap.append(h(doc, "p", { class: "kv-ranking-hint" }, labels.rankingHint));
    const list = h(doc, "ol", { class: "kv-ranking" });
    const keep = h(doc, "button", { type: "button", class: "kv-ranking-keep" }, labels.keepOrder);
    keep.addEventListener("click", () => set(order()));
    wrap.append(list, keep);

    let dragFrom = -1;
    let rendered = "";
    // After a keyboard move, focus follows the moved item.
    let focusAfter: { value: string; dir: "up" | "down" } | null = null;

    return (state: SurveyState) => {
      const answered = Array.isArray(b.get(state));
      keep.hidden = answered;
      const items = order();
      const key = `${answered}:${items.join("\u0000")}`;
      if (key === rendered) return;
      rendered = key;
      list.replaceChildren(
        ...items.map((value, i) => {
          const label = pipeText(labelOf.get(value)!, state.survey, state.logic.answers, { ...pipeOptions, item: b.item?.(state) });
          const up = h(doc, "button", { type: "button", class: "kv-ranking-up", "aria-label": `${labels.moveUp}: ${label}` }, "↑");
          const down = h(doc, "button", { type: "button", class: "kv-ranking-down", "aria-label": `${labels.moveDown}: ${label}` }, "↓");
          up.disabled = i === 0;
          down.disabled = i === items.length - 1;
          up.addEventListener("click", () => {
            focusAfter = { value, dir: "up" };
            move(i, i - 1);
          });
          down.addEventListener("click", () => {
            focusAfter = { value, dir: "down" };
            move(i, i + 1);
          });
          const li = h(
            doc,
            "li",
            { class: "kv-ranking-item", draggable: "true", "data-value": value },
            h(doc, "span", { class: "kv-ranking-pos" }, `${i + 1}`),
            h(doc, "span", { class: "kv-ranking-label" }, label),
            up,
            down,
          );
          li.addEventListener("dragstart", (e) => {
            dragFrom = i;
            e.dataTransfer?.setData("text/plain", value);
            li.classList.add("kv-dragging");
          });
          li.addEventListener("dragend", () => li.classList.remove("kv-dragging"));
          li.addEventListener("dragover", (e) => e.preventDefault());
          li.addEventListener("drop", (e) => {
            e.preventDefault();
            if (dragFrom >= 0) move(dragFrom, i);
            dragFrom = -1;
          });
          return li;
        }),
      );
      if (focusAfter) {
        const { value, dir } = focusAfter;
        focusAfter = null;
        const li = [...list.children].find((c) => (c as El).dataset.value === value) as El | undefined;
        const btn = li?.querySelector<HTMLButtonElement>(dir === "up" ? ".kv-ranking-up" : ".kv-ranking-down");
        (btn && !btn.disabled ? btn : li?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
      }
    };
  }

  function renderFile(q: FileQuestion, qid: string, wrap: El) {
    const input = h(doc, "input", { id: qid, type: "file", "aria-labelledby": `${qid}-title` });
    if (q.accept?.length) input.accept = q.accept.join(",");
    input.multiple = q.maxFiles > 1;
    input.addEventListener("change", () => {
      const files = [...(input.files ?? [])];
      input.value = "";
      if (files.length) void model.addFiles(q.id, files);
    });
    const status = h(doc, "p", { class: "kv-file-status", role: "status" });
    const list = h(doc, "ul", { class: "kv-files" });
    wrap.append(input, status, list);
    let rendered: unknown = undefined;

    return (state: SurveyState) => {
      const busy = state.uploading.includes(q.id);
      status.textContent = busy ? labels.uploading : "";
      status.hidden = !busy;
      const value = state.answers[q.id];
      const files = Array.isArray(value) ? (value as FileAnswer[]) : [];
      input.disabled = busy || files.length >= q.maxFiles;
      if (value === rendered) return;
      rendered = value;
      list.replaceChildren(
        ...files.map((f, i) => {
          const remove = h(doc, "button", { type: "button", class: "kv-file-remove", "aria-label": `${labels.removeFile}: ${f.name}` }, labels.removeFile);
          remove.addEventListener("click", () => model.removeFile(q.id, i));
          return h(
            doc,
            "li",
            { class: "kv-file" },
            h(doc, "span", { class: "kv-file-name" }, f.name),
            h(doc, "span", { class: "kv-file-size" }, ` (${formatBytes(f.size)}) `),
            remove,
          );
        }),
      );
    };
  }

  return {
    model,
    destroy() {
      unsubscribe();
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("keydown", onKeydown);
      root.removeEventListener("change", onChange);
      root.remove();
    },
  };
}

/** One-call embed: create the model and render it into `target`. */
export function mountSurvey(target: El, options: CreateSurveyOptions & RenderOptions): RenderedSurvey {
  const { labels, sanitizeHtml, layout, progressBar, autoAdvance, theme, ...modelOptions } = options;
  const render: RenderOptions = { labels, sanitizeHtml, layout, progressBar, autoAdvance, theme };
  // Leave unset options out, so the survey's own settings apply.
  for (const k of Object.keys(render) as (keyof RenderOptions)[]) if (render[k] === undefined) delete render[k];
  return renderSurvey(target, createSurvey(modelOptions), render);
}
