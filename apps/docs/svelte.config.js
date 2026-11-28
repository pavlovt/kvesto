import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { braceml } from "@braceml/svelte";

/** Markup is written in BraceML: <template lang="braceml"> blocks are compiled before Svelte sees them. */
// GitHub Pages serves the site from /kvesto; locally it runs at the root.
const base = /** @type {"" | `/${string}`} */ (process.env.BASE_PATH ?? "");

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: [braceml(), vitePreprocess()],
  kit: {
    adapter: adapter({ fallback: "404.html" }),
    paths: { base },
    prerender: {
      // /demo/ is the editor app, copied into the site by the Pages workflow
      handleHttpError: ({ path, message }) => {
        if (path.startsWith(`${base}/demo/`)) return;
        throw new Error(message);
      },
    },
  },
};
