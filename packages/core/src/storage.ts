import type { ResponseInput, Survey, SurveyResponse } from "@kvesto/schema";

export interface SurveySummary {
  id: string;
  title: string;
  updatedAt?: string;
  responseCount?: number;
}

/**
 * The only contract between Kvesto and wherever data lives.
 *
 * The core never talks to a backend directly. Pass an implementation of this
 * interface (in-memory, localStorage, HTTP, or your own) to `createSurvey`,
 * or pass none and handle responses in `onComplete`.
 *
 * `listSurveys` and `listResponses` are optional: a runner only needs
 * `loadSurvey` and `saveResponse`; the editor and dashboard use the rest.
 */
export interface SurveyStorage {
  loadSurvey(id: string): Promise<Survey | null>;
  saveSurvey(survey: Survey): Promise<Survey>;
  saveResponse(surveyId: string, response: ResponseInput): Promise<SurveyResponse>;
  listSurveys?(): Promise<SurveySummary[]>;
  listResponses?(surveyId: string): Promise<SurveyResponse[]>;
  deleteSurvey?(id: string): Promise<void>;
}

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
