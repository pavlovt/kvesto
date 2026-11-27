import { randomUUID } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import type { SurveyStorage, SurveySummary } from "@kvesto/core";
import { textOf, type ResponseInput, type Survey, type SurveyResponse } from "@kvesto/schema";

/** The survey's title in its default locale, for listings. */
const titleOf = (survey: Survey) => textOf(survey.title, survey.defaultLocale, survey.defaultLocale);
import { files, responses, surveys } from "./db/schema.js";
import type { KvestoDb } from "./db/sqlite.js";

/**
 * Persistence used by the REST API. It implements the same `SurveyStorage`
 * contract as the core adapters, plus a few server-only queries, so you can
 * swap it for your own implementation (another database, an existing system).
 */
export interface StoredFile {
  id: string;
  surveyId: string;
  questionId: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

/** Which responses a listing returns. */
export type ResponseFilter = "complete" | "partial" | "all";

export interface SurveyRepository extends Required<Omit<SurveyStorage, "uploadFile" | "saveProgress" | "loadProgress">> {
  surveyExists(id: string): Promise<boolean>;
  createSurvey(survey: Survey): Promise<Survey>;
  countResponses(surveyId: string, status?: ResponseFilter): Promise<number>;
  listResponsesPage(surveyId: string, opts: { limit: number; offset: number; status?: ResponseFilter }): Promise<SurveyResponse[]>;
  /** Store a partial response with the hash of its resume token's secret. */
  savePartialResponse(surveyId: string, input: ResponseInput, tokenHash: string): Promise<SurveyResponse>;
  /** A response with its token hash, for checking a resume token. */
  loadResponse(surveyId: string, responseId: string): Promise<{ response: SurveyResponse; tokenHash: string | null } | null>;
  /** Replace a response's answers and meta, and set its status. */
  updateResponse(surveyId: string, responseId: string, input: ResponseInput): Promise<SurveyResponse>;
  /** Store an uploaded file's bytes (limits are already checked by the API). */
  saveFile(file: Omit<StoredFile, "id" | "createdAt">, data: Uint8Array): Promise<StoredFile>;
  loadFile(surveyId: string, fileId: string): Promise<{ file: StoredFile; data: Uint8Array } | null>;
}

function toResponse(row: typeof responses.$inferSelect): SurveyResponse {
  return {
    id: row.id,
    surveyId: row.surveyId,
    answers: row.answers,
    ...(row.meta ? { meta: row.meta } : {}),
    status: row.status,
    createdAt: row.createdAt,
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
  };
}

const byStatus = (surveyId: string, status: ResponseFilter = "complete") =>
  status === "all" ? eq(responses.surveyId, surveyId) : and(eq(responses.surveyId, surveyId), eq(responses.status, status));

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
        .values({ id: survey.id, title: titleOf(survey), schemaVersion: survey.schemaVersion, definition: survey, createdAt: ts, updatedAt: ts })
        .run();
      return survey;
    },
    async saveSurvey(survey) {
      const ts = now();
      await db
        .insert(surveys)
        .values({ id: survey.id, title: titleOf(survey), schemaVersion: survey.schemaVersion, definition: survey, createdAt: ts, updatedAt: ts })
        .onConflictDoUpdate({
          target: surveys.id,
          set: { title: titleOf(survey), schemaVersion: survey.schemaVersion, definition: survey, updatedAt: ts },
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
        .leftJoin(responses, and(eq(responses.surveyId, surveys.id), eq(responses.status, "complete")))
        .groupBy(surveys.id)
        .orderBy(desc(surveys.updatedAt))
        .all();
      return rows;
    },
    async saveResponse(surveyId: string, input: ResponseInput) {
      const ts = now();
      const row = {
        id: randomUUID(),
        surveyId,
        answers: input.answers,
        meta: input.meta ?? null,
        status: "complete" as const,
        createdAt: ts,
        updatedAt: ts,
        resumeTokenHash: null,
      };
      await db.insert(responses).values(row).run();
      return toResponse(row);
    },
    async savePartialResponse(surveyId, input, tokenHash) {
      const ts = now();
      const row = {
        id: randomUUID(),
        surveyId,
        answers: input.answers,
        meta: input.meta ?? null,
        status: "partial" as const,
        createdAt: ts,
        updatedAt: ts,
        resumeTokenHash: tokenHash,
      };
      await db.insert(responses).values(row).run();
      return toResponse(row);
    },
    async loadResponse(surveyId, responseId) {
      const row = await db
        .select()
        .from(responses)
        .where(and(eq(responses.surveyId, surveyId), eq(responses.id, responseId)))
        .get();
      return row ? { response: toResponse(row), tokenHash: row.resumeTokenHash } : null;
    },
    async updateResponse(surveyId, responseId, input) {
      const status = input.status ?? "complete";
      await db
        .update(responses)
        .set({ answers: input.answers, meta: input.meta ?? null, status, updatedAt: now() })
        .where(and(eq(responses.surveyId, surveyId), eq(responses.id, responseId)))
        .run();
      return (await this.loadResponse(surveyId, responseId))!.response;
    },
    async countResponses(surveyId, status) {
      const row = await db.select({ n: count() }).from(responses).where(byStatus(surveyId, status)).get();
      return row?.n ?? 0;
    },
    async listResponsesPage(surveyId, { limit, offset, status }) {
      const rows = await db
        .select()
        .from(responses)
        .where(byStatus(surveyId, status))
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
    async saveFile(input, data) {
      const file: StoredFile = { ...input, id: randomUUID(), createdAt: now() };
      await db.insert(files).values({ ...file, data }).run();
      return file;
    },
    async loadFile(surveyId, fileId) {
      const row = await db
        .select()
        .from(files)
        .where(and(eq(files.surveyId, surveyId), eq(files.id, fileId)))
        .get();
      if (!row) return null;
      const { data, ...file } = row;
      return { file, data: new Uint8Array(data) };
    },
  };
  return repo;
}
