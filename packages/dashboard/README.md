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
| `Dashboard` | `storage` (needs `listSurveys`, `loadSurvey`, `listResponses`), optional `surveyId` |
| `SurveyList` | `storage` (needs `listSurveys`), `href(id)` or `onselect(id)`, optional `emptyText` |
| `SurveyResults` | `storage` + `surveyId`, or `survey` + `responses` |

The components' styles are scoped and use `kv-dash-*` class names.

## License

MIT
