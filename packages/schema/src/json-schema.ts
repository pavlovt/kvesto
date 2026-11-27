import { z } from "zod";
import { SURVEY_SCHEMA_VERSION, SurveySchema } from "./schemas.js";

/** Where the published JSON Schema can be fetched (use it as `"$schema"` in survey files). */
export const SURVEY_JSON_SCHEMA_URL = "https://cdn.jsdelivr.net/npm/@kvesto/schema/dist/survey.schema.json";

/**
 * The survey JSON format as a JSON Schema (draft 2020-12), generated from the
 * Zod schemas. It describes survey JSON as authored, so fields with defaults
 * are optional.
 *
 * It checks structure and types. Cross-field rules (unique ids, conditions
 * that refer only to earlier questions, min <= max) are only enforced by
 * `SurveySchema` and `migrateSurvey`.
 */
export function surveyJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(SurveySchema, { io: "input", target: "draft-2020-12" }) as Record<string, unknown>;
  return {
    $schema: schema.$schema,
    $id: SURVEY_JSON_SCHEMA_URL,
    title: `Kvesto survey (schemaVersion ${SURVEY_SCHEMA_VERSION})`,
    ...schema,
  };
}
