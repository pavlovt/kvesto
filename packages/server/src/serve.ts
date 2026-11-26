#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createSqliteDb } from "./db/sqlite.js";
import { drizzleRepository } from "./repository.js";

const port = Number(process.env.PORT ?? 3000);
const dbFile = process.env.KVESTO_DB ?? "kvesto.db";

const app = createApp({ repository: drizzleRepository(createSqliteDb(dbFile)) });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Kvesto API on http://localhost:${info.port} (docs at /docs, database ${dbFile})`);
});
