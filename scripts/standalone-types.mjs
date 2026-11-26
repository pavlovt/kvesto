#!/usr/bin/env node
// Types for a package's prebuilt `standalone` bundle. src/standalone.ts only re-exports from ./lib, and
// svelte-package already wrote declarations for ./lib into dist, so the same file with its paths pointed
// at dist is a valid declaration file. Run from the package folder after svelte-package and vite build.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("src/standalone.ts", "utf8");
if (!/^(\s*(export\s.*from\s.*;|\/\/.*)?\s*)*$/.test(src)) {
  console.error("src/standalone.ts must contain only `export ... from` lines");
  process.exit(1);
}
writeFileSync("dist/standalone/index.d.ts", src.replaceAll('"./lib/', '"../'));
