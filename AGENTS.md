# Notes for AI agents working on Kvesto

- Monorepo: pnpm workspaces. `pnpm build`, `pnpm typecheck`, `pnpm test` at the root. Packages must be built before
  dependants typecheck (the root `build` runs them in order).
- `@kvesto/schema` is the single source of truth for the survey JSON format. Change it there; the core, the server
  and the OpenAPI spec all use the same Zod schemas. Breaking format changes bump `SURVEY_SCHEMA_VERSION` and add a
  step to `migrateSurvey`.
- The core must stay backend-free and framework-free: no Node APIs, no fetch calls outside `adapters/http.ts`.
- Every REST route is declared with `createRoute` in `packages/server/src/routes.ts` so it shows up in `/openapi.json`,
  and gets a test in `packages/server/test/api.test.ts`.
- Svelte markup in `apps/*` is written in **BraceML** inside `<template lang="braceml">`, never as raw HTML.
  Type-check it with `pnpm typecheck` (the script compiles BraceML first, because plain svelte-check can't read it).
- Style the apps (`apps/*`) with Tailwind CSS v4 utilities, not new CSS rules. In BraceML, put utilities in a
  `class="…"` attribute (`header class="flex gap-4 px-5 md:p-8"`), because the `.class` shorthand can't hold `:`,
  `/`, `[` or `.`. Colours and sizes that the default theme doesn't have become `@theme` tokens in the app's
  `app.css`. The editor and dashboard apps load Tailwind without Preflight, because the packages they embed still
  rely on browser defaults.
- `@kvesto/editor` and `@kvesto/dashboard` are styled with Tailwind too, with every utility prefixed:
  `class="kv:grid kv:gap-3"`. Their Tailwind sources are `src/lib/editor.css` and `src/lib/dashboard.css` (the
  `ui-*` colour tokens, the dark theme, and the few rules for markup the components don't own, such as the
  preview's questions or the `<html>` class used while printing); the build compiles them, so users don't need
  Tailwind. Don't put two utilities for the same property on one element (all utilities have the same
  specificity): pick one in the class expression instead (`class={on ? 'kv:bg-ui-accent-soft' : 'kv:bg-ui-surface'}`).
  Inside a `class={…}` expression use single quotes, because BraceML HTML-escapes double quotes there.
  `@kvesto/core/styles.css` is still plain CSS until its milestone in `ROADMAP.md` (M82) moves it.

## BraceML reference

> BraceML is a brace-based HTML template language. `{ }` wraps an element's children.
> Text is always quoted. It compiles to HTML, Svelte 5 and React. Full spec:
> https://github.com/pavlovt/braceml/blob/main/docs/language.md

### Rules

1. Element: `tag#id.class.class attr=value attr="v" attr={expr}`, followed by ONE of:
   - `{ children }`
   - `'text'`: a single text child
   - `> element`: a single element child
   - nothing: a void or empty element
2. The tag defaults to `div`: `.row { }` is `<div class="row">`.
3. A tag starting with an upper-case letter is a component: `Card title="x"`.
4. TEXT IS ALWAYS QUOTED. Expressions in text go inside the quotes:
   `p 'Hello {name}'`. Writing `p {name}` is WRONG.
5. `{` opens an expression ONLY right after `=` (or as a spread `{...props}`).
   Anywhere else `{` opens children.
6. A newline ends an element head. For multi-line attributes use `tag(` ... `)`,
   with no space before `(`.
7. Blocks: `if c { } else if d { } else { }`,
   `each items as item, i (item.id) { } else { }`,
   `await p { } then v { } catch e { }`, `key x { }`, `snippet name(a) { }`.
8. Special tags: `@render name(x)`, `@html raw`, `@const y = x * 2`, `@debug x`.
   Each one runs to the end of the line.
9. Comments: `// dropped`, `/* kept as <!-- --> */`.
10. Svelte directives pass through: `bind:value={v}`, `class:on={b}`, `use:act`,
    `onclick={fn}`.

### Svelte ↔ BraceML

| Svelte                                   | BraceML                              |
|------------------------------------------|--------------------------------------|
| `<div class="a b">…</div>`               | `.a.b { … }`                         |
| `<p>Hi {name}</p>`                       | `p 'Hi {name}'`                      |
| `<input bind:value={v} />`               | `input bind:value={v}`               |
| `<li><a href="/">Home</a></li>`          | `li > a href=/ 'Home'`               |
| `<Card {...props} />`                    | `Card {...props}`                    |
| `{#if a}…{:else}…{/if}`                  | `if a { … } else { … }`              |
| `{#each xs as x (x.id)}…{/each}`         | `each xs as x (x.id) { … }`          |
| `{@render row(x)}`                       | `@render row(x)`                     |
| text after an element: `<label><input> Name</label>` | `label {` / `input` / `' Name'` / `}` (separate lines) |

### In a .svelte file

```svelte
<script lang="ts">
  let { items } = $props();
</script>

<template lang="braceml">
  ul {
    each items as item (item.id) {
      li '{item.name}'
    }
  }
</template>
```

### In a .jsx or .tsx file

```tsx
import { braceml } from '@braceml/react';

export function Users({ users }) {
  return braceml`
    ul {
      each users as user (user.id) {
        li '{user.name}'
      }
    }
  `;
}
```

Needs `braceml()` from `@braceml/react/vite` before `react()` in the Vite config. Write
`{x}`, never `${x}`. `class` and `onclick` are converted for HTML elements. On a component,
write `onClick`. `bind:value` is an error: use `value={v} onchange={fn}`.

### Common mistakes

- An unquoted text or expression child (`p {x}`). Quote it: `p '{x}'`.
- Two bodies on one element (`p 'a' { }`). Use a children block with two text nodes.
- A dot inside a selector class (`.w-1.5`). Use `class="w-1.5"`.
- A space before a multi-line group (`input (`). Write `input(`.
- Text on the same line as an element becomes that element's body: `input ' Name'` is an error.
  Put sibling text on its own line.
