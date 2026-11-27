<script lang="ts">
  import type { Comparison, Condition, ConditionOperator, ConditionValue, SurveyInput } from "@kvesto/core";
  import {
    addTo,
    choicesOf,
    comparisonFor,
    conditionSources,
    describeCondition,
    groupItems,
    invalidReferences,
    isGroup,
    operatorLabel,
    operatorsFor,
    setAt,
    switchGroup,
    toggleNot,
    valueKind,
    withOperator,
    type ConditionOwner,
    type ConditionPath,
    type ConditionSource,
  } from "../doc/conditions.js";

  let {
    survey,
    owner,
    condition,
    onchange,
    prefix = "Shown when",
    addLabel = "Add a condition",
  }: {
    survey: SurveyInput;
    /** The question, panel or page the condition belongs to: decides which questions it may use. */
    owner: ConditionOwner;
    condition: Condition | undefined;
    /** Called with the new condition (undefined removes it). `typing` is true for keystrokes in a value field. */
    onchange: (condition: Condition | undefined, typing: boolean) => void;
    /** Words before the plain-language summary. */
    prefix?: string;
    addLabel?: string;
  } = $props();

  const sources = $derived(conditionSources(survey, owner));
  const byId = $derived(new Map(sources.map((s) => [s.id, s])));
  const bad = $derived(condition ? invalidReferences(survey, owner, condition) : []);
  const fresh = (): Comparison | null => {
    const s = sources.at(-1);
    return s ? comparisonFor(s) : null;
  };

  const put = (path: ConditionPath, node: Condition | undefined, typing = false) =>
    onchange(setAt(condition, path, node), typing);
  function addRule(path: ConditionPath, at: Condition) {
    const c = fresh();
    if (c) put(path, addTo(at, c));
  }
  function addGroup(path: ConditionPath, at: Condition) {
    const c = fresh();
    if (c) put(path, addTo(at, { any: [c] }));
  }
  function start() {
    const c = fresh();
    if (c) onchange(c, false);
  }

  const sourceOf = (c: Comparison): ConditionSource | undefined => {
    const s = byId.get(c.question);
    return s && (s.scope ?? undefined) === (c.scope ?? undefined) ? s : undefined;
  };
  const pickQuestion = (path: ConditionPath, c: Comparison, id: string) => {
    const s = byId.get(id);
    if (s) put(path, comparisonFor(s, c));
  };
  const setValue = (path: ConditionPath, c: Comparison, value: Comparison["value"], typing = false) =>
    put(path, value === undefined ? (({ value: _drop, ...rest }) => rest)(c) : { ...c, value }, typing);
  const list = (c: Comparison): ConditionValue[] => (Array.isArray(c.value) ? c.value : c.value === undefined ? [] : [c.value]);
  const toggleChoice = (path: ConditionPath, c: Comparison, v: string, on: boolean) => {
    const now = list(c).filter((x) => x !== v);
    setValue(path, c, on ? [...now, v] : now);
  };
  const parseList = (text: string, numbers: boolean): ConditionValue[] =>
    text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (numbers ? Number(s) : s))
      .filter((v) => !(typeof v === "number" && Number.isNaN(v)));
  const quoted = (ids: string[]) => ids.map((id) => `"${id}"`).join(", ");
  const parseNumber = (text: string): number | undefined => (text.trim() === "" || Number.isNaN(Number(text)) ? undefined : Number(text));
</script>

<template lang="braceml">
  snippet valueField(c: Comparison, s: ConditionSource, path: ConditionPath) {
    @const kind = valueKind(s, c.op)
    if kind === "choice" {
      select.kv-cond-value aria-label="Value" value={String(c.value ?? "")} onchange={(e) => setValue(path, c, e.currentTarget.value)} {
        each choicesOf(s) as o (o.value) {
          option value={o.value} '{o.label}'
        }
      }
    } else if kind === "choices" {
      .kv-cond-choices role=group aria-label="Values" {
        each choicesOf(s) as o (o.value) {
          label {
            input(
              type=checkbox
              checked={list(c).includes(o.value)}
              onchange={(e) => toggleChoice(path, c, o.value, e.currentTarget.checked)}
            )
            span '{o.label}'
          }
        }
      }
    } else if kind === "boolean" {
      select.kv-cond-value aria-label="Value" value={c.value === false ? "false" : "true"} onchange={(e) => setValue(path, c, e.currentTarget.value === "true")} {
        option value="true" '{s.question.labelTrue ?? "Yes"}'
        option value="false" '{s.question.labelFalse ?? "No"}'
      }
    } else if kind === "number" {
      input.kv-cond-value(
        type=number
        aria-label="Value"
        value={typeof c.value === "number" ? c.value : ""}
        oninput={(e) => setValue(path, c, parseNumber(e.currentTarget.value) ?? c.value, true)}
      )
    } else if kind === "date" {
      input.kv-cond-value type=date aria-label="Value" value={String(c.value ?? "")} oninput={(e) => setValue(path, c, e.currentTarget.value, true)}
    } else if kind === "text" {
      input.kv-cond-value aria-label="Value" value={String(c.value ?? "")} oninput={(e) => setValue(path, c, e.currentTarget.value, true)}
    } else if kind === "numbers" || kind === "texts" {
      input.kv-cond-value(
        aria-label="Values, separated by commas"
        placeholder="a, b, c"
        value={list(c).join(", ")}
        onchange={(e) => setValue(path, c, parseList(e.currentTarget.value, kind === "numbers"))}
      )
    }
  }

  snippet node(c: Condition, path: ConditionPath) {
    if "not" in c {
      .kv-cond-not {
        .kv-cond-head {
          strong 'Not'
          button type=button title="Remove the not" onclick={() => put(path, c.not)} 'Remove not'
        }
        @render node(c.not, [...path, "not"])
      }
    } else if isGroup(c) {
      .kv-cond-group {
        .kv-cond-head {
          select(
            aria-label="Group type"
            value={"all" in c ? "all" : "any"}
            onchange={(e) => put(path, switchGroup(c, e.currentTarget.value as "all" | "any"))}
          ) {
            option value="all" 'All of these are true'
            option value="any" 'Any of these is true'
          }
          button type=button title="Negate this group" onclick={() => put(path, toggleNot(c))} 'Not'
          button type=button title="Remove this group" aria-label="Remove group" onclick={() => put(path, undefined)} '×'
        }
        each groupItems(c) as child, i (i) {
          @render node(child, [...path, i])
        }
        .kv-cond-actions {
          button type=button onclick={() => addRule(path, c)} 'Add rule'
          button type=button onclick={() => addGroup(path, c)} 'Add group'
        }
      }
    } else {
      @const s = sourceOf(c)
      .kv-cond-rule class:kv-cond-rule--bad={!s} {
        select.kv-cond-question aria-label="Question" value={s ? s.id : ""} onchange={(e) => pickQuestion(path, c, e.currentTarget.value)} {
          if !s {
            option value="" disabled '{c.question} (can’t be used here)'
          }
          each sources as src (src.id) {
            option value={src.id} '{src.label}{src.scope ? " (same item)" : ""}'
          }
        }
        if s && s.type === "matrix" {
          select.kv-cond-row aria-label="Row" value={c.row ?? ""} onchange={(e) => put(path, { ...c, row: e.currentTarget.value })} {
            each s.question.rows ?? [] as r (r.value) {
              option value={r.value} '{r.label}'
            }
          }
        }
        if s {
          select.kv-cond-op(
            aria-label="Operator"
            value={c.op}
            onchange={(e) => put(path, withOperator(s, c, e.currentTarget.value as ConditionOperator))}
          ) {
            each operatorsFor(s) as op (op) {
              option value={op} '{operatorLabel(op)}'
            }
          }
          @render valueField(c, s, path)
        }
        button type=button title="Negate this rule" onclick={() => put(path, toggleNot(c))} 'Not'
        button type=button title="Remove this rule" aria-label="Remove rule" onclick={() => put(path, undefined)} '×'
      }
    }
  }

  .kv-cond {
    if !condition {
      if sources.length {
        button.kv-cond-start type=button onclick={start} '{addLabel}'
      } else {
        p.kv-cond-none 'No earlier questions to base a condition on.'
      }
    } else {
      p.kv-cond-summary {
        strong '{prefix}'
        ' {describeCondition(survey, condition)}'
      }
      if bad.length {
        p.kv-cond-error 'Uses {quoted(bad)}, which isn’t an earlier question here. Pick another question.'
      }
      @render node(condition, [])
      .kv-cond-actions {
        if !isGroup(condition) {
          button type=button disabled={!sources.length} onclick={() => addRule([], condition!)} 'Add rule'
          button type=button disabled={!sources.length} onclick={() => addGroup([], condition!)} 'Add group'
        }
        button.kv-cond-clear type=button onclick={() => onchange(undefined, false)} 'Remove condition'
      }
    }
  }
</template>

<style>
  .kv-cond { display: grid; gap: 0.35rem; font-size: 0.85rem; }
  .kv-cond-summary { margin: 0; color: #374151; }
  .kv-cond-none { margin: 0; color: #9ca3af; font-style: italic; }
  .kv-cond-error { margin: 0; color: #b91c1c; }
  .kv-cond-rule { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
  .kv-cond-rule--bad .kv-cond-question { border-color: #dc2626; }
  .kv-cond-group, .kv-cond-not { border-left: 3px solid #bfdbfe; padding: 0.2rem 0 0.2rem 0.5rem; display: grid; gap: 0.3rem; }
  .kv-cond-not { border-left-color: #fca5a5; }
  .kv-cond-head, .kv-cond-actions { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
  .kv-cond-choices { display: flex; flex-wrap: wrap; gap: 0.15rem 0.6rem; }
  .kv-cond-choices label { display: flex; gap: 0.25rem; align-items: center; }
  .kv-cond select, .kv-cond input:not([type="checkbox"]), .kv-cond button { font: inherit; font-size: 0.85rem; }
  .kv-cond select, .kv-cond input:not([type="checkbox"]) { padding: 0.15rem 0.3rem; min-width: 0; max-width: 100%; }
  .kv-cond button { cursor: pointer; }
  .kv-cond-start, .kv-cond-clear { justify-self: start; }
</style>
