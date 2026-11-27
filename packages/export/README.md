# @kvesto/export

Excel export for [Kvesto](https://github.com/pavlovt/kvesto) responses. No dependencies beyond the Kvesto core: it
writes the `.xlsx` format itself.

```ts
import { responsesToXlsx } from "@kvesto/export";

const bytes = responsesToXlsx(survey, responses);          // labels; { values: true } for choice values
const file = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
```

The columns are the same as the CSV export's (`responsesToCsv` in `@kvesto/core`): one per answer part, then the
survey's hidden fields. Numbers are written as numbers, everything else as text, and never as formulas. MIT
licensed.
