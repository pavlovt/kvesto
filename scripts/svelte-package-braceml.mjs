#!/usr/bin/env node
// svelte-package writes .d.ts files from the source as written, and its type generator can't read
// <template lang="braceml">. So compile the BraceML blocks into a temporary copy of src/lib first
// (TypeScript kept), then package that copy. The published .svelte files contain plain Svelte markup.
// Usage (from a package folder): node ../../scripts/svelte-package-braceml.mjs
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { preprocess } from "svelte/compiler";
import { braceml } from "@braceml/svelte";

const pkg = process.cwd();
const tmp = join(pkg, ".braceml-package");
rmSync(tmp, { recursive: true, force: true });
cpSync(join(pkg, "src", "lib"), tmp, { recursive: true });

async function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith(".svelte")) {
      const src = readFileSync(p, "utf8");
      if (!src.includes('lang="braceml"')) continue;
      const { code } = await preprocess(src, [braceml()], { filename: p });
      writeFileSync(p, code);
    }
  }
}
await walk(tmp);

const bin = join(pkg, "node_modules", ".bin", process.platform === "win32" ? "svelte-package.cmd" : "svelte-package");
const res = spawnSync(bin, ["-i", ".braceml-package", "-o", "dist"], {
  cwd: pkg,
  stdio: "inherit",
  shell: process.platform === "win32",
});
rmSync(tmp, { recursive: true, force: true });

// Declaration maps would point at the temporary copy, which isn't published.
function dropMaps(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) dropMaps(p);
    else if (e.name.endsWith(".d.ts.map")) rmSync(p);
  }
}
if (res.status === 0) dropMaps(join(pkg, "dist"));
process.exit(res.status ?? 1);
