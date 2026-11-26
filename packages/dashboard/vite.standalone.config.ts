import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Prebuilt bundle for apps that don't compile Svelte (React, Vue, plain JS): Svelte and the
// core are bundled in and the component CSS is injected at runtime.
export default defineConfig({
  plugins: [svelte({ compilerOptions: { css: "injected" } })],
  build: {
    outDir: "dist/standalone",
    emptyOutDir: true,
    lib: { entry: "src/standalone.ts", formats: ["es"], fileName: () => "index.js" },
    rollupOptions: {
      // Zod's comments trip Rollup's annotation parser; the warning is harmless.
      onwarn(warning, warn) {
        if (warning.code !== "INVALID_ANNOTATION") warn(warning);
      },
    },
  },
});
