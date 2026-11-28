# Results

The [dashboard](../../packages/dashboard/README.md) shows a summary per question and a sortable, paged table of
responses (one column per answer part: matrix rows, grid cells, multi-text fields and each repeat item). Both follow
its filters: dates, one answer, hidden fields and partial responses.

## In your own code

The same pieces are in the core for your own reports: `summarizeResponses`, `responseColumns` and `responseRow`, and
`filterResponses(responses, { from, to, status, hidden, where })`, where `where` is a condition in the survey's own
format.

## Exports

`responsesToCsv(survey, responses, { values? })` in the core, `GET /surveys/{id}/responses.csv` on the server (the
list filters apply; `values=true` for choice values), and `responsesToXlsx` in the optional `@kvesto/export`
package, which writes Excel files with no dependencies. All three use the same columns, and cells that a spreadsheet
would run as formulas are defused. The dashboard has CSV, Excel and Print buttons, and a view of one response that
prints on its own; the core stylesheet prints a survey without its buttons.

```ts
import { responsesToXlsx } from "@kvesto/export";

const bytes = responsesToXlsx(survey, responses);          // labels; { values: true } for choice values
const file = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
```

The Excel columns are one per answer part, then the survey's hidden fields. Numbers are written as numbers,
everything else as text, and never as formulas.
