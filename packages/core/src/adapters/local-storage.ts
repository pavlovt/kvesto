import { textOf, type Survey, type SurveyResponse } from "@kvesto/schema";
import { fileToDataUrl } from "../files.js";
import { newId, type ProgressDraft, type SurveyStorage } from "../storage.js";

export interface LocalStorageOptions {
  /** Key prefix. Default "kvesto". */
  prefix?: string;
  /** Any Web Storage implementation. Default `globalThis.localStorage`. */
  storage?: Storage;
}

/** Persists surveys and responses in the browser. No server needed. */
export function localStorageStorage(options: LocalStorageOptions = {}): Required<SurveyStorage> {
  const prefix = options.prefix ?? "kvesto";
  const store = () => {
    const s = options.storage ?? globalThis.localStorage;
    if (!s) throw new Error("localStorageStorage: no Web Storage available in this environment");
    return s;
  };
  const read = <T>(key: string, fallback: T): T => {
    const raw = store().getItem(`${prefix}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  };
  const write = (key: string, value: unknown) => store().setItem(`${prefix}:${key}`, JSON.stringify(value));
  const index = () => read<string[]>("surveys", []);

  return {
    async loadSurvey(id) {
      return read<Survey | null>(`survey:${id}`, null);
    },
    async saveSurvey(survey) {
      write(`survey:${survey.id}`, survey);
      const ids = index();
      if (!ids.includes(survey.id)) write("surveys", [...ids, survey.id]);
      return survey;
    },
    async deleteSurvey(id) {
      store().removeItem(`${prefix}:survey:${id}`);
      store().removeItem(`${prefix}:responses:${id}`);
      write("surveys", index().filter((x) => x !== id));
    },
    async listSurveys() {
      return index().flatMap((id) => {
        const s = read<Survey | null>(`survey:${id}`, null);
        return s
          ? [{ id, title: textOf(s.title, s.defaultLocale, s.defaultLocale), responseCount: read<SurveyResponse[]>(`responses:${id}`, []).length }]
          : [];
      });
    },
    // Drafts stay in this browser, one per survey: the token only tells a new draft from an old one.
    async saveProgress(surveyId, draft) {
      const token = draft.token ?? newId();
      write(`progress:${surveyId}`, { ...draft, token });
      return { token };
    },
    async loadProgress(surveyId, token) {
      const d = read<ProgressDraft | null>(`progress:${surveyId}`, null);
      return d && d.token === token ? d : null;
    },
    async saveResponse(surveyId, input, options) {
      if (options?.resumeToken) store().removeItem(`${prefix}:progress:${surveyId}`);
      const response: SurveyResponse = { ...input, id: newId(), surveyId, createdAt: new Date().toISOString() };
      write(`responses:${surveyId}`, [...read<SurveyResponse[]>(`responses:${surveyId}`, []), response]);
      return response;
    },
    async listResponses(surveyId) {
      return read<SurveyResponse[]>(`responses:${surveyId}`, []);
    },
    // Files live inside the answer as data URLs. Browsers cap localStorage at
    // a few MB, so set `maxSize` on file questions.
    uploadFile: (_surveyId, _questionId, file) => fileToDataUrl(file),
  };
}
