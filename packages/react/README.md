# @kvesto/react

React bindings for [Kvesto](https://github.com/pavlovt/kvesto), the open source survey library.

```sh
npm install @kvesto/react @kvesto/core react
```

```tsx
import { Survey, useSurvey } from "@kvesto/react";
import "@kvesto/core/styles.css";

// The bundled renderer, in a component. Every createSurvey and render option is a prop.
export function Feedback() {
  return <Survey survey={survey} theme="auto" onComplete={({ response }) => save(response)} />;
}

// Or your own UI on the headless model, re-rendering as answers change.
export function Custom() {
  const { model, state } = useSurvey({ survey });
  return (
    <form onSubmit={(e) => (e.preventDefault(), model.complete())}>
      {state.questions.map((q) => (
        <label key={q.id}>
          {String(q.title)}
          <input value={String(state.answers[q.id] ?? "")} onChange={(e) => model.setValue(q.id, e.target.value)} />
        </label>
      ))}
    </form>
  );
}
```

Pass a stable `survey` object: a new one rebuilds the survey. MIT licensed.
