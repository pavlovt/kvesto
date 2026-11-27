import { describe, expect, it, vi } from "vitest";
import { SurveySchema, createSurvey, migrateSurvey } from "../src/index.js";

const yesNo = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
const survey = migrateSurvey({
  schemaVersion: 1,
  id: "t",
  title: "T",
  triggers: [
    { when: { question: "member", op: "eq", value: "yes" }, action: { type: "setValue", question: "discount", value: "10" } },
    { when: { expr: "{billing} != null" }, action: { type: "copyValue", from: "billing", to: "shipping" } },
    { when: { question: "skip", op: "eq", value: "yes" }, action: { type: "skipToPage", page: "p3" } },
    { when: { question: "stop", op: "eq", value: "yes" }, action: { type: "complete" } },
  ],
  pages: [
    {
      id: "p1",
      elements: [
        { id: "member", type: "single-choice", title: "Member?", choices: yesNo },
        { id: "discount", type: "text", title: "Discount" },
        { id: "billing", type: "text", title: "Billing address" },
        { id: "shipping", type: "text", title: "Shipping address" },
        { id: "skip", type: "single-choice", title: "Skip ahead?", choices: yesNo },
        { id: "stop", type: "single-choice", title: "Stop now?", choices: yesNo },
      ],
    },
    { id: "p2", elements: [{ id: "middle", type: "text", title: "Middle" }] },
    { id: "p3", elements: [{ id: "end", type: "text", title: "End" }] },
  ],
});

describe("triggers", () => {
  it("set a value when the condition becomes true, and not again while it stays true", () => {
    const model = createSurvey({ survey });
    model.setValue("member", "yes");
    expect(model.getValue("discount")).toBe("10");
    model.setValue("discount", "5");
    model.setValue("billing", "x");
    expect(model.getValue("discount")).toBe("5");
    model.setValue("member", "no");
    model.setValue("member", "yes");
    expect(model.getValue("discount")).toBe("10");
  });

  it("copy a value", () => {
    const model = createSurvey({ survey });
    model.setValue("billing", "Main St 1");
    expect(model.getValue("shipping")).toBe("Main St 1");
  });

  it("skip to a page", () => {
    const model = createSurvey({ survey });
    model.setValue("skip", "yes");
    expect(model.snapshot.page.id).toBe("p3");
  });

  it("complete the survey", async () => {
    const onComplete = vi.fn();
    const model = createSurvey({ survey, onComplete });
    model.setValue("stop", "yes");
    await new Promise((r) => setTimeout(r, 0));
    expect(model.snapshot.status).toBe("completed");
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("do not run for prefilled answers", () => {
    const model = createSurvey({ survey, initialAnswers: { member: "yes", discount: "0" } });
    expect(model.getValue("discount")).toBe("0");
  });

  it("cannot loop forever", () => {
    const loop = migrateSurvey({
      schemaVersion: 1,
      id: "loop",
      title: "Loop",
      triggers: [
        { when: { question: "a", op: "eq", value: "1" }, action: { type: "setValue", question: "a", value: "2" } },
        { when: { question: "a", op: "eq", value: "2" }, action: { type: "setValue", question: "a", value: "1" } },
      ],
      pages: [{ id: "p1", elements: [{ id: "a", type: "text", title: "A" }] }],
    });
    const model = createSurvey({ survey: loop });
    model.setValue("a", "1");
    expect(["1", "2"]).toContain(model.getValue("a"));
  });

  it("are checked by the schema", () => {
    const bad = (action: object, when: object = { question: "a", op: "notEmpty" }) =>
      SurveySchema.safeParse({
        schemaVersion: 1,
        id: "s",
        title: "S",
        triggers: [{ when, action }],
        pages: [{ id: "p1", elements: [{ id: "a", type: "text", title: "A" }, { id: "c", type: "computed", title: "C", expr: "1" }] }],
      }).error?.issues.map((i) => i.message) ?? [];
    expect(bad({ type: "setValue", question: "a", value: "x" })).toEqual([]);
    expect(bad({ type: "setValue", question: "nope", value: "x" })[0]).toContain("is not a question");
    expect(bad({ type: "setValue", question: "c", value: "x" })[0]).toContain("computed");
    expect(bad({ type: "skipToPage", page: "p9" })[0]).toContain('No page "p9"');
    expect(bad({ type: "complete" }, { question: "zzz", op: "notEmpty" })[0]).toContain("not an earlier question");
  });
});
