<script lang="ts">
  import { gridCellQuestion, type Choice, type GridColumn, type Question, type Validator } from "@kvesto/core";
  import type { DocumentState, SurveyDocument } from "../doc/document.js";
  import type { Condition } from "@kvesto/core";
  import ChoiceList from "./ChoiceList.svelte";
  import ConditionBuilder from "./ConditionBuilder.svelte";
  import ValidatorList from "./ValidatorList.svelte";
  import { conditionSources } from "../doc/conditions.js";

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

  const set = (key: string, value: unknown) => {
    if (!el) return;
    doc.updateElement(el.id, { [key]: value === "" ? undefined : value }, { mergeKey: `${el.id}.${key}` });
  };
  const setTitle = (value: string) => el && doc.updateElement(el.id, { title: value }, { mergeKey: `${el.id}.title` });
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  function rename() {
    if (!el || idDraft === el.id) return;
    if (!/^[A-Za-z0-9_-]+$/.test(idDraft)) {
      idError = "Use letters, digits, - or _.";
      return;
    }
    if (!doc.updateElement(el.id, { id: idDraft })) idError = `"${idDraft}" is already used.`;
  }
  const setCondition = (key: "visibleIf" | "requiredIf", c: Condition | undefined, typing: boolean) =>
    el && doc.updateElement(el.id, { [key]: c }, typing ? { mergeKey: `${el.id}.${key}` } : {});
  const setPageCondition = (id: string, c: Condition | undefined, typing: boolean) =>
    doc.updatePage(id, { visibleIf: c }, typing ? { mergeKey: `page.${id}.visibleIf` } : {});
  const setSurvey = (key: string, value: string) =>
    doc.updateSurvey({ [key]: value === "" && key !== "title" ? undefined : value }, { mergeKey: `survey.${key}` });
  const setPage = (id: string, key: string, value: string) =>
    doc.updatePage(id, { [key]: value === "" ? undefined : value }, { mergeKey: `page.${id}.${key}` });
  const setRepeat = (key: string, value: unknown) => {
    if (!el) return;
    const next: Loose = { ...(el.repeat ?? {}) };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
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
  const inputTypes = ["text", "email", "number", "date", "url", "tel"];
  const cellTypes = ["text", "number", "dropdown", "boolean"];
</script>

<template lang="braceml">
  .kv-props {
    if !el {
      h3 'Survey'
      label {
        span 'Title'
        input value={view.survey.title} oninput={(e) => setSurvey("title", e.currentTarget.value)}
      }
      label {
        span 'Description'
        textarea rows=2 value={view.survey.description ?? ""} oninput={(e) => setSurvey("description", e.currentTarget.value)}
      }
      h3 'Pages'
      each view.survey.pages as page, pi (page.id) {
        label {
          span '{page.id}'
          input value={page.title ?? ""} placeholder="Page title" oninput={(e) => setPage(page.id, "title", e.currentTarget.value)}
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
      p.kv-props-hint 'Select a question or panel in the outline or the preview to edit it.'
    } else {
      h3 '{el.type === "panel" ? (el.repeat ? "Repeating panel" : "Panel") : `Question · ${el.type}`}'
      label {
        span 'Id'
        input.kv-props-id value={idDraft} oninput={(e) => (idDraft = e.currentTarget.value)} onchange={rename}
      }
      if idError {
        p.kv-props-error '{idError}'
      }
      label {
        span 'Title'
        input value={el.title ?? ""} oninput={(e) => (el.type === "panel" ? set("title", e.currentTarget.value) : setTitle(e.currentTarget.value))}
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
        textarea rows=2 value={el.description ?? ""} oninput={(e) => set("description", e.currentTarget.value)}
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
          input value={el.placeholder ?? ""} oninput={(e) => set("placeholder", e.currentTarget.value)}
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
          input value={el.labelTrue ?? ""} placeholder="Yes" oninput={(e) => set("labelTrue", e.currentTarget.value)}
        }
        label {
          span 'No label'
          input value={el.labelFalse ?? ""} placeholder="No" oninput={(e) => set("labelFalse", e.currentTarget.value)}
        }
      }
      if "choices" in el && el.type !== "grid" {
        h4 'Choices'
        ChoiceList items={el.choices as Choice[]} min={el.type === "ranking" ? 2 : 1} onchange={(items) => set("choices", items)}
      }
      if el.type === "matrix" || el.type === "grid" {
        h4 'Rows'
        ChoiceList items={el.rows as Choice[]} noun="row" onchange={(items) => set("rows", items)}
      }
      if el.type === "matrix" {
        h4 'Columns'
        ChoiceList items={el.columns as Choice[]} noun="column" onchange={(items) => set("columns", items)}
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
              ChoiceList items={col.choices ?? []} onchange={(items) => editColumn(ci, { choices: items })}
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
            input value={el.repeat.itemTitle ?? ""} placeholder={"Item {n}"} oninput={(e) => setRepeat("itemTitle", e.currentTarget.value)}
          }
          label {
            span 'Add button'
            input value={el.repeat.addLabel ?? ""} placeholder="Add" oninput={(e) => setRepeat("addLabel", e.currentTarget.value)}
          }
        }
      }
      if el.type !== "panel" {
        h4 'Rules'
        ValidatorList question={el as Question} items={(el.validators ?? []) as Validator[]} onchange={(items) => set("validators", items)}
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
  .kv-props-column { border: 1px solid #e5e7eb; border-radius: 0.375rem; padding: 0.4rem; display: grid; gap: 0.3rem; }
  .kv-props button { font: inherit; font-size: 0.85rem; cursor: pointer; justify-self: start; }
  .kv-props-logic { padding-left: 6.9rem; }
  .kv-props-hint { color: #6b7280; font-size: 0.85rem; }
  .kv-props-error { color: #b91c1c; font-size: 0.85rem; margin: 0; }
</style>
