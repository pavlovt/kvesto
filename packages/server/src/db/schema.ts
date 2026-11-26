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
    createdAt: text("created_at").notNull(),
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
