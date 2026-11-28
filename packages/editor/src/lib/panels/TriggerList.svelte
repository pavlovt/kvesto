<script lang="ts">
  import type { Condition, SurveyInput, Trigger, TriggerAction } from "@kvesto/core";

  type SetValue = Extract<TriggerAction, { type: "setValue" }>["value"];
  import { conditionSources } from "../doc/conditions.js";
  import ConditionBuilder from "./ConditionBuilder.svelte";

  let {
    survey,
    triggers,
    onchange,
  }: {
    survey: SurveyInput;
    triggers: Trigger[];
    /** Called with the new list (undefined when empty). `typing` is true for keystrokes. */
    onchange: (triggers: Trigger[] | undefined, typing: boolean) => void;
  } = $props();

  // Every question outside repeats may be used or set; computed ones can't be set.
  const sources = $derived(conditionSources(survey, { survey: true }));
  const settable = $derived(sources.filter((s) => s.type !== "computed"));
  const pages = $derived(survey.pages.map((p) => p.id));

  const kinds: { type: TriggerAction["type"]; label: string }[] = [
    { type: "setValue", label: "Set an answer" },
    { type: "copyValue", label: "Copy an answer" },
    { type: "skipToPage", label: "Go to a page" },
    { type: "complete", label: "Submit the survey" },
  ];

  // Plain copies: the survey comes in as reactive state, which the document can't clone.
  const set = (next: Trigger[], typing = false) => onchange(next.length ? $state.snapshot(next) : undefined, typing);
  const edit = (i: number, patch: Partial<Trigger>, typing = false) =>
    set(triggers.map((t, j) => (j === i ? { ...t, ...patch } : t)), typing);

  function actionOf(type: TriggerAction["type"]): TriggerAction {
    const first = settable[0]?.id ?? "";
    switch (type) {
      case "setValue":
        return { type, question: first, value: "" };
      case "copyValue":
        return { type, from: sources[0]?.id ?? "", to: settable.at(-1)?.id ?? first };
      case "skipToPage":
        return { type, page: pages.at(-1) ?? "" };
      case "complete":
        return { type };
    }
  }

  function add() {
    const s = sources.at(-1);
    if (!s) return;
    set([...triggers, { when: { question: s.id, op: "notEmpty" }, action: actionOf("setValue") }]);
  }

  /** The value text typed in for a "set an answer" action, as the answer the target question takes. */
  function parseValue(questionId: string, text: string): SetValue {
    const type = sources.find((s) => s.id === questionId)?.type;
    if (type === "boolean") return text.trim().toLowerCase() === "true";
    if (type === "rating") return Number(text);
    if (type === "multiple-choice" || type === "ranking") {
      return text
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return text;
  }
  const valueText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v));

  // Tailwind classes used more than once (prefixed `kv:`; see editor.css).
  const controlClass = "kv:font-inherit kv:text-[0.85rem] kv:min-w-0";
</script>

<template lang="braceml">
  .kv-triggers class="kv:grid kv:gap-2" {
    each triggers as t, i (i) {
      .kv-trigger class="kv:border kv:border-ui-border kv:rounded-md kv:p-[0.4rem] kv:grid kv:gap-[0.35rem]" {
        ConditionBuilder(
          survey={survey}
          owner={{ survey: true }}
          condition={t.when}
          prefix="When"
          addLabel="Set a condition"
          onchange={(c, typing) => c && edit(i, { when: c as Condition }, typing)}
        )
        .kv-trigger-action class="kv:flex kv:flex-wrap kv:gap-1 kv:items-center kv:text-[0.85rem]" {
          select(
            class={controlClass}
            aria-label="Action"
            value={t.action.type}
            onchange={(e) => edit(i, { action: actionOf(e.currentTarget.value as TriggerAction["type"]) })}
          ) {
            each kinds as k (k.type) {
              option value={k.type} '{k.label}'
            }
          }
          if t.action.type === "setValue" {
            @const a = t.action
            select class={controlClass} aria-label="Question to set" value={a.question} onchange={(e) => edit(i, { action: { ...a, question: e.currentTarget.value } })} {
              each settable as s (s.id) {
                option value={s.id} '{s.label}'
              }
            }
            input(
              class={controlClass}
              aria-label="Value"
              placeholder="Value"
              value={valueText(a.value)}
              oninput={(e) => edit(i, { action: { ...a, value: parseValue(a.question, e.currentTarget.value) } }, true)}
            )
          } else if t.action.type === "copyValue" {
            @const a = t.action
            select class={controlClass} aria-label="Copy from" value={a.from} onchange={(e) => edit(i, { action: { ...a, from: e.currentTarget.value } })} {
              each sources as s (s.id) {
                option value={s.id} '{s.label}'
              }
            }
            span 'to'
            select class={controlClass} aria-label="Copy to" value={a.to} onchange={(e) => edit(i, { action: { ...a, to: e.currentTarget.value } })} {
              each settable as s (s.id) {
                option value={s.id} '{s.label}'
              }
            }
          } else if t.action.type === "skipToPage" {
            @const a = t.action
            select class={controlClass} aria-label="Page" value={a.page} onchange={(e) => edit(i, { action: { ...a, page: e.currentTarget.value } })} {
              each pages as p (p) {
                option value={p} '{p}'
              }
            }
          }
          button class={controlClass} type=button aria-label="Remove trigger {i + 1}" onclick={() => set(triggers.filter((_, j) => j !== i))} '×'
        }
      }
    }
    if sources.length {
      button class="{controlClass} kv:[justify-self:start]" type=button onclick={add} 'Add a trigger'
    } else {
      p.kv-trigger-none class="kv:m-0 kv:text-ui-subtle kv:italic kv:text-[0.85rem]" 'Add a question first: triggers run when answers change.'
    }
  }
</template>
