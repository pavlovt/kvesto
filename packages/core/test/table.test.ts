import { describe, expect, it } from "vitest";
import { filterResponses, migrateSurvey, responseColumns, responseRow } from "../src/index.js";

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "t",
  title: "T",
  pages: [
    {
      id: "p",
      elements: [
        { id: "role", type: "single-choice", title: "Role", choices: [{ value: "dev", label: "Developer" }] },
        { id: "g", type: "grid", title: "Grid", rows: [{ value: "r", label: "Row" }], columns: [{ value: "n", label: "N", cellType: "number" }] },
        { id: "kids", type: "panel", repeat: {}, elements: [{ id: "kid", type: "text", title: "Kid" }] },
      ],
    },
  ],
});
const responses = [
  { id: "1", surveyId: "t", createdAt: "2026-01-01T00:00:00.000Z", answers: { role: "dev", g: { r: { n: 3 } }, kids: [{ kid: "Ana" }, { kid: "Ivo" }] } },
  { id: "2", surveyId: "t", createdAt: "2026-02-01T00:00:00.000Z", status: "partial" as const, answers: {}, meta: { hidden: { src: "ad" } } },
];

describe("response table", () => {
  it("flattens grids and repeat items into columns, as labels or values", () => {
    const cols = responseColumns(survey, responses);
    expect(cols.map((c) => c.key)).toEqual(["role", "g.r.n", "kids.1.kid", "kids.2.kid"]);
    expect(cols.map((c) => c.label)).toEqual(["Role", "Grid: Row / N", "Kid (1)", "Kid (2)"]);
    expect(responseRow(survey, cols, responses[0]!)).toEqual({ role: "Developer", "g.r.n": "3", "kids.1.kid": "Ana", "kids.2.kid": "Ivo" });
    expect(responseRow(survey, cols, responses[0]!, { values: true }).role).toBe("dev");
  });

  it("filters by status, dates, hidden fields and a condition", () => {
    expect(filterResponses(responses).map((r) => r.id)).toEqual(["1"]);
    expect(filterResponses(responses, { status: "all" })).toHaveLength(2);
    expect(filterResponses(responses, { status: "all", from: "2026-01-15" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterResponses(responses, { status: "all", to: "2026-01-01" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterResponses(responses, { status: "all", hidden: { src: "ad" } }).map((r) => r.id)).toEqual(["2"]);
    expect(filterResponses(responses, { where: { question: "role", op: "eq", value: "dev" } })).toHaveLength(1);
  });
});
