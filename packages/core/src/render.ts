import type { AnswerValue, Question } from "@kvesto/schema";
import { createSurvey, type CreateSurveyOptions, type SurveyModel, type SurveyState } from "./model.js";

export interface RenderOptions {
  /** Text overrides for the built-in buttons and messages. */
  labels?: Partial<typeof defaultLabels>;
}

const defaultLabels = {
  next: "Next",
  prev: "Back",
  complete: "Submit",
  completed: "Thank you! Your response has been recorded.",
  yes: "Yes",
  no: "No",
};

export interface RenderedSurvey {
  model: SurveyModel;
  destroy(): void;
}

type El = HTMLElement;

function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  for (const c of children) el.append(c);
  return el;
}

/**
 * Renders a survey into a DOM element using plain, unstyled-by-default HTML
 * (class names are prefixed with `kv-`; import "@kvesto/core/styles.css" for
 * a basic theme). Works in any framework or none.
 */
export function renderSurvey(target: El, model: SurveyModel, options: RenderOptions = {}): RenderedSurvey {
  const doc = target.ownerDocument;
  const labels = { ...defaultLabels, ...options.labels };
  const root = h(doc, "form", { class: "kv-survey", novalidate: "" });
  target.replaceChildren(root);

  let renderedPage = -1;
  let renderedStatus: SurveyState["status"] | null = null;
  const errorEls = new Map<string, El>();

  const onSubmit = (e: Event) => {
    e.preventDefault();
    const s = model.snapshot;
    if (s.isLastPage) void model.complete();
    else model.next();
  };
  root.addEventListener("submit", onSubmit);

  const unsubscribe = model.subscribe((state) => {
    if (state.status === "completed") {
      if (renderedStatus !== "completed") {
        root.replaceChildren(h(doc, "p", { class: "kv-completed", role: "status" }, labels.completed));
      }
      renderedStatus = state.status;
      return;
    }
    if (state.pageIndex !== renderedPage) {
      renderPage(state);
      renderedPage = state.pageIndex;
    }
    for (const [qid, el] of errorEls) {
      el.textContent = state.errors[qid] ?? "";
      el.hidden = !state.errors[qid];
    }
    const submit = root.querySelector<HTMLButtonElement>(".kv-next");
    if (submit) submit.disabled = state.status === "submitting";
    const err = root.querySelector<El>(".kv-submit-error");
    if (err) {
      err.textContent = state.submitError ?? "";
      err.hidden = !state.submitError;
    }
    renderedStatus = state.status;
  });

  function renderPage(state: SurveyState) {
    errorEls.clear();
    const parts: Node[] = [];
    if (state.pageIndex === 0) {
      parts.push(h(doc, "h2", { class: "kv-title" }, state.survey.title));
      if (state.survey.description) parts.push(h(doc, "p", { class: "kv-description" }, state.survey.description));
    }
    if (state.page.title) parts.push(h(doc, "h3", { class: "kv-page-title" }, state.page.title));
    for (const q of state.page.elements) parts.push(renderQuestion(q, state.answers[q.id]));

    const nav = h(doc, "div", { class: "kv-nav" });
    if (!state.isFirstPage) {
      const back = h(doc, "button", { type: "button", class: "kv-prev" }, labels.prev);
      back.addEventListener("click", () => model.prev());
      nav.append(back);
    }
    nav.append(h(doc, "button", { type: "submit", class: "kv-next" }, state.isLastPage ? labels.complete : labels.next));
    parts.push(h(doc, "p", { class: "kv-submit-error", role: "alert", hidden: "" }), nav);
    root.replaceChildren(...parts);
  }

  function renderQuestion(q: Question, value: AnswerValue | undefined): El {
    const qid = `kv-${model.survey.id}-${q.id}`;
    const wrap = h(doc, "fieldset", { class: `kv-question kv-question--${q.type}`, "data-question": q.id });
    const legend = h(doc, "legend", { class: "kv-question-title", id: `${qid}-title` }, q.title);
    if (q.required) legend.append(h(doc, "span", { class: "kv-required", "aria-hidden": "true" }, " *"));
    wrap.append(legend);
    if (q.description) wrap.append(h(doc, "p", { class: "kv-question-description" }, q.description));

    const set = (v: AnswerValue) => model.setValue(q.id, v);

    switch (q.type) {
      case "text": {
        const input = h(doc, "input", { id: qid, type: q.inputType ?? "text", "aria-labelledby": `${qid}-title` });
        if (q.placeholder) input.placeholder = q.placeholder;
        input.value = typeof value === "string" ? value : "";
        input.addEventListener("input", () => set(input.value));
        wrap.append(input);
        break;
      }
      case "comment": {
        const ta = h(doc, "textarea", { id: qid, rows: String(q.rows ?? 4), "aria-labelledby": `${qid}-title` });
        if (q.placeholder) ta.placeholder = q.placeholder;
        ta.value = typeof value === "string" ? value : "";
        ta.addEventListener("input", () => set(ta.value));
        wrap.append(ta);
        break;
      }
      case "dropdown": {
        const select = h(doc, "select", { id: qid, "aria-labelledby": `${qid}-title` }, h(doc, "option", { value: "" }, ""));
        for (const c of q.choices) select.append(h(doc, "option", { value: c.value }, c.label));
        select.value = typeof value === "string" ? value : "";
        select.addEventListener("change", () => set(select.value || null));
        wrap.append(select);
        break;
      }
      case "single-choice":
      case "multiple-choice": {
        const multi = q.type === "multiple-choice";
        for (const c of q.choices) {
          const input = h(doc, "input", { type: multi ? "checkbox" : "radio", name: qid, value: c.value });
          input.checked = multi ? Array.isArray(value) && value.includes(c.value) : value === c.value;
          input.addEventListener("change", () => {
            if (!multi) return set(c.value);
            const current = new Set(Array.isArray(model.getValue(q.id)) ? (model.getValue(q.id) as string[]) : []);
            if (input.checked) current.add(c.value);
            else current.delete(c.value);
            set(q.choices.map((x) => x.value).filter((v) => current.has(v)));
          });
          wrap.append(h(doc, "label", { class: "kv-choice" }, input, ` ${c.label}`));
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
          wrap.append(h(doc, "label", { class: "kv-choice" }, input, ` ${label}`));
        }
        break;
      }
    }

    const err = h(doc, "p", { class: "kv-error", role: "alert", hidden: "" });
    errorEls.set(q.id, err);
    wrap.append(err);
    return wrap;
  }

  return {
    model,
    destroy() {
      unsubscribe();
      root.removeEventListener("submit", onSubmit);
      root.remove();
    },
  };
}

/** One-call embed: create the model and render it into `target`. */
export function mountSurvey(target: El, options: CreateSurveyOptions & RenderOptions): RenderedSurvey {
  const { labels, ...modelOptions } = options;
  return renderSurvey(target, createSurvey(modelOptions), labels ? { labels } : {});
}
