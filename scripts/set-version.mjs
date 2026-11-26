// Usage: pnpm release:version 0.2.0
// Sets the same version on every published package (packages/*), so they are released together.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm release:version <semver>, e.g. 0.2.0 or 0.2.0-beta.1");
  process.exit(1);
}

for (const dir of readdirSync("packages")) {
  const file = `packages/${dir}/package.json`;
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  if (pkg.private) continue;
  pkg.version = version;
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${pkg.name}@${version}`);
}
console.log(`\nNext: git commit -am "Release v${version}" && git tag v${version} && git push origin main v${version}`);
