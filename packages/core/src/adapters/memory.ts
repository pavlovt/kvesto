import { textOf, type ResponseInput, type Survey, type SurveyResponse } from "@kvesto/schema";
import { fileToDataUrl } from "../files.js";
import { newId, type SurveyStorage, type SurveySummary } from "../storage.js";

/** Keeps everything in memory. Handy for tests, demos and previews. */
export function memoryStorage(seed: Survey[] = []): Required<SurveyStorage> {
  const surveys = new Map<string, Survey>(seed.map((s) => [s.id, structuredClone(s)]));
  const responses = new Map<string, SurveyResponse[]>();

  return {
    async loadSurvey(id) {
      const s = surveys.get(id);
      return s ? structuredClone(s) : null;
    },
    async saveSurvey(survey) {
      surveys.set(survey.id, structuredClone(survey));
      return structuredClone(survey);
    },
    async deleteSurvey(id) {
      surveys.delete(id);
      responses.delete(id);
    },
    async listSurveys(): Promise<SurveySummary[]> {
      return [...surveys.values()].map((s) => ({
        id: s.id,
        title: textOf(s.title, s.defaultLocale, s.defaultLocale),
        responseCount: responses.get(s.id)?.length ?? 0,
      }));
    },
    async saveResponse(surveyId: string, input: ResponseInput) {
      const response: SurveyResponse = {
        ...structuredClone(input),
        id: newId(),
        surveyId,
        createdAt: new Date().toISOString(),
      };
      const list = responses.get(surveyId) ?? [];
      list.push(response);
      responses.set(surveyId, list);
      return structuredClone(response);
    },
    async listResponses(surveyId) {
      return structuredClone(responses.get(surveyId) ?? []);
    },
    // Files live inside the answer as data URLs.
    uploadFile: (_surveyId, _questionId, file) => fileToDataUrl(file),
  };
}
