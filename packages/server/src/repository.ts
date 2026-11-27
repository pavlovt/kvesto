import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { SurveyStorage, SurveySummary } from "@kvesto/core";
import { textOf, type ResponseInput, type Survey, type SurveyResponse } from "@kvesto/schema";

/** The survey's title in its default locale, for listings. */
const titleOf = (survey: Survey) => textOf(survey.title, survey.defaultLocale, survey.defaultLocale);
import { files, responses, surveys, webhookDeliveries, webhooks } from "./db/schema.js";
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
export type ResponseStatusFilter = "complete" | "partial" | "all";
export interface ResponseFilter {
  status?: ResponseStatusFilter;
  /** Hidden field values the response must have. */
  hidden?: Record<string, string>;
  /** Answers (top-level question id → value as text) the response must have. */
  answers?: Record<string, string>;
  /** Created on or after / on or before (ISO strings, compared as text). */
  from?: string;
  to?: string;
}

/** Where a page of responses starts: after this one (newest first). */
export interface ResponseCursor {
  createdAt: string;
  id: string;
}

/** A webhook as stored (the secret is only shown when it is created). */
export interface StoredWebhook {
  id: string;
  surveyId: string;
  url: string;
  events: string[];
  secret: string;
  createdAt: string;
}

export interface StoredDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Who a response is from: the respondent's id (unless the survey is anonymous) and the hash `oneResponsePer` uses. */
export interface RespondentRecord {
  id?: string | null;
  key?: string | null;
}

export interface SurveyRepository extends Required<Omit<SurveyStorage, "uploadFile" | "saveProgress" | "loadProgress">> {
  saveResponse(surveyId: string, input: ResponseInput, opts?: { resumeToken?: string; respondent?: RespondentRecord }): Promise<SurveyResponse>;
  surveyExists(id: string): Promise<boolean>;
  /** Whether a response with this respondent key exists (any status). */
  hasRespondent(surveyId: string, key: string): Promise<boolean>;
  createSurvey(survey: Survey): Promise<Survey>;
  countResponses(surveyId: string, filter?: ResponseFilter): Promise<number>;
  listResponsesPage(
    surveyId: string,
    opts: { limit: number; offset: number; after?: ResponseCursor } & ResponseFilter,
  ): Promise<SurveyResponse[]>;
  /** Store a partial response with the hash of its resume token's secret. */
  savePartialResponse(surveyId: string, input: ResponseInput, tokenHash: string, respondent?: RespondentRecord): Promise<SurveyResponse>;
  /** A response with its token hash, for checking a resume token. */
  loadResponse(surveyId: string, responseId: string): Promise<{ response: SurveyResponse; tokenHash: string | null } | null>;
  /** Replace a response's answers and meta, and set its status. */
  updateResponse(surveyId: string, responseId: string, input: ResponseInput): Promise<SurveyResponse>;
  createWebhook(webhook: Omit<StoredWebhook, "id" | "createdAt">): Promise<StoredWebhook>;
  listWebhooks(surveyId: string): Promise<StoredWebhook[]>;
  deleteWebhook(surveyId: string, webhookId: string): Promise<boolean>;
  createDelivery(delivery: Pick<StoredDelivery, "webhookId" | "event" | "payload">): Promise<StoredDelivery>;
  updateDelivery(id: string, patch: Partial<Omit<StoredDelivery, "id" | "webhookId">>): Promise<void>;
  /** A webhook's deliveries, newest first. */
  listDeliveries(webhookId: string, limit: number): Promise<StoredDelivery[]>;
  /** Deliveries still waiting, due at or before `now` (an ISO time), oldest first. */
  dueDeliveries(now: string, limit: number): Promise<(StoredDelivery & { url: string; secret: string })[]>;
  /** Store an uploaded file's bytes (limits are already checked by the API). */
  saveFile(file: Omit<StoredFile, "id" | "createdAt">, data: Uint8Array): Promise<StoredFile>;
  loadFile(surveyId: string, fileId: string): Promise<{ file: StoredFile; data: Uint8Array } | null>;
  /** Bytes of all the files uploaded to a survey. */
  fileBytes(surveyId: string): Promise<number>;
  /** The sizes of these files of a survey, by id (missing ids are left out). */
  fileSizes(surveyId: string, fileIds: string[]): Promise<Record<string, number>>;
  /** Delete files uploaded before `before` (an ISO time) that no response refers to. Returns how many. */
  deleteOrphanFiles(before: string): Promise<number>;
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
    ...(row.respondentId ? { respondentId: row.respondentId } : {}),
  };
}

const byFilter = (surveyId: string, { status = "complete", hidden = {}, answers = {}, from, to }: ResponseFilter = {}) =>
  and(
    eq(responses.surveyId, surveyId),
    ...(status === "all" ? [] : [eq(responses.status, status)]),
    // Names are checked by the API (letters, digits, - and _), and values are bound parameters.
    ...Object.entries(hidden).map(([name, value]) => sql`json_extract(${responses.meta}, ${`$.hidden.${name}`}) = ${value}`),
    // Numbers and booleans compare as their text, so `score:5` matches 5.
    ...Object.entries(answers).map(([q, value]) => sql`CAST(json_extract(${responses.answers}, ${`$.${q}`}) AS TEXT) = ${value}`),
    ...(from ? [gte(responses.createdAt, from)] : []),
    ...(to ? [lte(responses.createdAt, to)] : []),
  );

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
    async saveResponse(surveyId: string, input: ResponseInput, opts?: { respondent?: RespondentRecord }) {
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
        respondentId: opts?.respondent?.id ?? null,
        respondentKey: opts?.respondent?.key ?? null,
      };
      await db.insert(responses).values(row).run();
      return toResponse(row);
    },
    async savePartialResponse(surveyId, input, tokenHash, respondent) {
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
        respondentId: respondent?.id ?? null,
        respondentKey: respondent?.key ?? null,
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
    async hasRespondent(surveyId, key) {
      const row = await db
        .select({ id: responses.id })
        .from(responses)
        .where(and(eq(responses.surveyId, surveyId), eq(responses.respondentKey, key)))
        .get();
      return row !== undefined;
    },
    async countResponses(surveyId, filter) {
      const row = await db.select({ n: count() }).from(responses).where(byFilter(surveyId, filter)).get();
      return row?.n ?? 0;
    },
    async listResponsesPage(surveyId, { limit, offset, after, ...filter }) {
      // Keyset paging: newest first, ties broken by id, so pages never skip or repeat a response.
      const page = after
        ? or(lt(responses.createdAt, after.createdAt), and(eq(responses.createdAt, after.createdAt), lt(responses.id, after.id)))
        : undefined;
      const rows = await db
        .select()
        .from(responses)
        .where(and(byFilter(surveyId, filter), page))
        .orderBy(desc(responses.createdAt), desc(responses.id))
        .limit(limit)
        .offset(after ? 0 : offset)
        .all();
      return rows.map(toResponse);
    },
    async listResponses(surveyId) {
      const rows = await db.select().from(responses).where(eq(responses.surveyId, surveyId)).all();
      return rows.map(toResponse);
    },
    async createWebhook(input) {
      const row = { ...input, id: randomUUID(), createdAt: now() };
      await db.insert(webhooks).values(row).run();
      return row;
    },
    async listWebhooks(surveyId) {
      return db.select().from(webhooks).where(eq(webhooks.surveyId, surveyId)).orderBy(webhooks.createdAt).all();
    },
    async deleteWebhook(surveyId, webhookId) {
      const r = await db.delete(webhooks).where(and(eq(webhooks.surveyId, surveyId), eq(webhooks.id, webhookId))).run();
      return r.changes > 0;
    },
    async createDelivery(input) {
      const ts = now();
      const row = {
        ...input,
        id: randomUUID(),
        status: "pending" as const,
        attempts: 0,
        lastStatusCode: null,
        lastError: null,
        nextAttemptAt: ts,
        createdAt: ts,
        updatedAt: ts,
      };
      await db.insert(webhookDeliveries).values(row).run();
      return row;
    },
    async updateDelivery(id, patch) {
      await db.update(webhookDeliveries).set({ ...patch, updatedAt: now() }).where(eq(webhookDeliveries.id, id)).run();
    },
    async listDeliveries(webhookId, limit) {
      return db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, webhookId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(limit)
        .all();
    },
    async dueDeliveries(at, limit) {
      const rows = await db
        .select({ d: webhookDeliveries, url: webhooks.url, secret: webhooks.secret })
        .from(webhookDeliveries)
        .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
        .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, at)))
        .orderBy(webhookDeliveries.nextAttemptAt)
        .limit(limit)
        .all();
      return rows.map((r) => ({ ...r.d, url: r.url, secret: r.secret }));
    },
    async saveFile(input, data) {
      const file: StoredFile = { ...input, id: randomUUID(), createdAt: now() };
      await db.insert(files).values({ ...file, data }).run();
      return file;
    },
    async fileBytes(surveyId) {
      const row = await db.select({ n: sql<number>`coalesce(sum(${files.size}), 0)` }).from(files).where(eq(files.surveyId, surveyId)).get();
      return Number(row?.n ?? 0);
    },
    async fileSizes(surveyId, fileIds) {
      if (!fileIds.length) return {};
      const rows = await db
        .select({ id: files.id, size: files.size })
        .from(files)
        .where(and(eq(files.surveyId, surveyId), inArray(files.id, fileIds)))
        .all();
      return Object.fromEntries(rows.map((r) => [r.id, r.size]));
    },
    async deleteOrphanFiles(before) {
      // A response refers to a file through its URL, which ends in the file id.
      const result = await db
        .delete(files)
        .where(
          and(
            lt(files.createdAt, before),
            sql`not exists (select 1 from ${responses} where ${responses.surveyId} = ${files.surveyId} and instr(${responses.answers}, ${files.id}) > 0)`,
          ),
        )
        .run();
      return result.changes;
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
