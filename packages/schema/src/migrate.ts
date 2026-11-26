import { SURVEY_SCHEMA_VERSION, SurveySchema, type Survey } from "./schemas.js";

/**
 * Upgrade survey JSON from any known older `schemaVersion` to the current one,
 * then validate it. Add one step per version bump.
 */
export function migrateSurvey(input: unknown): Survey {
  const doc = (typeof input === "object" && input !== null ? { ...input } : input) as Record<string, unknown>;
  const version = doc?.schemaVersion ?? SURVEY_SCHEMA_VERSION;

  if (typeof version !== "number" || version > SURVEY_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported survey schemaVersion ${String(version)} (this build supports up to ${SURVEY_SCHEMA_VERSION})`,
    );
  }
  // Future: if (version === 1) { doc = v1ToV2(doc); }
  return SurveySchema.parse({ ...doc, schemaVersion: SURVEY_SCHEMA_VERSION });
}
