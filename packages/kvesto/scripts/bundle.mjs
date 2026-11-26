import { build } from "esbuild";
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

for (const minify of [false, true]) {
  await build({
    entryPoints: ["scripts/browser-entry.ts"],
    bundle: true,
    format: "iife",
    globalName: "Kvesto",
    platform: "browser",
    target: "es2020",
    minify,
    sourcemap: false,
    legalComments: "eof",
    outfile: minify ? "dist/kvesto.min.js" : "dist/kvesto.js",
  });
}

copyFileSync(require.resolve("@kvesto/core/styles.css"), "styles.css");
