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

  // Tailwind classes used more than once (prefixed `kv:`; see editor.css).
  const labelClass = "kv:grid kv:grid-cols-[6.5rem_1fr] kv:gap-[0.3rem] kv:items-center kv:text-[0.85rem]";
  const fieldClass = "kv:font-inherit kv:text-[0.85rem] kv:py-[0.2rem] kv:px-[0.35rem] kv:min-w-0";
  const controlClass = "kv:font-inherit kv:text-[0.85rem] kv:cursor-pointer";
</script>

<template lang="braceml">
  .kv-validators class="kv:grid kv:gap-[0.4rem]" {
    each items as v, i (i) {
      .kv-validator class="kv:border kv:border-ui-border kv:rounded-md kv:p-[0.4rem] kv:grid kv:gap-[0.3rem]" {
        .kv-validator-head class="kv:flex kv:justify-between kv:items-center" {
          strong '{v.type}'
          button class={controlClass} type=button aria-label="Remove {v.type} rule" onclick={() => set(items.filter((_, j) => j !== i))} '×'
        }
        if v.type === "pattern" {
          label class={labelClass} {
            span 'Pattern'
            input class={fieldClass} value={v.pattern} oninput={(e) => edit(i, { pattern: e.currentTarget.value })}
          }
          label class={labelClass} {
            span 'Flags'
            input class={fieldClass} value={v.flags ?? ""} placeholder="i, m, s, u" oninput={(e) => edit(i, { flags: e.currentTarget.value })}
          }
        } else if v.type === "length" || v.type === "count" || v.type === "range" {
          label class={labelClass} {
            span 'Min'
            input(
              class={fieldClass}
              type={v.type === "range" && dates ? "date" : "number"}
              value={v.min ?? ""}
              oninput={(e) => edit(i, { min: v.type === "range" ? bound(e.currentTarget.value) : num(e.currentTarget.value) })}
            )
          }
          label class={labelClass} {
            span 'Max'
            input(
              class={fieldClass}
              type={v.type === "range" && dates ? "date" : "number"}
              value={v.max ?? ""}
              oninput={(e) => edit(i, { max: v.type === "range" ? bound(e.currentTarget.value) : num(e.currentTarget.value) })}
            )
          }
        } else if v.type === "expression" {
          label class={labelClass} {
            span 'Expression'
            input.kv-validator-expr class={`${fieldClass} kv:[font-family:ui-monospace,monospace]!`} spellcheck=false value={v.expr} oninput={(e) => edit(i, { expr: e.currentTarget.value })}
          }
          if expressionError(v.expr) {
            p.kv-validator-error class="kv:m-0 kv:text-ui-danger kv:text-[0.8rem]" role=alert '{expressionError(v.expr)}'
          }
        } else if v.type === "custom" {
          label class={labelClass} {
            span 'Function name'
            input class={fieldClass} value={v.name} oninput={(e) => edit(i, { name: e.currentTarget.value })}
          }
        }
        label class={labelClass} {
          span 'Message'
          input class={fieldClass} value={v.message ?? ""} placeholder="Default message" oninput={(e) => edit(i, { message: e.currentTarget.value })}
        }
      }
    }
    if available.length {
      .kv-validator-add class="kv:flex kv:gap-[0.3rem]" {
        select class={controlClass} value={adding} onchange={(e) => (adding = e.currentTarget.value as ValidatorType | "")} aria-label="Rule to add" {
          option value="" 'Add a rule…'
          each available as t (t) {
            option value={t} '{t}'
          }
        }
        button class={controlClass} type=button disabled={!adding} onclick={add} 'Add'
      }
    }
  }
</template>
