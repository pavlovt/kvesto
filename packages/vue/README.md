# @kvesto/vue

Vue 3 bindings for [Kvesto](https://github.com/pavlovt/kvesto), the open source survey library.

```sh
npm install @kvesto/vue @kvesto/core vue
```

```vue
<script setup lang="ts">
import { Survey, useSurvey } from "@kvesto/vue";
import "@kvesto/core/styles.css";

// Or a custom UI: `state` is a shallow ref that updates on every change.
const { model, state } = useSurvey({ survey });
</script>

<template>
  <Survey :survey="survey" :options="{ locale: 'de' }" :render="{ theme: 'auto' }" @complete="save" />
</template>
```

`options` takes any `createSurvey` option and `render` any render option. MIT licensed.
