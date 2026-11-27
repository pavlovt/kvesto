// Writes dist/survey.schema.json from the built Zod schemas. Runs after tsc.
import { writeFileSync } from "node:fs";
import { surveyJsonSchema } from "../dist/index.js";

writeFileSync(new URL("../dist/survey.schema.json", import.meta.url), JSON.stringify(surveyJsonSchema(), null, 2) + "\n");
