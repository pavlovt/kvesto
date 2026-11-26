import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { braceml } from "@braceml/svelte";

/** Markup is written in BraceML: <template lang="braceml"> blocks are compiled before Svelte sees them. */
/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: [braceml(), vitePreprocess()],
  kit: {
    adapter: adapter({ fallback: "index.html" }),
  },
};
