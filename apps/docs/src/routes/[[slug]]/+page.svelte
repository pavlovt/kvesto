<script lang="ts">
  import { base } from "$app/paths";
  import { pages, repo } from "$lib/pages";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const href = (slug: string) => `${base}/${slug ? `${slug}/` : ""}`;
</script>

<template lang="braceml">
  svelte:head > title '{data.title} · Kvesto'

  snippet contents() {
    ul class="space-y-1 text-sm" {
      each pages as p (p.slug) {
        li {
          a(
            href={href(p.slug)}
            class="block py-0.5 text-muted-foreground hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            aria-current={p.slug === data.slug ? "page" : undefined}
          ) '{p.title}'
          if p.slug === data.slug && data.toc.length {
            ul class="my-1 space-y-1 border-s ps-3" {
              each data.toc as entry (entry.id) {
                li class:ps-3={entry.depth === 3} {
                  a href="#{entry.id}" class="block text-muted-foreground hover:text-foreground" '{entry.text}'
                }
              }
            }
          }
        }
      }
    }
  }

  div class="mx-auto flex w-full max-w-7xl gap-10 px-4 py-8" {
    nav aria-label=Documentation class="sticky top-4 hidden h-[calc(100dvh-6rem)] w-60 shrink-0 overflow-y-auto lg:block" {
      @render contents()
    }

    div class="min-w-0 max-w-3xl flex-1" {
      details class="mb-6 rounded-md border px-4 py-2 lg:hidden" {
        summary class="cursor-pointer text-sm font-semibold" 'Contents'
        nav aria-label=Documentation class="mt-2" {
          @render contents()
        }
      }

      article class="prose max-w-none dark:prose-invert prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none prose-table:block prose-table:overflow-x-auto" {
        @html data.html
      }
      p class="mt-10 text-sm" {
        a href="{repo}/edit/main/{data.file}" class="text-muted-foreground underline hover:text-foreground" 'Edit this page on GitHub'
      }
    }
  }
</template>
