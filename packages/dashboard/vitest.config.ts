import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte()], // reads svelte.config.js, so BraceML is compiled
  resolve: { conditions: ["browser"] },
  test: { environment: "happy-dom", include: ["test/**/*.test.ts"] },
});
