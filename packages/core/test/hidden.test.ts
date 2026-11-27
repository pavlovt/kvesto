// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { SurveySchema, collectHidden, createSurvey, migrateSurvey, renderSurvey, validateAnswers } from "../src/index.js";

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "h",
  title: "Hello",
  hiddenFields: ["source", "userId"],
  pages: [
    {
      id: "p1",
      elements: [
        { id: "promo", type: "text", title: "Code from {source}", visibleIf: { question: "source", op: "eq", value: "newsletter" } },
        { id: "vip", type: "text", title: "VIP", visibleIf: { expr: "startsVip({userId})" } },
      ],
    },
  ],
});
const functions = { startsVip: (id: unknown) => String(id).startsWith("vip") };

describe("hidden fields", () => {
  it("come from the hidden option or, when allowed, the URL, and only when declared", () => {
    expect(collectHidden(survey, { source: "ads", other: "x" })).toEqual({ source: "ads" });
    expect(collectHidden(survey, {}, "https://x.test/s?source=newsletter&userId=vip1&evil=1")).toEqual({ source: "newsletter", userId: "vip1" });
    expect(collectHidden(survey, { source: "given" }, "https://x.test/s?source=url")).toEqual({ source: "given" });
    expect(collectHidden(survey, {}, undefined)).toEqual({});
    expect(collectHidden(survey, { source: "x".repeat(900) }).source).toHaveLength(500);
  });

  it("drive conditions, expressions and piping, and are stored in meta.hidden", async () => {
    const target = document.createElement("div");
    const model = createSurvey({ survey, functions, hiddenFromUrl: "https://x.test/?source=newsletter&userId=vip7" });
    renderSurvey(target, model);
    expect(model.isVisible("promo")).toBe(true);
    expect(model.isVisible("vip")).toBe(true);
    expect(target.querySelector('[data-question="promo"] .kv-question-title')!.firstChild!.textContent).toBe("Code from newsletter");
    const result = await model.complete();
    expect(result!.response.meta).toEqual({ hidden: { source: "newsletter", userId: "vip7" } });
    expect(result!.response.answers).toEqual({});
    expect(createSurvey({ survey, functions }).isVisible("promo")).toBe(false);
  });

  it("are used by validateAnswers too", () => {
    const required = migrateSurvey({ ...survey, pages: [{ id: "p1", elements: [{ id: "promo", type: "text", title: "Code", required: true, visibleIf: { question: "source", op: "eq", value: "newsletter" } }] }] });
    expect(validateAnswers(required, {}).issues).toEqual([]);
    expect(validateAnswers(required, {}, { hidden: { source: "newsletter" } }).issues).toHaveLength(1);
  });

  it("are checked by the schema", () => {
    const parse = (extra: object) => SurveySchema.safeParse({ ...survey, ...extra }).error?.issues.map((i) => i.message) ?? [];
    expect(parse({ hiddenFields: ["a", "a"] })).toContain('Duplicate hidden field "a"');
    expect(parse({ hiddenFields: ["promo"] })).toContain('"promo" is already an element id or a variable');
  });
});
