import {
  pageQuestions,
  type AnswerValue,
  type FileAnswer,
  type FileQuestion,
  type MatrixAnswer,
  type MatrixQuestion,
  type Question,
  type RankingQuestion,
} from "@kvesto/schema";
import { createSurvey, type CreateSurveyOptions, type SurveyModel, type SurveyState } from "./model.js";
import { formatBytes } from "./validate.js";

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
  moveUp: "Move up",
  moveDown: "Move down",
  keepOrder: "Keep this order",
  rankingHint: "Drag the items, or use the arrow buttons, to put them in order.",
  removeFile: "Remove",
  uploading: "Uploading…",
};

export interface RenderedSurvey {
  model: SurveyModel;
  destroy(): void;
}

type El = HTMLElement;
type Labels = typeof defaultLabels;

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
  const labels: Labels = { ...defaultLabels, ...options.labels };
  const root = h(doc, "form", { class: "kv-survey", novalidate: "" });
  target.replaceChildren(root);

  let renderedPage = -1;
  let renderedStatus: SurveyState["status"] | null = null;
  let views: QuestionView[] = [];

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
    for (const v of views) v.update(state);
    const submit = root.querySelector<HTMLButtonElement>(".kv-next");
    if (submit) {
      submit.disabled = state.status === "submitting" || state.uploading.length > 0;
      submit.textContent = state.isLastPage ? labels.complete : labels.next;
    }
    const back = root.querySelector<HTMLButtonElement>(".kv-prev");
    if (back) back.hidden = state.isFirstPage;
    const err = root.querySelector<El>(".kv-submit-error");
    if (err) {
      err.textContent = state.submitError ?? "";
      err.hidden = !state.submitError;
    }
    renderedStatus = state.status;
  });

  function renderPage(state: SurveyState) {
    const parts: Node[] = [];
    if (state.visiblePageIndex === 0) {
      parts.push(h(doc, "h2", { class: "kv-title" }, state.survey.title));
      if (state.survey.description) parts.push(h(doc, "p", { class: "kv-description" }, state.survey.description));
    }
    if (state.page.title) parts.push(h(doc, "h3", { class: "kv-page-title" }, state.page.title));
    views = pageQuestions(state.page).map((q) => renderQuestion(q, state));
    parts.push(...views.map((v) => v.el));

    const nav = h(doc, "div", { class: "kv-nav" });
    const back = h(doc, "button", { type: "button", class: "kv-prev" }, labels.prev);
    back.addEventListener("click", () => model.prev());
    nav.append(back, h(doc, "button", { type: "submit", class: "kv-next" }, labels.next));
    parts.push(h(doc, "p", { class: "kv-submit-error", role: "alert", hidden: "" }), nav);
    root.replaceChildren(...parts);
  }

  function renderQuestion(q: Question, state: SurveyState): QuestionView {
    const value = state.answers[q.id];
    const qid = `kv-${model.survey.id}-${q.id}`;
    const wrap = h(doc, "fieldset", { class: `kv-question kv-question--${q.type}`, "data-question": q.id });
    const legend = h(doc, "legend", { class: "kv-question-title", id: `${qid}-title` }, q.title);
    const star = h(doc, "span", { class: "kv-required", "aria-hidden": "true" }, " *");
    legend.append(star);
    wrap.append(legend);
    if (q.description) wrap.append(h(doc, "p", { class: "kv-question-description" }, q.description));

    const set = (v: AnswerValue | undefined) => model.setValue(q.id, v);
    let refresh: (state: SurveyState) => void = () => {};

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
          input.checked = multi ? Array.isArray(value) && (value as string[]).includes(c.value) : value === c.value;
          input.addEventListener("change", () => {
            if (!multi) return set(c.value);
            const v = model.getValue(q.id);
            const current = new Set(Array.isArray(v) ? (v as string[]) : []);
            if (input.checked) current.add(c.value);
            else current.delete(c.value);
            set(q.choices.map((x) => x.value).filter((x) => current.has(x)));
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
      case "matrix":
        wrap.append(renderMatrix(q, qid, value, set));
        break;
      case "ranking":
        refresh = renderRanking(q, wrap, set);
        break;
      case "file":
        refresh = renderFile(q, qid, wrap);
        break;
    }

    const err = h(doc, "p", { class: "kv-error", role: "alert", hidden: "" });
    wrap.append(err);
    return {
      el: wrap,
      update(s) {
        wrap.hidden = !s.logic.visibleQuestions.has(q.id);
        star.hidden = !s.logic.requiredQuestions.has(q.id);
        err.textContent = s.errors[q.id] ?? "";
        err.hidden = !s.errors[q.id];
        refresh(s);
      },
    };
  }

  function renderMatrix(q: MatrixQuestion, qid: string, value: AnswerValue | undefined, set: (v: AnswerValue | undefined) => void) {
    const current = (): MatrixAnswer => {
      const v = model.getValue(q.id);
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

  function renderRanking(q: RankingQuestion, wrap: El, set: (v: AnswerValue | undefined) => void) {
    const labelOf = new Map(q.choices.map((c) => [c.value, c.label]));
    const order = (): string[] => {
      const v = model.getValue(q.id);
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
      const answered = Array.isArray(state.answers[q.id]);
      keep.hidden = answered;
      const items = order();
      const key = `${answered}:${items.join("\u0000")}`;
      if (key === rendered) return;
      rendered = key;
      list.replaceChildren(
        ...items.map((value, i) => {
          const label = labelOf.get(value)!;
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
      root.remove();
    },
  };
}

/** One-call embed: create the model and render it into `target`. */
export function mountSurvey(target: El, options: CreateSurveyOptions & RenderOptions): RenderedSurvey {
  const { labels, ...modelOptions } = options;
  return renderSurvey(target, createSurvey(modelOptions), labels ? { labels } : {});
}
