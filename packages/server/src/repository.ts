import { randomUUID } from "node:crypto";
import { count, desc, eq } from "drizzle-orm";
import type { SurveyStorage, SurveySummary } from "@kvesto/core";
import type { ResponseInput, Survey, SurveyResponse } from "@kvesto/schema";
import { responses, surveys } from "./db/schema.js";
import type { KvestoDb } from "./db/sqlite.js";

/**
 * Persistence used by the REST API. It implements the same `SurveyStorage`
 * contract as the core adapters, plus a few server-only queries, so you can
 * swap it for your own implementation (another database, an existing system).
 */
export interface SurveyRepository extends Required<SurveyStorage> {
  surveyExists(id: string): Promise<boolean>;
  createSurvey(survey: Survey): Promise<Survey>;
  countResponses(surveyId: string): Promise<number>;
  listResponsesPage(surveyId: string, opts: { limit: number; offset: number }): Promise<SurveyResponse[]>;
}

function toResponse(row: typeof responses.$inferSelect): SurveyResponse {
  return {
    id: row.id,
    surveyId: row.surveyId,
    answers: row.answers,
    ...(row.meta ? { meta: row.meta } : {}),
    createdAt: row.createdAt,
  };
}

export function drizzleRepository(db: KvestoDb): SurveyRepository {
  const now = () => new Date().toISOString();

  const repo: SurveyRepository = {
    async surveyExists(id) {
      return (await db.select({ id: surveys.id }).from(surveys).where(eq(surveys.id, id)).get()) !== undefined;
    },
    async loadSurvey(id) {
      const row = await db.select().from(surveys).where(eq(surveys.id, id)).get();
      return row?.definition ?? null;
    },
    async createSurvey(survey) {
      const ts = now();
      await db
        .insert(surveys)
        .values({ id: survey.id, title: survey.title, schemaVersion: survey.schemaVersion, definition: survey, createdAt: ts, updatedAt: ts })
        .run();
      return survey;
    },
    async saveSurvey(survey) {
      const ts = now();
      await db
        .insert(surveys)
        .values({ id: survey.id, title: survey.title, schemaVersion: survey.schemaVersion, definition: survey, createdAt: ts, updatedAt: ts })
        .onConflictDoUpdate({
          target: surveys.id,
          set: { title: survey.title, schemaVersion: survey.schemaVersion, definition: survey, updatedAt: ts },
        })
        .run();
      return survey;
    },
    async deleteSurvey(id) {
      await db.delete(surveys).where(eq(surveys.id, id)).run();
    },
    async listSurveys(): Promise<SurveySummary[]> {
      const rows = await db
        .select({ id: surveys.id, title: surveys.title, updatedAt: surveys.updatedAt, responseCount: count(responses.id) })
        .from(surveys)
        .leftJoin(responses, eq(responses.surveyId, surveys.id))
        .groupBy(surveys.id)
        .orderBy(desc(surveys.updatedAt))
        .all();
      return rows;
    },
    async saveResponse(surveyId: string, input: ResponseInput) {
      const row = {
        id: randomUUID(),
        surveyId,
        answers: input.answers,
        meta: input.meta ?? null,
        createdAt: now(),
      };
      await db.insert(responses).values(row).run();
      return toResponse(row);
    },
    async countResponses(surveyId) {
      const row = await db.select({ n: count() }).from(responses).where(eq(responses.surveyId, surveyId)).get();
      return row?.n ?? 0;
    },
    async listResponsesPage(surveyId, { limit, offset }) {
      const rows = await db
        .select()
        .from(responses)
        .where(eq(responses.surveyId, surveyId))
        .orderBy(desc(responses.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
      return rows.map(toResponse);
    },
    async listResponses(surveyId) {
      const rows = await db.select().from(responses).where(eq(responses.surveyId, surveyId)).all();
      return rows.map(toResponse);
    },
  };
  return repo;
}
