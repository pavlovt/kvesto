<script lang="ts">
  import { base } from "$app/paths";
  import { repo } from "$lib/pages";
  import "../app.css";

  let { children } = $props();

  function toggleTheme() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("kvesto-docs-theme", dark ? "dark" : "light");
    } catch {}
  }
</script>

<template lang="braceml">
  svelte:head {
    link rel=icon href="{base}/favicon.svg"
    meta name=description content="Kvesto documentation: open source surveys from JSON, with an editor, a dashboard and a REST server."
  }

  div class="flex min-h-dvh flex-col" {
    header class="border-b" {
      nav class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3" {
        a href="{base}/" class="font-semibold tracking-tight" 'Kvesto'
        a href="{base}/" class="text-sm font-medium" 'Docs'
        // the editor demo is a separate app, deployed next to the docs
        a href="{base}/demo/" data-sveltekit-reload class="text-sm text-muted-foreground hover:text-foreground" 'Editor demo'
        a href={repo} class="text-sm text-muted-foreground hover:text-foreground" 'GitHub'

        button(
          type=button
          onclick={toggleTheme}
          aria-label="Toggle dark mode"
          class="ms-auto rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        ) {
          svg class="size-4 dark:hidden" viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round aria-hidden=true {
            circle cx=12 cy=12 r=4
            path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          }
          svg class="hidden size-4 dark:block" viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=2 stroke-linecap=round stroke-linejoin=round aria-hidden=true {
            path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
          }
        }
      }
    }

    main class="flex min-h-0 flex-1 flex-col" {
      @render children()
    }
  }
</template>
