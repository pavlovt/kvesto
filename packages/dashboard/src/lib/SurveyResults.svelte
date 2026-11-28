<script lang="ts" module>
  import type { HttpStorageOptions, Survey, SurveyResponse, SurveyStorage } from "@kvesto/core";

  export type SurveyResultsProps = {
    /** Show the survey's texts in this locale (falling back to its default). Default: the survey's default locale. */
    locale?: string;
    /** The Kvesto server, for admin actions storage has no method for: with it, a response can be deleted. */
    api?: HttpStorageOptions;
  } & (
    | {
        /** Load the survey and its responses from storage. Needs `loadSurvey` and `listResponses`. */
        storage: Pick<SurveyStorage, "loadSurvey" | "listResponses">;
        surveyId: string;
        survey?: never;
        responses?: never;
      }
    | {
        /** Or pass the data directly. */
        survey: Survey;
        responses: SurveyResponse[];
        storage?: never;
        surveyId?: never;
      }
  );
</script>

<script lang="ts">
  import ResponseTable from "./ResponseTable.svelte";
  import { apiError, apiRequest } from "./api.js";
  import { responsesToXlsx } from "@kvesto/export";
  import { completionStats, filterResponses, localizeSurvey, responsesToCsv, summarizeResponses, type Condition, type GridCellSummary, type QuestionSummary } from "@kvesto/core";

  let props: SurveyResultsProps = $props();

  let loaded = $state<{ survey: Survey; responses: SurveyResponse[] } | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  $effect(() => {
    const { storage, surveyId } = props;
    if (!storage || surveyId === undefined) return;
    if (!storage.listResponses) {
      error = "This storage can't list responses.";
      return;
    }
    loading = true;
    Promise.all([storage.loadSurvey(surveyId), storage.listResponses(surveyId)])
      .then(([s, r]) => {
        loaded = s ? { survey: s, responses: r } : null;
        error = s ? null : `Survey "${surveyId}" not found.`;
      })
      .catch((e: Error) => (error = e.message))
      .finally(() => (loading = false));
  });

  const source = $derived(props.survey ?? loaded?.survey ?? null);
  // Every text in the chosen locale, so the markup below only sees plain strings.
  const survey = $derived(source ? localizeSurvey(source, props.locale) : null);
  // Responses deleted here, left out until the next load.
  let deleted = $state<string[]>([]);
  const all = $derived((props.responses ?? loaded?.responses ?? []).filter((r) => !deleted.includes(r.id)));
  async function deleteResponse(responseId: string) {
    const { api } = props;
    if (!api || !source) return;
    try {
      await apiRequest(api, "DELETE", `/surveys/${encodeURIComponent(source.id)}/responses/${encodeURIComponent(responseId)}`);
    } catch (e) {
      throw new Error(apiError(e));
    }
    deleted = [...deleted, responseId];
  }
  // Partial responses (saved progress) are left out of the results unless asked for.
  let includePartial = $state(false);
  const partials = $derived(all.filter((r) => r.status === "partial").length);
  // Filters by hidden field value ("" means any).
  let hiddenFilter = $state<Record<string, string>>({});
  const hiddenOf = (r: SurveyResponse) => ((r.meta?.hidden ?? {}) as Record<string, string>);
  const hiddenValues = $derived(
    (source?.hiddenFields ?? []).map((name) => ({
      name,
      values: [...new Set(all.map((r) => hiddenOf(r)[name]).filter((v): v is string => typeof v === "string"))].sort(),
    })),
  );
  // Filters: dates, one answer, and the hidden fields and partial toggle above.
  let from = $state("");
  let to = $state("");
  let answerQuestion = $state("");
  let answerValue = $state("");
  let view = $state<"summary" | "table">("summary");
  /** Questions an answer filter can pick a value for. */
  const filterable = $derived(
    (survey ? summarizeResponses(survey, []) : [])
      .filter((s) => !s.repeat && s.counts)
      .map((s) => ({ id: s.question.id, title: String(s.question.title), options: s.counts! })),
  );
  const where = $derived.by((): Condition | undefined => {
    const q = filterable.find((f) => f.id === answerQuestion);
    if (!q || !answerValue) return undefined;
    const type = survey ? summarizeResponses(survey, []).find((s) => s.question.id === q.id)?.question.type : undefined;
    // Lists contain the value; single answers equal it (booleans and ratings compare as their typed value).
    if (type === "multiple-choice" || type === "tags" || type === "ranking") return { question: q.id, op: "contains", value: answerValue };
    if (type === "boolean") return { question: q.id, op: "eq", value: answerValue === "true" };
    if (type === "rating" || type === "slider") return { question: q.id, op: "eq", value: Number(answerValue) };
    return { question: q.id, op: "eq", value: answerValue };
  });
  const responses = $derived(
    filterResponses(all, {
      status: includePartial ? "all" : "complete",
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      hidden: hiddenFilter,
      ...(where ? { where } : {}),
    }),
  );
  const summary = $derived<QuestionSummary[]>(survey ? summarizeResponses(survey, responses) : []);
  const shownSummary = $derived(view === "summary" ? summary : []);
  /** Download the filtered responses (labels in the shown locale). */
  function download(kind: "csv" | "xlsx") {
    if (!source) return;
    const data =
      kind === "csv"
        ? new Blob([responsesToCsv(source, responses, { locale: props.locale })], { type: "text/csv;charset=utf-8" })
        : new Blob([responsesToXlsx(source, responses, { locale: props.locale }) as BlobPart], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data);
    a.download = `${source.id}-responses.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const completion = $derived(survey && partials ? completionStats(survey, all) : null);
  // Quiz scores, as the server worked them out.
  const scores = $derived.by(() => {
    if (!survey?.settings?.quiz) return null;
    const list = responses
      .map((r) => r.meta?.quiz as { score?: number; max?: number; passed?: boolean } | undefined)
      .filter((q): q is { score: number; max: number; passed?: boolean } => typeof q?.score === "number" && typeof q?.max === "number");
    if (!list.length) return null;
    const avg = list.reduce((a, q) => a + (q.max ? q.score / q.max : 0), 0) / list.length;
    const withPass = list.filter((q) => q.passed !== undefined);
    const counts = new Map<number, number>();
    for (const q of list) counts.set(q.score, (counts.get(q.score) ?? 0) + 1);
    return {
      n: list.length,
      average: Math.round(avg * 100),
      passRate: withPass.length ? Math.round((withPass.filter((q) => q.passed).length / withPass.length) * 100) : null,
      distribution: [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([score, count]) => ({ score, count })),
    };
  });
  // Panels around a question, as "Outer / Inner"; untitled panels are left out.
  const groupLabel = (item: QuestionSummary | undefined) =>
    item ? item.panels.flatMap((p) => (p.title ? [p.title] : [])).join(" / ") : "";
  // A grid cell column in a few words: the average, the counts, or how many filled it in.
  const cellText = (cell: GridCellSummary) => {
    if (!cell.answered) return "–";
    if (cell.average !== undefined) return `avg ${cell.average.toFixed(1)}`;
    if (cell.counts) return cell.counts.filter((c) => c.count).map((c) => `${c.label} ${c.count}`).join(" · ");
    return `${cell.answered} answered`;
  };
  const pct = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);
  // Ranking bars: first place fills the bar, last place leaves it empty.
  const rankScore = (avg: number, n: number) => (n > 1 && avg > 0 ? Math.round(((n - avg) / (n - 1)) * 100) : 0);

  // Tailwind classes used more than once (prefixed `kv:`; see dashboard.css).
  const mutedClass = "kv:text-ui-muted kv:text-[0.9rem]";
  const fieldClass = "kv:font-inherit kv:text-[0.85rem]";
  const viewButton = (on: boolean) =>
    "kv:font-inherit kv:text-[0.85rem] kv:cursor-pointer kv:border kv:text-inherit kv:py-[0.2rem] kv:px-[0.6rem] " +
    (on ? "kv:bg-ui-accent-soft kv:border-ui-accent-line" : "kv:bg-ui-surface kv:border-ui-border-strong");
  const cardClass =
    "kv:bg-ui-surface kv:border kv:border-ui-border kv:rounded-lg kv:p-4 kv:mb-4 kv:max-w-[48rem] kv:print:break-inside-avoid kv:print:border-[#999]";
  const h2Class = "kv:text-[1.05rem] kv:[margin:0_0_0.25rem]";
  const barRow = "kv:grid kv:grid-cols-[10rem_1fr_3rem] kv:gap-2 kv:items-center kv:[margin:0.3rem_0]";
  const bar = "kv:[background:var(--kv-ui-accent-soft,#eef2ff)] kv:rounded-[999px] kv:h-[0.6rem] kv:overflow-hidden";
  const num = "kv:text-right kv:tabular-nums";
  const matrixCell = "kv:py-[0.35rem] kv:px-3 kv:border-b kv:border-b-ui-border";
</script>

<template lang="braceml">
  if loading {
    p.kv-dash-muted class={mutedClass} 'Loading…'
  } else if error {
    p.kv-dash-error class="kv:text-ui-danger kv:whitespace-pre-wrap" '{error}'
  } else if survey {
    .kv-dash-results {
      h1 class="kv:text-[1.5rem] kv:[margin:0_0_0.25rem]" '{survey.title}'
      p.kv-dash-muted class={mutedClass} '{responses.length} responses'
      .kv-dash-filters class="kv:flex kv:flex-wrap kv:gap-3 kv:[margin:0_0_1rem] kv:text-[0.9rem] kv:print:hidden" {
        .kv-dash-views class="kv:flex kv:gap-1" role=group aria-label="View" {
          button type=button class={viewButton(view === 'summary')} aria-pressed={view === "summary"} onclick={() => (view = "summary")} 'Summary'
          button type=button class={viewButton(view === 'table')} aria-pressed={view === "table"} onclick={() => (view = "table")} 'Table'
        }
        .kv-dash-exports class="kv:flex kv:gap-1" {
          button type=button class="{fieldClass} kv:cursor-pointer" onclick={() => download("csv")} 'CSV'
          button type=button class="{fieldClass} kv:cursor-pointer" onclick={() => download("xlsx")} 'Excel'
          button type=button class="{fieldClass} kv:cursor-pointer" onclick={() => window.print()} 'Print'
        }
        label class="kv:flex kv:gap-[0.35rem] kv:items-center" {
          span 'From'
          input class={fieldClass} type=date value={from} onchange={(e) => (from = e.currentTarget.value)}
        }
        label class="kv:flex kv:gap-[0.35rem] kv:items-center" {
          span 'To'
          input class={fieldClass} type=date value={to} onchange={(e) => (to = e.currentTarget.value)}
        }
        if filterable.length {
          label class="kv:flex kv:gap-[0.35rem] kv:items-center" {
            span 'Answer'
            select class={fieldClass} aria-label="Question to filter by" value={answerQuestion} onchange={(e) => ((answerQuestion = e.currentTarget.value), (answerValue = ""))} {
              option value="" 'Any question'
              each filterable as f (f.id) {
                option value={f.id} '{f.title}'
              }
            }
          }
          if answerQuestion {
            select class={fieldClass} aria-label="Answer to filter by" value={answerValue} onchange={(e) => (answerValue = e.currentTarget.value)} {
              option value="" 'Any answer'
              each filterable.find((f) => f.id === answerQuestion)?.options ?? [] as o (o.value) {
                option value={o.value} '{o.label}'
              }
            }
          }
        }
        if hiddenValues.some((h) => h.values.length) {
          each hiddenValues as h (h.name) {
            label class="kv:flex kv:gap-[0.35rem] kv:items-center" {
              span '{h.name}'
              select class={fieldClass} value={hiddenFilter[h.name] ?? ""} onchange={(e) => (hiddenFilter = { ...hiddenFilter, [h.name]: e.currentTarget.value })} {
                option value="" 'Any'
                each h.values as v (v) {
                  option value={v} '{v}'
                }
              }
            }
          }
        }
      }
      if view === "table" {
        ResponseTable survey={survey} responses={responses} ondelete={props.api ? deleteResponse : undefined}
      }
      if view === "summary" && scores {
        section.kv-dash-card.kv-dash-scores class={cardClass} {
          h2 class={h2Class} 'Scores'
          p 'Average {scores.average}% over {scores.n} scored {scores.n === 1 ? "response" : "responses"}{scores.passRate !== null ? `, ${scores.passRate}% passed` : ""}.'
          each scores.distribution as d (d.score) {
            .kv-dash-bar-row class={barRow} {
              span.kv-dash-bar-label '{d.score} {d.score === 1 ? "point" : "points"}'
              .kv-dash-bar class={bar} > .kv-dash-bar-fill class="kv:bg-ui-accent kv:h-full" style="width: {pct(d.count, scores.n)}%"
              span.kv-dash-num class={num} '{d.count}'
            }
          }
        }
      }
      if view === "summary" && completion {
        section.kv-dash-card.kv-dash-completion class={cardClass} {
          h2 class={h2Class} 'Completion'
          p '{completion.completed} of {completion.started} started responses were completed ({pct(completion.completed, completion.started)}%).'
          label.kv-dash-toggle class="kv:flex kv:gap-[0.4rem] kv:items-center kv:text-[0.9rem]" {
            input type=checkbox checked={includePartial} onchange={(e) => (includePartial = e.currentTarget.checked)}
            span 'Include the {partials} partial {partials === 1 ? "response" : "responses"} in the results'
          }
          h3 class="kv:text-[0.95rem] kv:[margin:0.75rem_0_0.25rem]" 'Where people stop'
          ul.kv-dash-dropoff class="kv:list-none kv:m-0 kv:p-0" {
            each completion.reached as q (q.id) {
              li.kv-dash-bar-row class={barRow} {
                span.kv-dash-bar-label '{q.title}'
                .kv-dash-bar class={bar} > .kv-dash-bar-fill class="kv:bg-ui-accent kv:h-full" style="width: {pct(q.count, completion.started)}%"
                span.kv-dash-num class={num} title="Reached by {q.count} of {completion.started}" '{q.count}'
              }
            }
          }
        }
      }
      each shownSummary as item, i (item.question.id) {
        if groupLabel(item) && groupLabel(item) !== groupLabel(shownSummary[i - 1]) {
          p.kv-dash-group class="kv:font-bold kv:text-[0.95rem] kv:text-ui-text-2 kv:[margin:1.25rem_0_0.5rem] kv:max-w-[48rem]" '{groupLabel(item)}'
        }
        section.kv-dash-card class={cardClass} {
          h2 class={h2Class} '{item.question.title}'
          p.kv-dash-muted class={mutedClass} '{item.answered} answered{item.repeat ? " (counting every item)" : ""}'
          if item.average !== undefined {
            p 'Average: {item.average.toFixed(1)}'
          }
          if item.counts {
            each item.counts as option (option.value) {
              .kv-dash-bar-row class={barRow} {
                span.kv-dash-bar-label '{option.label}'
                .kv-dash-bar class={bar} > .kv-dash-bar-fill class="kv:bg-ui-accent kv:h-full" style="width: {pct(option.count, item.answered)}%"
                span.kv-dash-num class={num} '{option.count}'
              }
            }
          }
          if item.matrix {
            .kv-dash-matrix-scroll class="kv:overflow-x-auto" > table.kv-dash-matrix class="kv:border-collapse" {
              thead > tr {
                th class={matrixCell} ''
                each item.question.type === "matrix" ? item.question.columns : [] as col (col.value) {
                  th.kv-dash-num class="{matrixCell} {num}" '{col.label}'
                }
              }
              tbody {
                each item.matrix as row (row.value) {
                  tr {
                    th class="{matrixCell} kv:text-left kv:font-normal" '{row.label}'
                    each row.counts as cell (cell.value) {
                      td.kv-dash-num.kv-dash-heat class="{matrixCell} {num} kv:[background:color-mix(in_srgb,var(--kv-ui-accent,#2563eb)_calc(var(--share)_*_0.5),transparent)]" style="--share: {pct(cell.count, row.answered)}%" title="{pct(cell.count, row.answered)}%" '{cell.count}'
                    }
                  }
                }
              }
            }
          }
          if item.grid {
            .kv-dash-matrix-scroll class="kv:overflow-x-auto" > table.kv-dash-matrix class="kv:border-collapse" {
              thead > tr {
                th class={matrixCell} ''
                each item.question.type === "grid" ? item.question.columns : [] as col (col.value) {
                  th class={matrixCell} '{col.label}'
                }
              }
              tbody {
                each item.grid as row (row.value) {
                  tr {
                    th class="{matrixCell} kv:text-left kv:font-normal" '{row.label}'
                    each row.columns as cell (cell.value) {
                      td class={matrixCell} '{cellText(cell)}'
                    }
                  }
                }
              }
            }
          }
          if item.ranking {
            p.kv-dash-muted class={mutedClass} 'Average position, best first'
            each item.ranking as option (option.value) {
              .kv-dash-bar-row class={barRow} {
                span.kv-dash-bar-label '{option.label}'
                .kv-dash-bar class={bar} > .kv-dash-bar-fill class="kv:bg-ui-accent kv:h-full" style="width: {rankScore(option.averageRank, item.ranking.length)}%"
                span.kv-dash-num class={num} title="Ranked first {option.firstPlace}×" '{option.averageRank ? option.averageRank.toFixed(1) : "–"}'
              }
            }
          }
          if item.files {
            p.kv-dash-muted class={mutedClass} '{item.fileCount} {item.fileCount === 1 ? "file" : "files"}, latest first'
            ul {
              each item.files as file {
                li {
                  if file.type.startsWith("image/") {
                    img.kv-dash-thumb class="kv:block kv:max-w-[12rem] kv:max-h-[5rem] kv:border kv:border-ui-border kv:rounded-[0.25rem] kv:mb-[0.2rem] kv:bg-[#fff]" src={file.url} alt={file.name} loading=lazy
                  }
                  a href={file.url} download={file.name} target=_blank rel=noopener '{file.name}'
                }
              }
            }
          }
          if item.samples {
            ul {
              each item.samples as sample {
                li '{sample}'
              }
            }
          }
        }
      }
    }
  }
</template>
