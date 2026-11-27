/** Masking personal data (questions marked `pii`) in responses. */
import { walkElements, type Answers, type Survey, type SurveyResponse } from "@kvesto/schema";

/** What a masked answer shows. */
export const MASKED = "[redacted]";

/** The ids of the survey's `pii` questions, including those inside repeating panels. */
export function piiQuestions(survey: Survey): Set<string> {
  const ids = new Set<string>();
  walkElements(survey, (el) => {
    if ("pii" in el && el.pii) ids.add(el.id);
  });
  return ids;
}

/** The answers with every `pii` answer (also inside repeat items) replaced by `MASKED`. */
export function maskAnswers(survey: Survey, answers: Answers, pii = piiQuestions(survey)): Answers {
  if (!pii.size) return answers;
  const mask = (record: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(record).map(([k, v]) => {
        if (pii.has(k)) return [k, v === undefined || v === null || v === "" ? v : MASKED];
        // A repeating panel's items are records of answers.
        if (Array.isArray(v) && v.every((x) => x && typeof x === "object" && !Array.isArray(x) && !("url" in x))) {
          return [k, v.map((item) => mask(item as Record<string, unknown>))];
        }
        return [k, v];
      }),
    );
  return mask(answers) as Answers;
}

/** The response with its `pii` answers masked. */
export function maskResponse<T extends Pick<SurveyResponse, "answers">>(survey: Survey, response: T, pii = piiQuestions(survey)): T {
  return pii.size ? { ...response, answers: maskAnswers(survey, response.answers, pii) } : response;
}
