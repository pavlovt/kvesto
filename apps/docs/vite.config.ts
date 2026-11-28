import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // the pages are markdown files from the repo (docs/, packages/*/README.md)
  server: { fs: { allow: ["../.."] } },
});
