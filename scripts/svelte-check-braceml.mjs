#!/usr/bin/env node
// svelte-check reads .svelte files as written, so it can't see markup inside
// <template lang="braceml">. This script compiles the BraceML blocks into a
// throwaway copy of the app and type-checks that copy instead.
// Usage (from an app folder): node ../../scripts/svelte-check-braceml.mjs
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { preprocess } from "svelte/compiler";
import { braceml } from "@braceml/svelte";

const app = process.cwd();
const out = join(app, ".svelte-kit", "braceml-check");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const entry of readdirSync(app)) {
  if ([".svelte-kit", "node_modules", "build"].includes(entry)) continue;
  cpSync(join(app, entry), join(out, entry), { recursive: true });
}
symlinkSync(join(app, "node_modules"), join(out, "node_modules"), "dir");

async function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith(".svelte")) {
      const src = readFileSync(p, "utf8");
      if (!src.includes('lang="braceml"')) continue;
      const { code } = await preprocess(src, [braceml()], { filename: relative(out, p) });
      writeFileSync(p, code);
    }
  }
}
await walk(join(out, "src"));

const bin = (name) => join(app, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const run = (cmd, args) => spawnSync(bin(cmd), args, { cwd: out, stdio: "inherit", shell: process.platform === "win32" });
if (existsSync(join(out, "svelte.config.js"))) run("svelte-kit", ["sync"]);
const res = run("svelte-check", ["--tsconfig", "./tsconfig.json", "--threshold", "error", "--output", "human"]);
process.exit(res.status ?? 1);
