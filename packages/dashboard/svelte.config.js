import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { braceml } from "@braceml/svelte";

/** Markup is written in BraceML; svelte-package compiles it, so the published components are plain Svelte. */
export default {
  preprocess: [braceml(), vitePreprocess()],
};
