// Writes openapi.json for publishing or client generation: pnpm --filter @kvesto/server openapi
import { writeFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { createSqliteDb } from "../src/db/sqlite.js";
import { drizzleRepository } from "../src/repository.js";

const app = createApp({ repository: drizzleRepository(createSqliteDb(":memory:")) });
const res = await app.request("/openapi.json");
writeFileSync("openapi.json", JSON.stringify(await res.json(), null, 2) + "\n");
console.log("Wrote openapi.json");
