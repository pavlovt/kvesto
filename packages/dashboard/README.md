# @kvesto/dashboard

The results dashboard of [Kvesto](https://github.com/pavlovt/kvesto), packaged for embedding in your own app:
a survey list and per-question summaries (choice counts, averages, matrix heatmaps, rankings, files, text samples).

```sh
npm install @kvesto/dashboard
```

## In a Svelte 5 app

```svelte
<script>
  import { Dashboard } from "@kvesto/dashboard";
  import { httpStorage } from "@kvesto/core";

  const storage = httpStorage({ baseUrl: "/api/kvesto" });
</script>

<Dashboard {storage} />
```

Or use the parts with your own routing:

```svelte
<SurveyList {storage} href={(id) => `/results/${id}`} />
<SurveyResults {storage} surveyId={id} />
<SurveyResults survey={mySurvey} responses={myResponses} />  <!-- data you already have -->
```

## In any other app (React, Vue, plain JS)

The `standalone` build has Svelte bundled in, so you don't need a Svelte compiler:

```ts
import { mountDashboard } from "@kvesto/dashboard/standalone";
import { httpStorage } from "@kvesto/core";

const dashboard = mountDashboard(document.getElementById("results")!, {
  storage: httpStorage({ baseUrl: "/api/kvesto" }),
  surveyId: "customer-feedback", // optional: open this survey first
});
// later: dashboard.destroy();
```

| Component | Props |
| --- | --- |
| `Dashboard` | `storage` (needs `listSurveys`, `loadSurvey`, `listResponses`), optional `surveyId`, `api` |
| `SurveyList` | `storage` (needs `listSurveys`), `href(id)` or `onselect(id)`, optional `emptyText` |
| `SurveyResults` | `storage` + `surveyId`, or `survey` + `responses`; optional `api` |
| `ApiTokens` | `api`: create, list and revoke API tokens (needs `token:manage`) |
| `AuditLog` | `api`, optional `pageSize`: the audit log with filters and a CSV download (needs `audit:read`) |

`api` takes the same options as `httpStorage` (`baseUrl`, `headers`, `fetch`). With it, `Dashboard` adds "API tokens"
and "Audit log" sections and a Delete button on each response. A dashboard on another origin needs the server's
`adminCors` (or `KVESTO_ADMIN_ORIGINS`). Answers masked for the viewer's role (`pii` questions) show as "redacted".

```ts
const options = { baseUrl: "/api/kvesto", headers: { authorization: `Bearer ${key}` } };
mountDashboard(el, { storage: httpStorage(options), api: options });
```

The dashboard's styles are Tailwind CSS, compiled into the package: you don't need Tailwind yourself. The Svelte
components import `@kvesto/dashboard`'s own CSS file, and the `standalone` build adds it to the page when it loads.
Every class it defines has the `kv:` prefix and it has no reset (Preflight), so it doesn't restyle anything outside
the dashboard, and it works on pages that use Tailwind themselves. The dashboard's colours can be set from outside
with the `--kv-ui-*` custom properties on `.kv-dashboard` (for example `--kv-ui-accent`).

## License

MIT
