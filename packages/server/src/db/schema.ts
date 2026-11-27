import { blob, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Answers, Survey } from "@kvesto/schema";

export const surveys = sqliteTable("surveys", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  /** The full survey JSON document. */
  definition: text("definition", { mode: "json" }).$type<Survey>().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const responses = sqliteTable(
  "responses",
  {
    id: text("id").primaryKey(),
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    answers: text("answers", { mode: "json" }).$type<Answers>().notNull(),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    /** "partial" while the respondent is still going, "complete" once submitted. */
    status: text("status", { enum: ["partial", "complete"] }).notNull().default("complete"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at"),
    /** SHA-256 of the secret part of a partial response's resume token. Never the token itself. */
    resumeTokenHash: text("resume_token_hash"),
  },
  (t) => [index("responses_survey_id_idx").on(t.surveyId, t.createdAt)],
);

/** Files uploaded to file questions. Deleted with their survey. */
export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    size: integer("size").notNull(),
    data: blob("data", { mode: "buffer" }).$type<Uint8Array>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("files_survey_id_idx").on(t.surveyId)],
);

/** Where to send events about a survey's responses. */
export const webhooks = sqliteTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    surveyId: text("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** The events to send, e.g. ["response.completed"]. */
    events: text("events", { mode: "json" }).$type<string[]>().notNull(),
    /** Signs each delivery (HMAC-SHA256). Shown once, when the webhook is created. */
    secret: text("secret").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("webhooks_survey_id_idx").on(t.surveyId)],
);

/** Each attempt to send an event, for the delivery log and retries. */
export const webhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    /** The exact body sent, so retries send the same bytes and signature input. */
    payload: text("payload").notNull(),
    status: text("status", { enum: ["pending", "succeeded", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    nextAttemptAt: text("next_attempt_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("webhook_deliveries_webhook_id_idx").on(t.webhookId, t.createdAt)],
);
