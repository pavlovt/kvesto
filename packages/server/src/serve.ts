#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { apiKeyAuth } from "./auth.js";
import { createSqliteDb } from "./db/sqlite.js";
import { encryptionFromEnv } from "./encryption.js";
import { drizzleRepository } from "./repository.js";

const port = Number(process.env.PORT ?? 3000);
const dbFile = process.env.KVESTO_DB ?? "kvesto.db";

// Comma-separated admin keys. Without them the server is open (fine on localhost, not on the internet).
const keys = (process.env.KVESTO_API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);

// Comma-separated origins allowed to call the admin routes from a browser (your editor and dashboard). Without
// API keys (local development) the default is the apps' dev servers.
const adminOrigins = (process.env.KVESTO_ADMIN_ORIGINS ?? (keys.length ? "" : "http://localhost:5173,http://localhost:5174"))
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// `id:base64key,id:base64key` (32-byte keys, the first one current) encrypts pii answers and files at rest.
const encryption = encryptionFromEnv(process.env.KVESTO_ENCRYPTION_KEYS);
const repository = drizzleRepository(createSqliteDb(dbFile), encryption ? { encryption } : {});

// `kvesto-server reencrypt`: encrypt everything with the current key, then exit.
if (process.argv[2] === "reencrypt") {
  const done = await repository.reencrypt();
  console.log(`Re-encrypted ${done.responses} responses and ${done.files} files with key "${encryption!.current}"`);
  process.exit(0);
}

const app = createApp({
  repository,
  ...(keys.length ? { authorize: apiKeyAuth({ keys }) } : {}),
  adminCors: adminOrigins.length ? adminOrigins : false,
  // Rate limits are on unless KVESTO_RATE_LIMIT=off. Behind a proxy, set KVESTO_TRUST_PROXY to the number of proxies.
  rateLimit: process.env.KVESTO_RATE_LIMIT !== "off",
  clientAddress: { trustProxy: Number(process.env.KVESTO_TRUST_PROXY ?? 0) || 0 },
  ...(process.env.KVESTO_SECRET ? { signingSecret: process.env.KVESTO_SECRET, respondentSecret: process.env.KVESTO_SECRET } : {}),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Kvesto API on http://localhost:${info.port} (docs at /docs, database ${dbFile})`);
});
