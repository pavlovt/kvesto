// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { SurveySchema, createSurvey, migrateSurvey, renderSurvey, resolveLogic, summarizeResponses, validateAnswers } from "../src/index.js";

const order = migrateSurvey({
  schemaVersion: 1,
  id: "order",
  title: "Order",
  // Out of order on purpose: `total` uses `net`, defined after it.
  variables: [
    { name: "total", expr: "{net} * (1 + {vat} / 100)" },
    { name: "net", expr: "{price} * {qty}" },
  ],
  completedText: "Total {total}",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "price", type: "text", inputType: "number", title: "Price", defaultValue: "10" },
        { id: "qty", type: "text", inputType: "number", title: "Quantity", validators: [{ type: "expression", expr: "{qty} >= 1 and {qty} <= {price}", message: "1 to price" }] },
        { id: "vat", type: "text", inputType: "number", title: "VAT %", readOnly: true, defaultValue: "20" },
        { id: "sum", type: "computed", title: "Total", expr: "{total}", decimals: 2, prefix: "€" },
        { id: "big", type: "boolean", title: "Big order?", visibleIf: { expr: "{total} > 100" } },
        { id: "note", type: "text", title: "Note for {total}", defaultExpr: "concat('qty ', {qty})", visibleIf: { question: "qty", op: "notEmpty" } },
        { id: "gift", type: "text", title: "Gift wrap text", enableIf: { question: "big", op: "eq", value: true } },
        { id: "kind", type: "single-choice", title: "Kind", choices: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
        { id: "detail", type: "text", title: "Detail", resetIf: { question: "kind", op: "eq", value: "b" } },
      ],
    },
  ],
});

describe("variables and computed questions", () => {
  it("work out values in dependency order and use them in conditions", () => {
    const logic = resolveLogic(order, { price: "10", qty: "5", vat: "20" });
    expect(logic.variables).toEqual({ total: 60, net: 50 });
    expect(logic.answers.sum).toBe(60);
    expect(logic.visibleQuestions.has("big")).toBe(false);
    expect(resolveLogic(order, { price: "10", qty: "10", vat: "20" }).visibleQuestions.has("big")).toBe(true);
  });

  it("recalculate computed answers instead of trusting the client", () => {
    const { issues, answers } = validateAnswers(order, { price: "10", qty: "2", vat: "20", sum: 9999 });
    expect(issues).toEqual([]);
    expect(answers.sum).toBe(24);
  });

  it("run expression validators", () => {
    expect(validateAnswers(order, { price: "10", qty: "11", vat: "20" }).issues).toEqual([
      { questionId: "qty", message: "1 to price", path: ["qty"] },
    ]);
  });

  it("refuse a changed read-only answer and an answer to a disabled question", () => {
    expect(validateAnswers(order, { price: "10", qty: "1", vat: "0" }).issues[0]).toMatchObject({ questionId: "vat", message: "This answer can't be changed." });
    expect(validateAnswers(order, { price: "10", qty: "1", vat: "20", gift: "x" }).issues[0]).toMatchObject({ questionId: "gift" });
    expect(validateAnswers(order, { price: "10", qty: "10", vat: "20", big: true, gift: "x" }).issues).toEqual([]);
  });

  it("summarise computed numbers with an average", () => {
    const responses = [10, 20].map((sum, i) => ({ id: String(i), surveyId: "order", createdAt: "", answers: { sum } }));
    expect(summarizeResponses(order, responses).find((s) => s.question.id === "sum")).toMatchObject({ answered: 2, average: 15 });
  });
});

describe("defaults, read-only and resets in the model", () => {
  it("starts with defaultValue, applies defaultExpr when the question is first shown, and keeps it after", () => {
    const model = createSurvey({ survey: order });
    expect(model.getValue("price")).toBe("10");
    expect(model.getValue("note")).toBeUndefined();
    model.setValue("qty", "3");
    expect(model.getValue("note")).toBe("qty 3");
    model.setValue("qty", "4");
    expect(model.getValue("note")).toBe("qty 3");
  });

  it("refuses to set computed and read-only questions, and reports disabled ones", () => {
    const model = createSurvey({ survey: order });
    expect(() => model.setValue("sum", 1)).toThrow("computed");
    expect(() => model.setValue("vat", "5")).toThrow("read-only");
    expect(model.isEnabled("vat")).toBe(false);
    expect(model.isEnabled("gift")).toBe(false);
    model.setValue("qty", "10");
    model.setValue("big", true);
    expect(model.isEnabled("gift")).toBe(true);
  });

  it("clears an answer when resetIf becomes true, not while it stays true", () => {
    const model = createSurvey({ survey: order, initialAnswers: { kind: "b", detail: "prefilled" } });
    expect(model.getValue("detail")).toBe("prefilled");
    model.setValue("kind", "a");
    model.setValue("detail", "typed");
    model.setValue("kind", "b");
    expect(model.getValue("detail")).toBeUndefined();
    model.setValue("detail", "again");
    expect(model.getValue("detail")).toBe("again");
  });

  it("renders computed values, piped variables and disabled questions", async () => {
    const target = document.createElement("div");
    const model = createSurvey({ survey: order });
    renderSurvey(target, model);
    model.setValue("qty", "2");
    expect(target.querySelector('[data-question="sum"] output')!.textContent).toBe("€24.00");
    expect(target.querySelector('[data-question="note"] .kv-question-title')!.firstChild!.textContent).toBe("Note for 24");
    expect(target.querySelector<HTMLInputElement>('[data-question="note"] input')!.value).toBe("qty 2");
    expect(target.querySelector<HTMLFieldSetElement>('[data-question="vat"]')!.disabled).toBe(true);
    expect(target.querySelector<HTMLFieldSetElement>('[data-question="qty"]')!.disabled).toBe(false);
    const result = await model.complete();
    expect(result!.response.answers.sum).toBe(24);
    expect(target.querySelector(".kv-completed")!.textContent).toBe("Total 24");
  });
});

describe("schema checks", () => {
  const base = (extra: object, elements: object[] = [{ id: "a", type: "text", title: "A" }, { id: "b", type: "text", title: "B" }]) => ({
    schemaVersion: 1,
    id: "s",
    title: "S",
    ...extra,
    pages: [{ id: "p1", elements }],
  });
  const messages = (doc: object) => {
    const r = SurveySchema.safeParse(doc);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("rejects variable cycles, duplicates, clashes and unknown references", () => {
    expect(messages(base({ variables: [{ name: "x", expr: "{y} + 1" }, { name: "y", expr: "{x}" }] }))).toContain('Variable "x" depends on itself');
    expect(messages(base({ variables: [{ name: "x", expr: "1" }, { name: "x", expr: "2" }] }))).toContain('Duplicate variable "x"');
    expect(messages(base({ variables: [{ name: "a", expr: "1" }] }))).toContain('"a" is already an element id');
    expect(messages(base({ variables: [{ name: "x", expr: "{nope}" }] }))).toContain("{nope} is not a question or variable");
  });

  it("only lets an element use a variable whose questions come earlier", () => {
    const vars = { variables: [{ name: "v", expr: "{b} * 2" }] };
    expect(messages(base(vars, [{ id: "a", type: "text", title: "A", visibleIf: { expr: "{v} > 1" } }, { id: "b", type: "text", title: "B" }]))).toEqual([
      '{v} uses "b", which does not come earlier',
    ]);
    expect(messages(base(vars, [{ id: "b", type: "text", title: "B" }, { id: "a", type: "text", title: "A {v}", visibleIf: { expr: "{v} > 1" } }]))).toEqual([]);
  });

  it("checks computed, default and expression-rule references", () => {
    expect(messages(base({}, [{ id: "a", type: "computed", title: "A", expr: "{b}" }, { id: "b", type: "text", title: "B" }]))[0]).toContain("does not refer to an earlier question");
    expect(messages(base({}, [{ id: "a", type: "text", title: "A", defaultExpr: "{a}" }]))[0]).toContain("does not refer to an earlier question");
    expect(messages(base({}, [{ id: "a", type: "text", title: "A", validators: [{ type: "expression", expr: "length({a}) > 1" }] }]))).toEqual([]);
  });
});
