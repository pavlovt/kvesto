<script lang="ts">
  import { validatorProblem, type Question, type Validator, type ValidatorType } from "@kvesto/core";
  import { expressionError } from "../doc/conditions.js";

  let {
    question,
    items,
    onchange,
  }: {
    /** The question (or grid cell as a question) the rules apply to. */
    question: Question;
    items: Validator[];
    onchange: (items: Validator[] | undefined) => void;
  } = $props();

  const starters: Record<ValidatorType, Validator> = {
    pattern: { type: "pattern", pattern: ".+" },
    length: { type: "length", max: 100 },
    range: { type: "range" },
    count: { type: "count", min: 1 },
    email: { type: "email" },
    url: { type: "url" },
    expression: { type: "expression", expr: "length({self}) > 1" },
    custom: { type: "custom", name: "myRule" },
  };
  const available = $derived(
    (Object.keys(starters) as ValidatorType[]).filter((t) => validatorProblem(question, starters[t]) === null),
  );
  const dates = $derived(question.type === "text" && question.inputType === "date");
  let adding = $state<ValidatorType | "">("");

  const set = (next: Validator[]) => onchange(next.length ? next : undefined);
  const edit = (i: number, patch: Record<string, unknown>) =>
    set(
      items.map((v, j) => {
        if (j !== i) return v;
        const out: Record<string, unknown> = { ...v };
        for (const [k, val] of Object.entries(patch)) {
          if (val === undefined || val === "") delete out[k];
          else out[k] = val;
        }
        return out as Validator;
      }),
    );
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const bound = (s: string) => (dates ? s || undefined : num(s));
  function add() {
    if (!adding) return;
    const starter = structuredClone(starters[adding]);
    // An expression rule starts out about the question it belongs to.
    if (starter.type === "expression") starter.expr = `{${question.id}} != null`;
    set([...items, starter]);
    adding = "";
  }
</script>

<template lang="braceml">
  .kv-validators {
    each items as v, i (i) {
      .kv-validator {
        .kv-validator-head {
          strong '{v.type}'
          button type=button aria-label="Remove {v.type} rule" onclick={() => set(items.filter((_, j) => j !== i))} '×'
        }
        if v.type === "pattern" {
          label {
            span 'Pattern'
            input value={v.pattern} oninput={(e) => edit(i, { pattern: e.currentTarget.value })}
          }
          label {
            span 'Flags'
            input value={v.flags ?? ""} placeholder="i, m, s, u" oninput={(e) => edit(i, { flags: e.currentTarget.value })}
          }
        } else if v.type === "length" || v.type === "count" || v.type === "range" {
          label {
            span 'Min'
            input(
              type={v.type === "range" && dates ? "date" : "number"}
              value={v.min ?? ""}
              oninput={(e) => edit(i, { min: v.type === "range" ? bound(e.currentTarget.value) : num(e.currentTarget.value) })}
            )
          }
          label {
            span 'Max'
            input(
              type={v.type === "range" && dates ? "date" : "number"}
              value={v.max ?? ""}
              oninput={(e) => edit(i, { max: v.type === "range" ? bound(e.currentTarget.value) : num(e.currentTarget.value) })}
            )
          }
        } else if v.type === "expression" {
          label {
            span 'Expression'
            input.kv-validator-expr spellcheck=false value={v.expr} oninput={(e) => edit(i, { expr: e.currentTarget.value })}
          }
          if expressionError(v.expr) {
            p.kv-validator-error role=alert '{expressionError(v.expr)}'
          }
        } else if v.type === "custom" {
          label {
            span 'Function name'
            input value={v.name} oninput={(e) => edit(i, { name: e.currentTarget.value })}
          }
        }
        label {
          span 'Message'
          input value={v.message ?? ""} placeholder="Default message" oninput={(e) => edit(i, { message: e.currentTarget.value })}
        }
      }
    }
    if available.length {
      .kv-validator-add {
        select value={adding} onchange={(e) => (adding = e.currentTarget.value as ValidatorType | "")} aria-label="Rule to add" {
          option value="" 'Add a rule…'
          each available as t (t) {
            option value={t} '{t}'
          }
        }
        button type=button disabled={!adding} onclick={add} 'Add'
      }
    }
  }
</template>

<style>
  .kv-validators { display: grid; gap: 0.4rem; }
  .kv-validator { border: 1px solid var(--kv-ui-border, #e5e7eb); border-radius: 0.375rem; padding: 0.4rem; display: grid; gap: 0.3rem; }
  .kv-validator-head { display: flex; justify-content: space-between; align-items: center; }
  .kv-validator label { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.3rem; align-items: center; font-size: 0.85rem; }
  .kv-validator input { font: inherit; font-size: 0.85rem; padding: 0.2rem 0.35rem; min-width: 0; }
  .kv-validator-add { display: flex; gap: 0.3rem; }
  .kv-validator-expr { font-family: ui-monospace, monospace !important; }
  .kv-validator-error { margin: 0; color: var(--kv-ui-danger, #b91c1c); font-size: 0.8rem; }
  .kv-validators button, .kv-validators select { font: inherit; font-size: 0.85rem; cursor: pointer; }
</style>
