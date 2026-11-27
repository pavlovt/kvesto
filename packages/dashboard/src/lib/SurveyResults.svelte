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
</script>

<template lang="braceml">
  if loading {
    p.kv-dash-muted 'Loading…'
  } else if error {
    p.kv-dash-error '{error}'
  } else if survey {
    .kv-dash-results {
      h1 '{survey.title}'
      p.kv-dash-muted '{responses.length} responses'
      .kv-dash-filters {
        .kv-dash-views role=group aria-label="View" {
          button type=button aria-pressed={view === "summary"} onclick={() => (view = "summary")} 'Summary'
          button type=button aria-pressed={view === "table"} onclick={() => (view = "table")} 'Table'
        }
        .kv-dash-exports {
          button type=button onclick={() => download("csv")} 'CSV'
          button type=button onclick={() => download("xlsx")} 'Excel'
          button type=button onclick={() => window.print()} 'Print'
        }
        label {
          span 'From'
          input type=date value={from} onchange={(e) => (from = e.currentTarget.value)}
        }
        label {
          span 'To'
          input type=date value={to} onchange={(e) => (to = e.currentTarget.value)}
        }
        if filterable.length {
          label {
            span 'Answer'
            select aria-label="Question to filter by" value={answerQuestion} onchange={(e) => ((answerQuestion = e.currentTarget.value), (answerValue = ""))} {
              option value="" 'Any question'
              each filterable as f (f.id) {
                option value={f.id} '{f.title}'
              }
            }
          }
          if answerQuestion {
            select aria-label="Answer to filter by" value={answerValue} onchange={(e) => (answerValue = e.currentTarget.value)} {
              option value="" 'Any answer'
              each filterable.find((f) => f.id === answerQuestion)?.options ?? [] as o (o.value) {
                option value={o.value} '{o.label}'
              }
            }
          }
        }
        if hiddenValues.some((h) => h.values.length) {
          each hiddenValues as h (h.name) {
            label {
              span '{h.name}'
              select value={hiddenFilter[h.name] ?? ""} onchange={(e) => (hiddenFilter = { ...hiddenFilter, [h.name]: e.currentTarget.value })} {
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
        section.kv-dash-card.kv-dash-scores {
          h2 'Scores'
          p 'Average {scores.average}% over {scores.n} scored {scores.n === 1 ? "response" : "responses"}{scores.passRate !== null ? `, ${scores.passRate}% passed` : ""}.'
          each scores.distribution as d (d.score) {
            .kv-dash-bar-row {
              span.kv-dash-bar-label '{d.score} {d.score === 1 ? "point" : "points"}'
              .kv-dash-bar > .kv-dash-bar-fill style="width: {pct(d.count, scores.n)}%"
              span.kv-dash-num '{d.count}'
            }
          }
        }
      }
      if view === "summary" && completion {
        section.kv-dash-card.kv-dash-completion {
          h2 'Completion'
          p '{completion.completed} of {completion.started} started responses were completed ({pct(completion.completed, completion.started)}%).'
          label.kv-dash-toggle {
            input type=checkbox checked={includePartial} onchange={(e) => (includePartial = e.currentTarget.checked)}
            span 'Include the {partials} partial {partials === 1 ? "response" : "responses"} in the results'
          }
          h3 'Where people stop'
          ul.kv-dash-dropoff {
            each completion.reached as q (q.id) {
              li.kv-dash-bar-row {
                span.kv-dash-bar-label '{q.title}'
                .kv-dash-bar > .kv-dash-bar-fill style="width: {pct(q.count, completion.started)}%"
                span.kv-dash-num title="Reached by {q.count} of {completion.started}" '{q.count}'
              }
            }
          }
        }
      }
      each shownSummary as item, i (item.question.id) {
        if groupLabel(item) && groupLabel(item) !== groupLabel(shownSummary[i - 1]) {
          p.kv-dash-group '{groupLabel(item)}'
        }
        section.kv-dash-card {
          h2 '{item.question.title}'
          p.kv-dash-muted '{item.answered} answered{item.repeat ? " (counting every item)" : ""}'
          if item.average !== undefined {
            p 'Average: {item.average.toFixed(1)}'
          }
          if item.counts {
            each item.counts as option (option.value) {
              .kv-dash-bar-row {
                span.kv-dash-bar-label '{option.label}'
                .kv-dash-bar > .kv-dash-bar-fill style="width: {pct(option.count, item.answered)}%"
                span.kv-dash-num '{option.count}'
              }
            }
          }
          if item.matrix {
            .kv-dash-matrix-scroll > table.kv-dash-matrix {
              thead > tr {
                th ''
                each item.question.type === "matrix" ? item.question.columns : [] as col (col.value) {
                  th.kv-dash-num '{col.label}'
                }
              }
              tbody {
                each item.matrix as row (row.value) {
                  tr {
                    th '{row.label}'
                    each row.counts as cell (cell.value) {
                      td.kv-dash-num.kv-dash-heat style="--share: {pct(cell.count, row.answered)}%" title="{pct(cell.count, row.answered)}%" '{cell.count}'
                    }
                  }
                }
              }
            }
          }
          if item.grid {
            .kv-dash-matrix-scroll > table.kv-dash-matrix {
              thead > tr {
                th ''
                each item.question.type === "grid" ? item.question.columns : [] as col (col.value) {
                  th '{col.label}'
                }
              }
              tbody {
                each item.grid as row (row.value) {
                  tr {
                    th '{row.label}'
                    each row.columns as cell (cell.value) {
                      td '{cellText(cell)}'
                    }
                  }
                }
              }
            }
          }
          if item.ranking {
            p.kv-dash-muted 'Average position, best first'
            each item.ranking as option (option.value) {
              .kv-dash-bar-row {
                span.kv-dash-bar-label '{option.label}'
                .kv-dash-bar > .kv-dash-bar-fill style="width: {rankScore(option.averageRank, item.ranking.length)}%"
                span.kv-dash-num title="Ranked first {option.firstPlace}×" '{option.averageRank ? option.averageRank.toFixed(1) : "–"}'
              }
            }
          }
          if item.files {
            p.kv-dash-muted '{item.fileCount} {item.fileCount === 1 ? "file" : "files"}, latest first'
            ul {
              each item.files as file {
                li {
                  if file.type.startsWith("image/") {
                    img.kv-dash-thumb src={file.url} alt={file.name} loading=lazy
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

<style>
  .kv-dash-thumb { display: block; max-width: 12rem; max-height: 5rem; border: 1px solid var(--kv-ui-border, #e5e7eb); border-radius: 0.25rem; margin-bottom: 0.2rem; background: #fff; }
  .kv-dash-results h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .kv-dash-card { background: var(--kv-ui-surface, white); border: 1px solid var(--kv-ui-border, #e5e7eb); border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem; max-width: 48rem; }
  .kv-dash-group { font-weight: 700; font-size: 0.95rem; color: var(--kv-ui-text-2, #374151); margin: 1.25rem 0 0.5rem; max-width: 48rem; }
  .kv-dash-card h2 { font-size: 1.05rem; margin: 0 0 0.25rem; }
  .kv-dash-num { text-align: right; font-variant-numeric: tabular-nums; }
  .kv-dash-dropoff { list-style: none; margin: 0; padding: 0; }
  .kv-dash-filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0 0 1rem; font-size: 0.9rem; }
  .kv-dash-filters label { display: flex; gap: 0.35rem; align-items: center; }
  .kv-dash-filters input, .kv-dash-filters select, .kv-dash-views button { font: inherit; font-size: 0.85rem; }
  .kv-dash-views, .kv-dash-exports { display: flex; gap: 0.25rem; }
  .kv-dash-exports button { font: inherit; font-size: 0.85rem; cursor: pointer; }
  /* Printing: the results only, without the controls. */
  @media print {
    .kv-dash-filters { display: none; }
    .kv-dash-card { break-inside: avoid; border-color: #999; }
  }
  .kv-dash-views button { cursor: pointer; border: 1px solid var(--kv-ui-border-strong, #d1d5db); background: var(--kv-ui-surface, white); color: inherit; padding: 0.2rem 0.6rem; }
  .kv-dash-views button[aria-pressed="true"] { background: var(--kv-ui-accent-soft, #eff6ff); border-color: var(--kv-ui-accent-line, #93c5fd); }
  .kv-dash-completion h3 { font-size: 0.95rem; margin: 0.75rem 0 0.25rem; }
  .kv-dash-toggle { display: flex; gap: 0.4rem; align-items: center; font-size: 0.9rem; }
  .kv-dash-bar-row { display: grid; grid-template-columns: 10rem 1fr 3rem; gap: 0.5rem; align-items: center; margin: 0.3rem 0; }
  .kv-dash-bar { background: var(--kv-ui-accent-soft, #eef2ff); border-radius: 999px; height: 0.6rem; overflow: hidden; }
  .kv-dash-bar-fill { background: var(--kv-ui-accent, #2563eb); height: 100%; }
  .kv-dash-matrix-scroll { overflow-x: auto; }
  .kv-dash-matrix { border-collapse: collapse; }
  .kv-dash-matrix th, .kv-dash-matrix td { padding: 0.35rem 0.75rem; border-bottom: 1px solid var(--kv-ui-border, #e5e7eb); }
  .kv-dash-matrix tbody th { text-align: left; font-weight: normal; }
  .kv-dash-heat { background: color-mix(in srgb, var(--kv-ui-accent, #2563eb) calc(var(--share) * 0.5), transparent); }
  .kv-dash-muted { color: var(--kv-ui-muted, #6b7280); font-size: 0.9rem; }
  .kv-dash-error { color: var(--kv-ui-danger, #b91c1c); white-space: pre-wrap; }
</style>
