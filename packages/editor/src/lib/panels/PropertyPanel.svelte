<script lang="ts">
  import { gridCellQuestion, textOf, withText, type Choice, type GridColumn, type Question, type Validator } from "@kvesto/core";
  import type { DocumentState, SurveyDocument } from "../doc/document.js";
  import type { Condition, Trigger } from "@kvesto/core";
  import ChoiceList from "./ChoiceList.svelte";
  import ConditionBuilder from "./ConditionBuilder.svelte";
  import ValidatorList from "./ValidatorList.svelte";
  import TriggerList from "./TriggerList.svelte";
  import { conditionSources, expressionError } from "../doc/conditions.js";

  let { doc, docState: view }: { doc: SurveyDocument; docState: DocumentState } = $props();

  // Editing works on survey JSON as authored, which may be mid-edit, so fields are read loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Loose = Record<string, any>;

  const found = $derived(view.selected ? doc.find(view.selected) : undefined);
  const el = $derived(found?.element as Loose | undefined);
  const inRepeat = $derived(
    Boolean(found?.panels.some((id) => (doc.find(id)?.element as Loose | undefined)?.repeat)),
  );
  let idDraft = $state("");
  let idError = $state("");
  $effect(() => {
    idDraft = view.selected ?? "";
    idError = "";
  });

  // Display text may be translated (an object per locale): fields show and edit the default locale's text.
  const dl = $derived(((view.survey as Loose).defaultLocale ?? "en") as string);
  const tx = (v: unknown) => textOf(v as string | undefined, dl, dl);
  const isLocalized = (v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");
  /** The new value of a text field: keeps the other locales of a translated text. */
  const textValue = (old: unknown, value: unknown) =>
    typeof value === "string" && isLocalized(old) ? withText(old as Record<string, string>, dl, value, dl) : value;
  const set = (key: string, value: unknown) => {
    if (!el) return;
    const next = textValue(el[key], value);
    doc.updateElement(el.id, { [key]: next === "" ? undefined : next }, { mergeKey: `${el.id}.${key}` });
  };
  const setTitle = (value: string) => el && doc.updateElement(el.id, { title: textValue(el.title, value) }, { mergeKey: `${el.id}.title` });
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  function rename() {
    if (!el || idDraft === el.id) return;
    if (!/^[A-Za-z0-9_-]+$/.test(idDraft)) {
      idError = "Use letters, digits, - or _.";
      return;
    }
    if (!doc.updateElement(el.id, { id: idDraft })) idError = `"${idDraft}" is already used.`;
  }
  const setCondition = (key: "visibleIf" | "requiredIf" | "enableIf" | "resetIf", c: Condition | undefined, typing: boolean) =>
    el && doc.updateElement(el.id, { [key]: c }, typing ? { mergeKey: `${el.id}.${key}` } : {});
  const setPageCondition = (id: string, c: Condition | undefined, typing: boolean) =>
    doc.updatePage(id, { visibleIf: c }, typing ? { mergeKey: `page.${id}.visibleIf` } : {});
  const setSurvey = (key: string, value: string) => {
    const next = textValue((view.survey as Loose)[key], value);
    doc.updateSurvey({ [key]: next === "" && key !== "title" ? undefined : next }, { mergeKey: `survey.${key}` });
  };
  const setPage = (id: string, key: string, value: string) => {
    const page = view.survey.pages.find((p) => p.id === id) as Loose | undefined;
    const next = textValue(page?.[key], value);
    doc.updatePage(id, { [key]: next === "" ? undefined : next }, { mergeKey: `page.${id}.${key}` });
  };
  const setRepeat = (key: string, value: unknown) => {
    if (!el) return;
    const next: Loose = { ...(el.repeat ?? {}) };
    const v = textValue(next[key], value);
    if (v === undefined || v === "") delete next[key];
    else next[key] = v;
    set("repeat", next);
  };
  const editColumn = (i: number, patch: Loose) => {
    if (!el) return;
    const columns = (el.columns as Loose[]).map((c, j) => {
      if (j !== i) return c;
      const out: Loose = { ...c };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || v === false) delete out[k];
        else out[k] = v;
      }
      if (out.cellType === "dropdown" && !out.choices) out.choices = [{ value: "a", label: "Option A" }];
      if (out.cellType !== "dropdown") delete out.choices;
      return out;
    });
    set("columns", columns);
  };
  function addColumn() {
    if (!el) return;
    const cols = el.columns as Loose[];
    set("columns", [...cols, { value: `col${cols.length + 1}`, label: `Column ${cols.length + 1}`, cellType: "text" }]);
  }
  /** Earlier questions whose answer can be piped into this element's title: `{id}`, or `{$item.id}` in the same repeat item. */
  const pipeSources = $derived(el ? conditionSources(view.survey, { element: el.id }) : []);
  function insertAnswer(select: HTMLSelectElement) {
    const source = pipeSources.find((s) => s.id === select.value);
    select.value = "";
    if (!el || !source) return;
    const title = `${el.title ?? ""}${el.title ? " " : ""}{${source.scope ? "$item." : ""}${source.id}}`;
    doc.updateElement(el.id, { title });
  }
  const quiz = $derived(((view.survey as Loose).settings?.quiz ?? null) as Loose | null);
  function setQuiz(next: Loose | undefined) {
    const settings: Loose = { ...((view.survey as Loose).settings ?? {}) };
    if (next === undefined) delete settings.quiz;
    else settings.quiz = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    doc.updateSurvey({ settings: Object.keys(settings).length ? settings : undefined } as Loose, { mergeKey: "survey.quiz" });
  }
  /** The correct answer as typed: one value, or several separated by commas for lists. */
  const answerText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v));
  const listTypes = ["multiple-choice", "tags", "ranking"];
  function setCorrect(text: string) {
    if (!el) return;
    const many = listTypes.includes(el.type) || (el.type === "image-choice" && el.multiple);
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
    const value = text.trim() === "" ? undefined : many ? parts : el.type === "rating" || el.type === "slider" ? Number(text) : el.type === "boolean" ? text.trim() === "true" : text.trim();
    set("correctAnswer", value);
  }
  const setFeedback = (key: "correct" | "wrong", value: string) => {
    if (!el) return;
    const next: Loose = { ...(el.feedback ?? {}), [key]: value === "" ? undefined : value };
    if (next[key] === undefined) delete next[key];
    set("feedback", Object.keys(next).length ? next : undefined);
  };
  function setHiddenFields(text: string) {
    const names = [...new Set(text.split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]+$/.test(s)))];
    doc.updateSurvey({ hiddenFields: names.length ? names : undefined } as Loose);
  }
  // Survey variables: named expressions.
  const variables = $derived(((view.survey as Loose).variables ?? []) as { name: string; expr: string }[]);
  const setVariables = (next: { name: string; expr: string }[], key = "") =>
    doc.updateSurvey({ variables: next.length ? next : undefined } as Loose, key ? { mergeKey: key } : {});
  const editVariable = (i: number, patch: Partial<{ name: string; expr: string }>) =>
    setVariables(variables.map((v, j) => (j === i ? { ...v, ...patch } : v)), `survey.variables.${i}`);
  function addVariable() {
    let n = variables.length + 1;
    while (variables.some((v) => v.name === `var${n}`)) n++;
    setVariables([...variables, { name: `var${n}`, expr: "0" }]);
  }
  const inputTypes = ["text", "email", "number", "date", "url", "tel"];
  const cellTypes = ["text", "number", "dropdown", "boolean"];
</script>

<template lang="braceml">
  .kv-props {
    if !el {
      h3 'Survey'
      label {
        span 'Title'
        input value={tx(view.survey.title)} oninput={(e) => setSurvey("title", e.currentTarget.value)}
      }
      label {
        span 'Description'
        textarea rows=2 value={tx(view.survey.description)} oninput={(e) => setSurvey("description", e.currentTarget.value)}
      }
      h3 'Pages'
      each view.survey.pages as page, pi (page.id) {
        label {
          span '{page.id}'
          input value={tx(page.title)} placeholder="Page title" oninput={(e) => setPage(page.id, "title", e.currentTarget.value)}
        }
        if pi > 0 {
          .kv-props-logic {
            ConditionBuilder(
              survey={view.survey}
              owner={{ page: page.id }}
              condition={page.visibleIf as Condition | undefined}
              prefix="Page shown when"
              addLabel="Show this page only when…"
              onchange={(c, typing) => setPageCondition(page.id, c, typing)}
            )
          }
        }
      }
      h3 'Quiz'
      label.kv-props-check {
        input type=checkbox checked={Boolean(quiz)} onchange={(e) => setQuiz(e.currentTarget.checked ? {} : undefined)}
        span 'Score answers (a quiz or an assessment)'
      }
      if quiz {
        label {
          span 'Pass mark (%)'
          input type=number min=0 max=100 value={quiz.passMark !== undefined ? Math.round(quiz.passMark * 100) : ""} oninput={(e) => setQuiz({ ...quiz, passMark: num(e.currentTarget.value) === undefined ? undefined : num(e.currentTarget.value)! / 100 })}
        }
        label {
          span 'Time limit (s)'
          input type=number min=1 value={quiz.timeLimit ?? ""} oninput={(e) => setQuiz({ ...quiz, timeLimit: num(e.currentTarget.value) })}
        }
        label.kv-props-check {
          input type=checkbox checked={Boolean(quiz.showCorrect)} onchange={(e) => setQuiz({ ...quiz, showCorrect: e.currentTarget.checked || undefined })}
          span 'Show correct answers after submitting'
        }
        label.kv-props-check {
          input type=checkbox checked={quiz.releaseScores === "manual"} onchange={(e) => setQuiz({ ...quiz, releaseScores: e.currentTarget.checked ? "manual" : undefined })}
          span 'Release scores by hand, after review'
        }
      }
      h3 'Hidden fields'
      p.kv-props-hint 'Values your site passes in (a campaign, a user id), usable in conditions and text. Separate them with commas.'
      input.kv-props-hidden(
        aria-label="Hidden fields"
        placeholder="source, userId"
        value={((view.survey as Loose).hiddenFields ?? []).join(", ")}
        onchange={(e) => setHiddenFields(e.currentTarget.value)}
      )
      h3 'Variables'
      p.kv-props-hint 'Named values worked out from answers. Use them in expressions and text as {"{name}"}.'
      each variables as v, vi (vi) {
        .kv-props-variable {
          input aria-label="Variable name" value={v.name} oninput={(e) => editVariable(vi, { name: e.currentTarget.value })}
          input.kv-props-expr aria-label="Variable expression" spellcheck=false value={v.expr} oninput={(e) => editVariable(vi, { expr: e.currentTarget.value })}
          button type=button aria-label="Remove variable {v.name}" onclick={() => setVariables(variables.filter((_, j) => j !== vi))} '×'
          if expressionError(v.expr) {
            p.kv-props-error '{expressionError(v.expr)}'
          }
        }
      }
      button type=button onclick={addVariable} 'Add a variable'
      h3 'Triggers'
      p.kv-props-hint 'Actions that run when a condition becomes true.'
      TriggerList(
        survey={view.survey}
        triggers={((view.survey as Loose).triggers ?? []) as Trigger[]}
        onchange={(next, typing) => doc.updateSurvey({ triggers: next } as Loose, typing ? { mergeKey: "survey.triggers" } : {})}
      )
      p.kv-props-hint 'Select a question or panel in the outline or the preview to edit it.'
    } else {
      h3 '{el.type === "panel" ? (el.repeat ? "Repeating panel" : "Panel") : el.type === "content" ? "Content" : el.type === "image" ? "Image" : `Question · ${el.type}`}'
      label {
        span 'Id'
        input.kv-props-id value={idDraft} oninput={(e) => (idDraft = e.currentTarget.value)} onchange={rename}
      }
      if idError {
        p.kv-props-error '{idError}'
      }
      if el.type === "content" || el.type === "image" {
        if el.type === "content" {
          label {
            span 'Text'
            textarea.kv-props-markdown rows=6 value={tx(el.markdown)} oninput={(e) => set("markdown", e.currentTarget.value)}
          }
          p.kv-props-hint 'Markdown: **bold**, *italic*, [link](https://…), - lists, 1. lists. Answers: {"{questionId}"}.'
        } else {
          label {
            span 'Image URL'
            input value={el.src ?? ""} oninput={(e) => set("src", e.currentTarget.value)}
          }
          label {
            span 'Alt text'
            input value={tx(el.alt)} placeholder="Describe the image" oninput={(e) => doc.updateElement(el.id, { alt: textValue(el.alt, e.currentTarget.value) }, { mergeKey: `${el.id}.alt` })}
          }
          label {
            span 'Width'
            input type=number min=1 value={el.width ?? ""} oninput={(e) => set("width", num(e.currentTarget.value))}
          }
        }
        h4 'Logic'
        ConditionBuilder(
          survey={view.survey}
          owner={{ element: el.id }}
          condition={el.visibleIf}
          prefix="Shown when"
          addLabel="Show only when…"
          onchange={(c, typing) => setCondition("visibleIf", c, typing)}
        )
      } else {
      label {
        span 'Title'
        input value={tx(el.title)} oninput={(e) => (el.type === "panel" ? set("title", e.currentTarget.value) : setTitle(e.currentTarget.value))}
      }
      if pipeSources.length {
        select.kv-props-pipe aria-label="Insert an earlier answer into the title" onchange={(e) => insertAnswer(e.currentTarget)} {
          option value="" 'Insert an answer…'
          each pipeSources as s (s.id) {
            option value={s.id} '{s.label}{s.scope ? " (same item)" : ""}'
          }
        }
      }
      label {
        span 'Description'
        textarea rows=2 value={tx(el.description)} oninput={(e) => set("description", e.currentTarget.value)}
      }
      h4 'Logic'
      ConditionBuilder(
        survey={view.survey}
        owner={{ element: el.id }}
        condition={el.visibleIf}
        prefix="Shown when"
        addLabel="Show only when…"
        onchange={(c, typing) => setCondition("visibleIf", c, typing)}
      )
      if el.type !== "panel" {
        ConditionBuilder(
          survey={view.survey}
          owner={{ element: el.id }}
          condition={el.requiredIf}
          prefix="Required when"
          addLabel="Require only when…"
          onchange={(c, typing) => setCondition("requiredIf", c, typing)}
        )
      }
      if el.type !== "panel" {
        label.kv-props-check {
          input type=checkbox checked={Boolean(el.required)} onchange={(e) => set("required", e.currentTarget.checked || undefined)}
          span 'Required'
        }
      }
      if el.type !== "panel" && el.type !== "computed" {
        label.kv-props-check {
          input type=checkbox checked={Boolean(el.readOnly)} onchange={(e) => set("readOnly", e.currentTarget.checked || undefined)}
          span 'Read-only'
        }
        ConditionBuilder(
          survey={view.survey}
          owner={{ element: el.id }}
          condition={el.enableIf}
          prefix="Editable when"
          addLabel="Editable only when…"
          onchange={(c, typing) => setCondition("enableIf", c, typing)}
        )
        ConditionBuilder(
          survey={view.survey}
          owner={{ element: el.id }}
          condition={el.resetIf}
          prefix="Answer cleared when"
          addLabel="Clear the answer when…"
          onchange={(c, typing) => setCondition("resetIf", c, typing)}
        )
        label {
          span 'Default (expression)'
          input.kv-props-expr spellcheck=false value={el.defaultExpr ?? ""} placeholder={"e.g. {price} * 2"} oninput={(e) => set("defaultExpr", e.currentTarget.value)}
        }
        if el.defaultExpr && expressionError(el.defaultExpr) {
          p.kv-props-error '{expressionError(el.defaultExpr)}'
        }
      }
      if el.type === "computed" {
        label {
          span 'Expression'
          input.kv-props-expr spellcheck=false value={el.expr ?? ""} oninput={(e) => set("expr", e.currentTarget.value)}
        }
        if expressionError(el.expr ?? "") {
          p.kv-props-error '{expressionError(el.expr ?? "")}'
        }
        label {
          span 'Decimals'
          input type=number min=0 max=10 value={el.decimals ?? ""} oninput={(e) => set("decimals", num(e.currentTarget.value))}
        }
        label {
          span 'Prefix'
          input value={tx(el.prefix)} oninput={(e) => set("prefix", e.currentTarget.value)}
        }
        label {
          span 'Suffix'
          input value={tx(el.suffix)} oninput={(e) => set("suffix", e.currentTarget.value)}
        }
      }

      if el.type === "text" {
        label {
          span 'Input type'
          select value={el.inputType ?? "text"} onchange={(e) => set("inputType", e.currentTarget.value === "text" ? undefined : e.currentTarget.value)} {
            each inputTypes as t (t) {
              option value={t} '{t}'
            }
          }
        }
      }
      if el.type === "text" || el.type === "comment" {
        label {
          span 'Placeholder'
          input value={tx(el.placeholder)} oninput={(e) => set("placeholder", e.currentTarget.value)}
        }
      }
      if el.type === "comment" {
        label {
          span 'Rows'
          input type=number min=1 value={el.rows ?? ""} oninput={(e) => set("rows", num(e.currentTarget.value))}
        }
      }
      if el.type === "rating" {
        label {
          span 'Min'
          input type=number value={el.min ?? 1} oninput={(e) => set("min", num(e.currentTarget.value))}
        }
        label {
          span 'Max'
          input type=number value={el.max ?? 5} oninput={(e) => set("max", num(e.currentTarget.value))}
        }
      }
      if el.type === "boolean" {
        label {
          span 'Yes label'
          input value={tx(el.labelTrue)} placeholder="Yes" oninput={(e) => set("labelTrue", e.currentTarget.value)}
        }
        label {
          span 'No label'
          input value={tx(el.labelFalse)} placeholder="No" oninput={(e) => set("labelFalse", e.currentTarget.value)}
        }
      }
      if "choices" in el && el.type !== "grid" {
        h4 'Choices'
        ChoiceList defaultLocale={dl} items={el.choices as Choice[]} min={el.type === "ranking" ? 2 : 1} images={el.type === "image-choice"} onchange={(items) => set("choices", items)}
      }
      if el.type === "dropdown" {
        label.kv-props-check {
          input type=checkbox checked={Boolean(el.searchable)} onchange={(e) => set("searchable", e.currentTarget.checked || undefined)}
          span 'Searchable'
        }
      }
      if el.type === "image-choice" {
        label.kv-props-check {
          input type=checkbox checked={Boolean(el.multiple)} onchange={(e) => set("multiple", e.currentTarget.checked || undefined)}
          span 'Several pictures'
        }
      }
      if el.type === "tags" {
        label.kv-props-check {
          input type=checkbox checked={Boolean(el.allowCustom)} onchange={(e) => set("allowCustom", e.currentTarget.checked || undefined)}
          span 'Allow own entries'
        }
        label {
          span 'Most entries'
          input type=number min=1 value={el.maxTags ?? ""} oninput={(e) => set("maxTags", num(e.currentTarget.value))}
        }
      }
      if el.type === "multi-text" {
        h4 'Fields'
        ChoiceList defaultLocale={dl} items={el.items as Choice[]} noun="field" onchange={(items) => set("items", items)}
      }
      if el.type === "slider" {
        label {
          span 'Min'
          input type=number value={el.min ?? 0} oninput={(e) => set("min", num(e.currentTarget.value))}
        }
        label {
          span 'Max'
          input type=number value={el.max ?? 100} oninput={(e) => set("max", num(e.currentTarget.value))}
        }
        label {
          span 'Step'
          input type=number min=0 value={el.step ?? 1} oninput={(e) => set("step", num(e.currentTarget.value))}
        }
        label {
          span 'Unit'
          input value={tx(el.unit)} placeholder="%" oninput={(e) => set("unit", e.currentTarget.value)}
        }
      }
      if el.type === "matrix" || el.type === "grid" {
        h4 'Rows'
        ChoiceList defaultLocale={dl} items={el.rows as Choice[]} noun="row" onchange={(items) => set("rows", items)}
      }
      if el.type === "matrix" {
        h4 'Columns'
        ChoiceList defaultLocale={dl} items={el.columns as Choice[]} noun="column" onchange={(items) => set("columns", items)}
        label.kv-props-check {
          input type=checkbox checked={Boolean(el.multiple)} onchange={(e) => set("multiple", e.currentTarget.checked || undefined)}
          span 'Several answers per row'
        }
      }
      if el.type === "grid" {
        h4 'Columns'
        each el.columns as col, ci (ci) {
          .kv-props-column {
            label {
              span 'Label'
              input value={col.label} oninput={(e) => editColumn(ci, { label: e.currentTarget.value })}
            }
            label {
              span 'Value'
              input value={col.value} oninput={(e) => editColumn(ci, { value: e.currentTarget.value })}
            }
            label {
              span 'Cell'
              select value={col.cellType} onchange={(e) => editColumn(ci, { cellType: e.currentTarget.value })} {
                each cellTypes as t (t) {
                  option value={t} '{t}'
                }
              }
            }
            label.kv-props-check {
              input type=checkbox checked={Boolean(col.required)} onchange={(e) => editColumn(ci, { required: e.currentTarget.checked })}
              span 'Required in each row'
            }
            if col.cellType === "dropdown" {
              ChoiceList defaultLocale={dl} items={col.choices ?? []} onchange={(items) => editColumn(ci, { choices: items })}
            }
            if col.cellType === "text" || col.cellType === "number" {
              ValidatorList(
                question={gridCellQuestion(el as Question, col as GridColumn)}
                items={(col.validators ?? []) as Validator[]}
                onchange={(items) => editColumn(ci, { validators: items })}
              )
            }
            button(
              type=button
              disabled={el.columns.length <= 1}
              onclick={() => set("columns", (el!.columns as Loose[]).filter((_, j) => j !== ci))}
            ) 'Remove column'
          }
        }
        button type=button onclick={addColumn} 'Add column'
      }
      if el.type === "file" {
        label {
          span 'Accept'
          input(
            value={(el.accept ?? []).join(", ")}
            placeholder="image/*, .pdf"
            oninput={(e) => set("accept", e.currentTarget.value.split(",").map((s) => s.trim()).filter(Boolean))}
          )
        }
        label {
          span 'Max size (bytes)'
          input type=number min=1 value={el.maxSize ?? ""} oninput={(e) => set("maxSize", num(e.currentTarget.value))}
        }
        label {
          span 'Max files'
          input type=number min=1 value={el.maxFiles ?? 1} oninput={(e) => set("maxFiles", num(e.currentTarget.value))}
        }
      }
      if el.type === "panel" {
        label.kv-props-check {
          input(
            type=checkbox
            checked={Boolean(el.repeat)}
            disabled={inRepeat && !el.repeat}
            onchange={(e) => set("repeat", e.currentTarget.checked ? { min: 1 } : undefined)}
          )
          span 'Repeat (respondents add items)'
        }
        if el.repeat {
          label {
            span 'Min items'
            input type=number min=0 value={el.repeat.min ?? ""} oninput={(e) => setRepeat("min", num(e.currentTarget.value))}
          }
          label {
            span 'Max items'
            input type=number min=1 value={el.repeat.max ?? ""} oninput={(e) => setRepeat("max", num(e.currentTarget.value))}
          }
          label {
            span 'Item title'
            input value={tx(el.repeat.itemTitle)} placeholder={"Item {n}"} oninput={(e) => setRepeat("itemTitle", e.currentTarget.value)}
          }
          label {
            span 'Add button'
            input value={tx(el.repeat.addLabel)} placeholder="Add" oninput={(e) => setRepeat("addLabel", e.currentTarget.value)}
          }
        }
      }
      if quiz && el.type !== "panel" && el.type !== "computed" {
        h4 'Quiz'
        label {
          span 'Correct answer'
          input.kv-props-correct placeholder={listTypes.includes(el.type) ? "a, b" : "value"} value={answerText(el.correctAnswer)} onchange={(e) => setCorrect(e.currentTarget.value)}
        }
        label {
          span 'Points'
          input type=number min=0 value={el.points ?? ""} placeholder="1" oninput={(e) => set("points", num(e.currentTarget.value))}
        }
        if listTypes.includes(el.type) || el.type === "matrix" || el.type === "image-choice" {
          label.kv-props-check {
            input type=checkbox checked={Boolean(el.partialCredit)} onchange={(e) => set("partialCredit", e.currentTarget.checked || undefined)}
            span 'Partial credit'
          }
        }
        label {
          span 'If right'
          input value={el.feedback?.correct ?? ""} oninput={(e) => setFeedback("correct", e.currentTarget.value)}
        }
        label {
          span 'If wrong'
          input value={el.feedback?.wrong ?? ""} oninput={(e) => setFeedback("wrong", e.currentTarget.value)}
        }
      }
      if el.type !== "panel" {
        h4 'Rules'
        ValidatorList question={el as Question} items={(el.validators ?? []) as Validator[]} onchange={(items) => set("validators", items)}
      }
      }
    }
  }
</template>

<style>
  .kv-props { display: grid; gap: 0.45rem; align-content: start; }
  .kv-props h3 { font-size: 1rem; margin: 0.25rem 0; }
  .kv-props h4 { font-size: 0.9rem; margin: 0.5rem 0 0; }
  .kv-props label { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.4rem; align-items: center; font-size: 0.9rem; }
  .kv-props label.kv-props-check { grid-template-columns: auto 1fr; }
  .kv-props input:not([type="checkbox"]), .kv-props textarea, .kv-props select { font: inherit; font-size: 0.9rem; padding: 0.25rem 0.4rem; min-width: 0; }
  .kv-props-id { font-family: ui-monospace, monospace; }
  .kv-props-column { border: 1px solid var(--kv-ui-border, #e5e7eb); border-radius: 0.375rem; padding: 0.4rem; display: grid; gap: 0.3rem; }
  .kv-props button { font: inherit; font-size: 0.85rem; cursor: pointer; justify-self: start; }
  .kv-props-logic { padding-left: 6.9rem; }
  .kv-props-hint { color: var(--kv-ui-muted, #6b7280); font-size: 0.85rem; }
  .kv-props-error { color: var(--kv-ui-danger, #b91c1c); font-size: 0.85rem; margin: 0; }
  .kv-props-expr, .kv-props-markdown { font-family: ui-monospace, monospace; }
  .kv-props-variable { display: grid; grid-template-columns: 6rem 1fr auto; gap: 0.25rem; align-items: center; margin-bottom: 0.3rem; }
  .kv-props-variable .kv-props-error { grid-column: 1 / -1; }
</style>
