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
  /** Set (or with undefined, remove) one of the survey's settings. */
  function setSetting(key: string, value: unknown) {
    // A snapshot: nested settings (antiSpam, quiz) are state proxies, which the document can't clone.
    const settings: Loose = { ...$state.snapshot((view.survey as Loose).settings ?? {}) };
    if (value === undefined) delete settings[key];
    else settings[key] = value;
    doc.updateSurvey({ settings: Object.keys(settings).length ? settings : undefined } as Loose, { mergeKey: `survey.settings.${key}` });
  }
  const surveySettings = $derived(((view.survey as Loose).settings ?? {}) as Loose);
  /** Set (or with undefined, remove) one anti-spam setting; no settings left removes `antiSpam`. */
  function setAntiSpam(key: string, value: unknown) {
    const next: Loose = { ...(surveySettings.antiSpam ?? {}) };
    if (value === undefined) delete next[key];
    else next[key] = value;
    setSetting("antiSpam", Object.keys(next).length ? next : undefined);
  }
  const antiSpam = $derived((surveySettings.antiSpam ?? {}) as Loose);
  /** Names separated by commas, as a list (or undefined when empty). */
  const nameList = (text: string) => {
    const names = [...new Set(text.split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]+$/.test(s)))];
    return names.length ? names : undefined;
  };
  /** An ISO time as a datetime-local value, in this computer's time zone. */
  function localTime(iso: string | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }
  const isoTime = (local: string) => (local ? new Date(local).toISOString() : undefined);
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
    doc.updateSurvey({ hiddenFields: nameList(text) } as Loose);
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

  // Tailwind classes for the panel's own elements (prefixed `kv:`; see editor.css).
  const labelClass = "kv:grid kv:grid-cols-[6.5rem_1fr] kv:gap-[0.4rem] kv:items-center kv:text-[0.9rem]";
  const checkClass = "kv:grid kv:grid-cols-[auto_1fr] kv:gap-[0.4rem] kv:items-center kv:text-[0.9rem]";
  const fieldClass = "kv:font-inherit kv:text-[0.9rem] kv:py-1 kv:px-[0.4rem] kv:min-w-0";
  const buttonClass = "kv:font-inherit kv:text-[0.85rem] kv:cursor-pointer kv:[justify-self:start]";
  const h3Class = "kv:text-[1rem] kv:[margin:0.25rem_0]";
  const h4Class = "kv:text-[0.9rem] kv:[margin:0.5rem_0_0]";
  const hintClass = "kv:text-ui-muted kv:text-[0.85rem]";
  const errorClass = "kv:text-ui-danger kv:text-[0.85rem] kv:m-0";
</script>

<template lang="braceml">
  .kv-props class="kv:grid kv:gap-[0.45rem] kv:[align-content:start]" {
    if !el {
      h3 class={h3Class} 'Survey'
      label class={labelClass} {
        span 'Title'
        input class={fieldClass} value={tx(view.survey.title)} oninput={(e) => setSurvey("title", e.currentTarget.value)}
      }
      label class={labelClass} {
        span 'Description'
        textarea class={fieldClass} rows=2 value={tx(view.survey.description)} oninput={(e) => setSurvey("description", e.currentTarget.value)}
      }
      h3 class={h3Class} 'Pages'
      each view.survey.pages as page, pi (page.id) {
        label class={labelClass} {
          span '{page.id}'
          input class={fieldClass} value={tx(page.title)} placeholder="Page title" oninput={(e) => setPage(page.id, "title", e.currentTarget.value)}
        }
        if pi > 0 {
          .kv-props-logic class="kv:pl-[6.9rem]" {
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
      h3 class={h3Class} 'Quiz'
      label.kv-props-check class={checkClass} {
        input type=checkbox checked={Boolean(quiz)} onchange={(e) => setQuiz(e.currentTarget.checked ? {} : undefined)}
        span 'Score answers (a quiz or an assessment)'
      }
      if quiz {
        label class={labelClass} {
          span 'Pass mark (%)'
          input class={fieldClass} type=number min=0 max=100 value={quiz.passMark !== undefined ? Math.round(quiz.passMark * 100) : ""} oninput={(e) => setQuiz({ ...quiz, passMark: num(e.currentTarget.value) === undefined ? undefined : num(e.currentTarget.value)! / 100 })}
        }
        label class={labelClass} {
          span 'Time limit (s)'
          input class={fieldClass} type=number min=1 value={quiz.timeLimit ?? ""} oninput={(e) => setQuiz({ ...quiz, timeLimit: num(e.currentTarget.value) })}
        }
        label.kv-props-check class={checkClass} {
          input type=checkbox checked={Boolean(quiz.showCorrect)} onchange={(e) => setQuiz({ ...quiz, showCorrect: e.currentTarget.checked || undefined })}
          span 'Show correct answers after submitting'
        }
        label.kv-props-check class={checkClass} {
          input type=checkbox checked={quiz.releaseScores === "manual"} onchange={(e) => setQuiz({ ...quiz, releaseScores: e.currentTarget.checked ? "manual" : undefined })}
          span 'Release scores by hand, after review'
        }
      }
      h3 class={h3Class} 'Availability'
      label class={labelClass} {
        span 'Opens at'
        input class={fieldClass} type=datetime-local value={localTime(surveySettings.opensAt)} onchange={(e) => setSetting("opensAt", isoTime(e.currentTarget.value))}
      }
      label class={labelClass} {
        span 'Closes at'
        input class={fieldClass} type=datetime-local value={localTime(surveySettings.closesAt)} onchange={(e) => setSetting("closesAt", isoTime(e.currentTarget.value))}
      }
      label class={labelClass} {
        span 'Maximum responses'
        input class={fieldClass} type=number min=1 value={surveySettings.maxResponses ?? ""} oninput={(e) => setSetting("maxResponses", num(e.currentTarget.value))}
      }
      label class={labelClass} {
        span 'One response per'
        select class={fieldClass} value={surveySettings.oneResponsePer ?? ""} onchange={(e) => setSetting("oneResponsePer", e.currentTarget.value || undefined)} {
          option value="" 'No limit'
          option value=browser 'Browser'
          option value=respondent 'Signed-in respondent'
        }
      }
      label.kv-props-check class={checkClass} {
        input type=checkbox checked={Boolean(surveySettings.requireRespondent)} onchange={(e) => setSetting("requireRespondent", e.currentTarget.checked || undefined)}
        span 'Only signed-in respondents'
      }
      label.kv-props-check class={checkClass} {
        input type=checkbox checked={Boolean(surveySettings.anonymous)} onchange={(e) => setSetting("anonymous", e.currentTarget.checked || undefined)}
        span 'Anonymous: keep no respondent id'
      }
      if surveySettings.anonymous {
        label class={labelClass} {
          span 'Hidden fields kept when anonymous'
          input(
            class={fieldClass}
            placeholder="source, campaign"
            value={(surveySettings.anonymousHidden ?? []).join(", ")}
            onchange={(e) => setSetting("anonymousHidden", nameList(e.currentTarget.value))}
          )
        }
      }
      label class={labelClass} {
        span 'Closed message'
        textarea class={fieldClass} rows=2 value={tx(surveySettings.closedMessage)} placeholder="This survey is closed." oninput={(e) => setSetting("closedMessage", e.currentTarget.value ? textValue(surveySettings.closedMessage, e.currentTarget.value) : undefined)}
      }
      h3 class={h3Class} 'Privacy and spam'
      label class={labelClass} {
        span 'Delete responses after (days)'
        input class={fieldClass} type=number min=1 max=36500 value={surveySettings.retentionDays ?? ""} oninput={(e) => setSetting("retentionDays", num(e.currentTarget.value))}
      }
      label.kv-props-check class={checkClass} {
        input type=checkbox checked={Boolean(antiSpam.honeypot)} onchange={(e) => setAntiSpam("honeypot", e.currentTarget.checked || undefined)}
        span 'Honeypot: refuse responses that fill in a hidden field'
      }
      label.kv-props-check class={checkClass} {
        input type=checkbox checked={Boolean(antiSpam.challenge)} onchange={(e) => setAntiSpam("challenge", e.currentTarget.checked || undefined)}
        span 'Require a CAPTCHA (checked by the server)'
      }
      label class={labelClass} {
        span 'Minimum seconds to answer'
        input class={fieldClass} type=number min=1 max=3600 value={antiSpam.minSeconds ?? ""} oninput={(e) => setAntiSpam("minSeconds", num(e.currentTarget.value))}
      }
      label class={labelClass} {
        span 'Refuse duplicate answers within (seconds)'
        input class={fieldClass} type=number min=1 max=86400 value={antiSpam.duplicateWindow ?? ""} oninput={(e) => setAntiSpam("duplicateWindow", num(e.currentTarget.value))}
      }
      h3 class={h3Class} 'Hidden fields'
      p.kv-props-hint class={hintClass} 'Values your site passes in (a campaign, a user id), usable in conditions and text. Separate them with commas.'
      input.kv-props-hidden(
        class={fieldClass}
        aria-label="Hidden fields"
        placeholder="source, userId"
        value={((view.survey as Loose).hiddenFields ?? []).join(", ")}
        onchange={(e) => setHiddenFields(e.currentTarget.value)}
      )
      h3 class={h3Class} 'Variables'
      p.kv-props-hint class={hintClass} 'Named values worked out from answers. Use them in expressions and text as {"{name}"}.'
      each variables as v, vi (vi) {
        .kv-props-variable class="kv:grid kv:grid-cols-[6rem_1fr_auto] kv:gap-1 kv:items-center kv:mb-[0.3rem]" {
          input class={fieldClass} aria-label="Variable name" value={v.name} oninput={(e) => editVariable(vi, { name: e.currentTarget.value })}
          input.kv-props-expr class={fieldClass} aria-label="Variable expression" spellcheck=false value={v.expr} oninput={(e) => editVariable(vi, { expr: e.currentTarget.value })}
          button class={buttonClass} type=button aria-label="Remove variable {v.name}" onclick={() => setVariables(variables.filter((_, j) => j !== vi))} '×'
          if expressionError(v.expr) {
            p.kv-props-error class="{errorClass} kv:col-span-full" '{expressionError(v.expr)}'
          }
        }
      }
      button class={buttonClass} type=button onclick={addVariable} 'Add a variable'
      h3 class={h3Class} 'Triggers'
      p.kv-props-hint class={hintClass} 'Actions that run when a condition becomes true.'
      TriggerList(
        survey={view.survey}
        triggers={((view.survey as Loose).triggers ?? []) as Trigger[]}
        onchange={(next, typing) => doc.updateSurvey({ triggers: next } as Loose, typing ? { mergeKey: "survey.triggers" } : {})}
      )
      p.kv-props-hint class={hintClass} 'Select a question or panel in the outline or the preview to edit it.'
    } else {
      h3 class={h3Class} '{el.type === "panel" ? (el.repeat ? "Repeating panel" : "Panel") : el.type === "content" ? "Content" : el.type === "image" ? "Image" : `Question · ${el.type}`}'
      label class={labelClass} {
        span 'Id'
        input.kv-props-id class={fieldClass} value={idDraft} oninput={(e) => (idDraft = e.currentTarget.value)} onchange={rename}
      }
      if idError {
        p.kv-props-error class={errorClass} '{idError}'
      }
      if el.type === "content" || el.type === "image" {
        if el.type === "content" {
          label class={labelClass} {
            span 'Text'
            textarea.kv-props-markdown class={fieldClass} rows=6 value={tx(el.markdown)} oninput={(e) => set("markdown", e.currentTarget.value)}
          }
          p.kv-props-hint class={hintClass} 'Markdown: **bold**, *italic*, [link](https://…), - lists, 1. lists. Answers: {"{questionId}"}.'
        } else {
          label class={labelClass} {
            span 'Image URL'
            input class={fieldClass} value={el.src ?? ""} oninput={(e) => set("src", e.currentTarget.value)}
          }
          label class={labelClass} {
            span 'Alt text'
            input class={fieldClass} value={tx(el.alt)} placeholder="Describe the image" oninput={(e) => doc.updateElement(el.id, { alt: textValue(el.alt, e.currentTarget.value) }, { mergeKey: `${el.id}.alt` })}
          }
          label class={labelClass} {
            span 'Width'
            input class={fieldClass} type=number min=1 value={el.width ?? ""} oninput={(e) => set("width", num(e.currentTarget.value))}
          }
        }
        h4 class={h4Class} 'Logic'
        ConditionBuilder(
          survey={view.survey}
          owner={{ element: el.id }}
          condition={el.visibleIf}
          prefix="Shown when"
          addLabel="Show only when…"
          onchange={(c, typing) => setCondition("visibleIf", c, typing)}
        )
      } else {
      label class={labelClass} {
        span 'Title'
        input class={fieldClass} value={tx(el.title)} oninput={(e) => (el.type === "panel" ? set("title", e.currentTarget.value) : setTitle(e.currentTarget.value))}
      }
      if pipeSources.length {
        select.kv-props-pipe class={fieldClass} aria-label="Insert an earlier answer into the title" onchange={(e) => insertAnswer(e.currentTarget)} {
          option value="" 'Insert an answer…'
          each pipeSources as s (s.id) {
            option value={s.id} '{s.label}{s.scope ? " (same item)" : ""}'
          }
        }
      }
      label class={labelClass} {
        span 'Description'
        textarea class={fieldClass} rows=2 value={tx(el.description)} oninput={(e) => set("description", e.currentTarget.value)}
      }
      h4 class={h4Class} 'Logic'
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
        label.kv-props-check class={checkClass} {
          input type=checkbox checked={Boolean(el.required)} onchange={(e) => set("required", e.currentTarget.checked || undefined)}
          span 'Required'
        }
      }
      if el.type !== "panel" && el.type !== "computed" {
        label.kv-props-check class={checkClass} {
          input type=checkbox checked={Boolean(el.readOnly)} onchange={(e) => set("readOnly", e.currentTarget.checked || undefined)}
          span 'Read-only'
        }
        label.kv-props-check class={checkClass} {
          input type=checkbox checked={Boolean(el.pii)} onchange={(e) => set("pii", e.currentTarget.checked || undefined)}
          span 'Personal data (masked for people without access)'
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
        label class={labelClass} {
          span 'Default (expression)'
          input.kv-props-expr class={fieldClass} spellcheck=false value={el.defaultExpr ?? ""} placeholder={"e.g. {price} * 2"} oninput={(e) => set("defaultExpr", e.currentTarget.value)}
        }
        if el.defaultExpr && expressionError(el.defaultExpr) {
          p.kv-props-error class={errorClass} '{expressionError(el.defaultExpr)}'
        }
      }
      if el.type === "computed" {
        label class={labelClass} {
          span 'Expression'
          input.kv-props-expr class={fieldClass} spellcheck=false value={el.expr ?? ""} oninput={(e) => set("expr", e.currentTarget.value)}
        }
        if expressionError(el.expr ?? "") {
          p.kv-props-error class={errorClass} '{expressionError(el.expr ?? "")}'
        }
        label class={labelClass} {
          span 'Decimals'
          input class={fieldClass} type=number min=0 max=10 value={el.decimals ?? ""} oninput={(e) => set("decimals", num(e.currentTarget.value))}
        }
        label class={labelClass} {
          span 'Prefix'
          input class={fieldClass} value={tx(el.prefix)} oninput={(e) => set("prefix", e.currentTarget.value)}
        }
        label class={labelClass} {
          span 'Suffix'
          input class={fieldClass} value={tx(el.suffix)} oninput={(e) => set("suffix", e.currentTarget.value)}
        }
      }

      if el.type === "text" {
        label class={labelClass} {
          span 'Input type'
          select class={fieldClass} value={el.inputType ?? "text"} onchange={(e) => set("inputType", e.currentTarget.value === "text" ? undefined : e.currentTarget.value)} {
            each inputTypes as t (t) {
              option value={t} '{t}'
            }
          }
        }
      }
      if el.type === "text" || el.type === "comment" {
        label class={labelClass} {
          span 'Placeholder'
          input class={fieldClass} value={tx(el.placeholder)} oninput={(e) => set("placeholder", e.currentTarget.value)}
        }
      }
      if el.type === "comment" {
        label class={labelClass} {
          span 'Rows'
          input class={fieldClass} type=number min=1 value={el.rows ?? ""} oninput={(e) => set("rows", num(e.currentTarget.value))}
        }
      }
      if el.type === "rating" {
        label class={labelClass} {
          span 'Min'
          input class={fieldClass} type=number value={el.min ?? 1} oninput={(e) => set("min", num(e.currentTarget.value))}
        }
        label class={labelClass} {
          span 'Max'
          input class={fieldClass} type=number value={el.max ?? 5} oninput={(e) => set("max", num(e.currentTarget.value))}
        }
      }
      if el.type === "boolean" {
        label class={labelClass} {
          span 'Yes label'
          input class={fieldClass} value={tx(el.labelTrue)} placeholder="Yes" oninput={(e) => set("labelTrue", e.currentTarget.value)}
        }
        label class={labelClass} {
          span 'No label'
          input class={fieldClass} value={tx(el.labelFalse)} placeholder="No" oninput={(e) => set("labelFalse", e.currentTarget.value)}
        }
      }
      if "choices" in el && el.type !== "grid" {
        h4 class={h4Class} 'Choices'
        ChoiceList defaultLocale={dl} items={el.choices as Choice[]} min={el.type === "ranking" ? 2 : 1} images={el.type === "image-choice"} onchange={(items) => set("choices", items)}
      }
      if el.type === "dropdown" {
        label.kv-props-check class={checkClass} {
          input type=checkbox checked={Boolean(el.searchable)} onchange={(e) => set("searchable", e.currentTarget.checked || undefined)}
          span 'Searchable'
        }
      }
      if el.type === "image-choice" {
        label.kv-props-check class={checkClass} {
          input type=checkbox checked={Boolean(el.multiple)} onchange={(e) => set("multiple", e.currentTarget.checked || undefined)}
          span 'Several pictures'
        }
      }
      if el.type === "tags" {
        label.kv-props-check class={checkClass} {
          input type=checkbox checked={Boolean(el.allowCustom)} onchange={(e) => set("allowCustom", e.currentTarget.checked || undefined)}
          span 'Allow own entries'
        }
        label class={labelClass} {
          span 'Most entries'
          input class={fieldClass} type=number min=1 value={el.maxTags ?? ""} oninput={(e) => set("maxTags", num(e.currentTarget.value))}
        }
      }
      if el.type === "multi-text" {
        h4 class={h4Class} 'Fields'
        ChoiceList defaultLocale={dl} items={el.items as Choice[]} noun="field" onchange={(items) => set("items", items)}
      }
      if el.type === "slider" {
        label class={labelClass} {
          span 'Min'
          input class={fieldClass} type=number value={el.min ?? 0} oninput={(e) => set("min", num(e.currentTarget.value))}
        }
        label class={labelClass} {
          span 'Max'
          input class={fieldClass} type=number value={el.max ?? 100} oninput={(e) => set("max", num(e.currentTarget.value))}
        }
        label class={labelClass} {
          span 'Step'
          input class={fieldClass} type=number min=0 value={el.step ?? 1} oninput={(e) => set("step", num(e.currentTarget.value))}
        }
        label class={labelClass} {
          span 'Unit'
          input class={fieldClass} value={tx(el.unit)} placeholder="%" oninput={(e) => set("unit", e.currentTarget.value)}
        }
      }
      if el.type === "matrix" || el.type === "grid" {
        h4 class={h4Class} 'Rows'
        ChoiceList defaultLocale={dl} items={el.rows as Choice[]} noun="row" onchange={(items) => set("rows", items)}
      }
      if el.type === "matrix" {
        h4 class={h4Class} 'Columns'
        ChoiceList defaultLocale={dl} items={el.columns as Choice[]} noun="column" onchange={(items) => set("columns", items)}
        label.kv-props-check class={checkClass} {
          input type=checkbox checked={Boolean(el.multiple)} onchange={(e) => set("multiple", e.currentTarget.checked || undefined)}
          span 'Several answers per row'
        }
      }
      if el.type === "grid" {
        h4 class={h4Class} 'Columns'
        each el.columns as col, ci (ci) {
          .kv-props-column class="kv:border kv:border-ui-border kv:rounded-md kv:p-[0.4rem] kv:grid kv:gap-[0.3rem]" {
            label class={labelClass} {
              span 'Label'
              input class={fieldClass} value={col.label} oninput={(e) => editColumn(ci, { label: e.currentTarget.value })}
            }
            label class={labelClass} {
              span 'Value'
              input class={fieldClass} value={col.value} oninput={(e) => editColumn(ci, { value: e.currentTarget.value })}
            }
            label class={labelClass} {
              span 'Cell'
              select class={fieldClass} value={col.cellType} onchange={(e) => editColumn(ci, { cellType: e.currentTarget.value })} {
                each cellTypes as t (t) {
                  option value={t} '{t}'
                }
              }
            }
            label.kv-props-check class={checkClass} {
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
              class={buttonClass}
              type=button
              disabled={el.columns.length <= 1}
              onclick={() => set("columns", (el!.columns as Loose[]).filter((_, j) => j !== ci))}
            ) 'Remove column'
          }
        }
        button class={buttonClass} type=button onclick={addColumn} 'Add column'
      }
      if el.type === "file" {
        label class={labelClass} {
          span 'Accept'
          input(
            class={fieldClass}
            value={(el.accept ?? []).join(", ")}
            placeholder="image/*, .pdf"
            oninput={(e) => set("accept", e.currentTarget.value.split(",").map((s) => s.trim()).filter(Boolean))}
          )
        }
        label class={labelClass} {
          span 'Max size (bytes)'
          input class={fieldClass} type=number min=1 value={el.maxSize ?? ""} oninput={(e) => set("maxSize", num(e.currentTarget.value))}
        }
        label class={labelClass} {
          span 'Max files'
          input class={fieldClass} type=number min=1 value={el.maxFiles ?? 1} oninput={(e) => set("maxFiles", num(e.currentTarget.value))}
        }
      }
      if el.type === "panel" {
        label.kv-props-check class={checkClass} {
          input(
            type=checkbox
            checked={Boolean(el.repeat)}
            disabled={inRepeat && !el.repeat}
            onchange={(e) => set("repeat", e.currentTarget.checked ? { min: 1 } : undefined)}
          )
          span 'Repeat (respondents add items)'
        }
        if el.repeat {
          label class={labelClass} {
            span 'Min items'
            input class={fieldClass} type=number min=0 value={el.repeat.min ?? ""} oninput={(e) => setRepeat("min", num(e.currentTarget.value))}
          }
          label class={labelClass} {
            span 'Max items'
            input class={fieldClass} type=number min=1 value={el.repeat.max ?? ""} oninput={(e) => setRepeat("max", num(e.currentTarget.value))}
          }
          label class={labelClass} {
            span 'Item title'
            input class={fieldClass} value={tx(el.repeat.itemTitle)} placeholder={"Item {n}"} oninput={(e) => setRepeat("itemTitle", e.currentTarget.value)}
          }
          label class={labelClass} {
            span 'Add button'
            input class={fieldClass} value={tx(el.repeat.addLabel)} placeholder="Add" oninput={(e) => setRepeat("addLabel", e.currentTarget.value)}
          }
        }
      }
      if quiz && el.type !== "panel" && el.type !== "computed" {
        h4 class={h4Class} 'Quiz'
        label class={labelClass} {
          span 'Correct answer'
          input.kv-props-correct class={fieldClass} placeholder={listTypes.includes(el.type) ? "a, b" : "value"} value={answerText(el.correctAnswer)} onchange={(e) => setCorrect(e.currentTarget.value)}
        }
        label class={labelClass} {
          span 'Points'
          input class={fieldClass} type=number min=0 value={el.points ?? ""} placeholder="1" oninput={(e) => set("points", num(e.currentTarget.value))}
        }
        if listTypes.includes(el.type) || el.type === "matrix" || el.type === "image-choice" {
          label.kv-props-check class={checkClass} {
            input type=checkbox checked={Boolean(el.partialCredit)} onchange={(e) => set("partialCredit", e.currentTarget.checked || undefined)}
            span 'Partial credit'
          }
        }
        label class={labelClass} {
          span 'If right'
          input class={fieldClass} value={el.feedback?.correct ?? ""} oninput={(e) => setFeedback("correct", e.currentTarget.value)}
        }
        label class={labelClass} {
          span 'If wrong'
          input class={fieldClass} value={el.feedback?.wrong ?? ""} oninput={(e) => setFeedback("wrong", e.currentTarget.value)}
        }
      }
      if el.type !== "panel" {
        h4 class={h4Class} 'Rules'
        ValidatorList question={el as Question} items={(el.validators ?? []) as Validator[]} onchange={(items) => set("validators", items)}
      }
      }
    }
  }
</template>
