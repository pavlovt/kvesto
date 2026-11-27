import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { SurveySchema, type Condition, type ConditionOperator, type Survey, type SurveyInput } from "@kvesto/core";
import { mountEditor } from "../src/lib/index.js";
import {
  comparisonFor,
  conditionSources,
  describeCondition,
  expressionError,
  invalidReferences,
  operatorsFor,
  setAt,
  withOperator,
} from "../src/lib/doc/conditions.js";

const survey: SurveyInput = {
  schemaVersion: 1,
  id: "s",
  title: "S",
  pages: [
    {
      id: "p1",
      elements: [
        {
          id: "role",
          type: "single-choice",
          title: "Role",
          choices: [
            { value: "dev", label: "Developer" },
            { value: "pm", label: "Manager" },
          ],
        },
        { id: "age", type: "text", inputType: "number", title: "Age" },
        { id: "nick", type: "text", title: "Nickname" },
        { id: "happy", type: "boolean", title: "Happy" },
        { id: "score", type: "rating", title: "Score", min: 1, max: 5 },
        {
          id: "langs",
          type: "multiple-choice",
          title: "Languages",
          choices: [
            { value: "ts", label: "TypeScript" },
            { value: "go", label: "Go" },
          ],
        },
        {
          id: "kids",
          type: "panel",
          title: "Children",
          repeat: { min: 0 },
          elements: [
            { id: "kidName", type: "text", title: "Child name" },
            { id: "kidAge", type: "text", inputType: "number", title: "Child age" },
          ],
        },
        { id: "notes", type: "comment", title: "Notes" },
      ],
    },
    { id: "p2", title: "More", elements: [{ id: "extra", type: "text", title: "Extra" }] },
  ],
};

describe("condition model", () => {
  it("offers only earlier questions, with item scope inside a repeat", () => {
    expect(conditionSources(survey, { element: "role" })).toEqual([]);
    expect(conditionSources(survey, { element: "nick" }).map((s) => s.id)).toEqual(["role", "age"]);
    const inRepeat = conditionSources(survey, { element: "kidAge" });
    expect(inRepeat.map((s) => [s.id, s.scope])).toEqual([
      ["role", undefined],
      ["age", undefined],
      ["nick", undefined],
      ["happy", undefined],
      ["score", undefined],
      ["langs", undefined],
      ["kidName", "item"],
    ]);
    // Outside the repeat, its questions have no single answer.
    expect(conditionSources(survey, { element: "notes" }).map((s) => s.id)).not.toContain("kidName");
    // A page condition sees earlier pages only.
    expect(conditionSources(survey, { page: "p1" })).toEqual([]);
    expect(conditionSources(survey, { page: "p2" }).map((s) => s.id)).toContain("notes");
  });

  it("fits operators and values to the question", () => {
    const by = Object.fromEntries(conditionSources(survey, { element: "notes" }).map((s) => [s.id, s]));
    expect(operatorsFor(by.age!)).toContain("gte");
    expect(operatorsFor(by.nick!)).not.toContain("gte");
    expect(operatorsFor(by.langs!)[0]).toBe("contains");
    expect(comparisonFor(by.role!)).toEqual({ question: "role", op: "eq", value: "dev" });
    expect(comparisonFor(by.happy!)).toEqual({ question: "happy", op: "eq", value: true });
    expect(comparisonFor(by.score!)).toEqual({ question: "score", op: "eq", value: 1 });
    const eq = comparisonFor(by.role!);
    expect(withOperator(by.role!, eq, "in")).toEqual({ question: "role", op: "in", value: ["dev"] });
    expect(withOperator(by.role!, eq, "empty")).toEqual({ question: "role", op: "empty" });
    // Switching question keeps the operator when it still fits.
    expect(comparisonFor(by.score!, { question: "age", op: "gte", value: 18 })).toEqual({ question: "score", op: "gte", value: 1 });
  });

  it("edits a tree by path and removes empty groups", () => {
    const c: Condition = { all: [{ question: "role", op: "eq", value: "dev" }, { any: [{ question: "age", op: "gte", value: 18 }] }] };
    expect(setAt(c, [1, 0], undefined)).toEqual({ all: [{ question: "role", op: "eq", value: "dev" }] });
    expect(setAt(c, [0], { not: { question: "role", op: "eq", value: "dev" } })).toMatchObject({ all: [{ not: {} }, {}] });
    expect(setAt({ not: { question: "role", op: "empty" } }, ["not"], undefined)).toBeUndefined();
  });

  it("says conditions in plain words", () => {
    const c: Condition = {
      all: [
        { question: "role", op: "eq", value: "dev" },
        { any: [{ question: "age", op: "gte", value: 18 }, { not: { question: "langs", op: "contains", value: ["go"] } }] },
      ],
    };
    expect(describeCondition(survey, c)).toBe('Role is "Developer" and (Age is at least 18 or not (Languages includes "Go"))');
    expect(describeCondition(survey, { question: "happy", op: "eq", value: false })).toBe("Happy is No");
    expect(describeCondition(survey, { question: "kidName", scope: "item", op: "notEmpty" })).toBe("Child name (same item) is answered");
    expect(invalidReferences(survey, { element: "role" }, { question: "notes", op: "empty" })).toEqual(["notes"]);
  });
});

describe("logic builder in the property panel", () => {
  function setup() {
    const target = document.createElement("div");
    document.body.append(target);
    const changes: Survey[] = [];
    const editor = mountEditor(target, { survey, preview: false, onchange: (s) => changes.push(s) });
    flushSync();
    const $ = <T extends Element = HTMLElement>(sel: string) => target.querySelector<T>(sel)!;
    const $$ = <T extends Element = HTMLElement>(sel: string) => [...target.querySelectorAll<T>(sel)];
    const select = (id: string) => {
      $(`[data-outline="${id}"] .kv-outline-select`).click();
      flushSync();
    };
    const choose = (el: HTMLSelectElement, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      flushSync();
    };
    const click = (text: string, scope = ".kv-props") => {
      const button = $$<HTMLButtonElement>(`${scope} button`).find((b) => b.textContent?.trim() === text);
      if (!button) throw new Error(`No "${text}" button`);
      button.click();
      flushSync();
    };
    const find = (id: string) => {
      const walk = (list: unknown[]): Record<string, unknown> | undefined => {
        for (const el of list as Record<string, unknown>[]) {
          if (el.id === id) return el;
          if (Array.isArray(el.elements)) {
            const inner = walk(el.elements);
            if (inner) return inner;
          }
        }
      };
      return walk(changes.at(-1)!.pages.flatMap((p) => p.elements));
    };
    const summary = () => $(".kv-props .kv-cond-summary").textContent;
    return { target, editor, changes, $, $$, select, choose, click, find, summary };
  }

  it("builds every operator on a question, and only offers earlier questions", () => {
    const ui = setup();
    ui.select("notes");
    ui.click("Show only when…");
    // Starts with the nearest earlier question that can be compared outside the repeat.
    expect(ui.find("notes")!.visibleIf).toEqual({ question: "langs", op: "contains", value: "ts" });
    const question = ui.$<HTMLSelectElement>(".kv-props .kv-cond-question");
    expect([...question.options].map((o) => o.value)).toEqual(["role", "age", "nick", "happy", "score", "langs"]);

    ui.choose(question, "age");
    const ops = [...ui.$<HTMLSelectElement>(".kv-props .kv-cond-op").options].map((o) => o.value) as ConditionOperator[];
    expect(ops).toEqual(["eq", "neq", "gt", "gte", "lt", "lte", "empty", "notEmpty"]);
    for (const op of ops) {
      ui.choose(ui.$<HTMLSelectElement>(".kv-props .kv-cond-op"), op);
      const value = ui.$<HTMLInputElement>(".kv-props input.kv-cond-value");
      if (op === "empty" || op === "notEmpty") {
        expect(value).toBeNull();
        expect(ui.find("notes")!.visibleIf).toEqual({ question: "age", op });
      } else {
        value.value = "21";
        value.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(ui.find("notes")!.visibleIf).toEqual({ question: "age", op, value: 21 });
      }
    }
    // Each answer is still a valid survey.
    expect(SurveySchema.safeParse(ui.changes.at(-1)).success).toBe(true);

    ui.choose(ui.$<HTMLSelectElement>(".kv-props .kv-cond-question"), "role");
    ui.choose(ui.$<HTMLSelectElement>(".kv-props .kv-cond-op"), "in");
    const boxes = ui.$$<HTMLInputElement>(".kv-props .kv-cond-choices input");
    boxes[1]!.click();
    flushSync();
    expect(ui.find("notes")!.visibleIf).toEqual({ question: "role", op: "in", value: ["dev", "pm"] });
    expect(ui.summary()).toBe('Shown when Role is one of "Developer", "Manager"');

    ui.choose(ui.$<HTMLSelectElement>(".kv-props .kv-cond-question"), "happy");
    ui.choose(ui.$<HTMLSelectElement>(".kv-props select.kv-cond-value"), "false");
    expect(ui.find("notes")!.visibleIf).toEqual({ question: "happy", op: "eq", value: false });
    ui.editor.destroy();
  });

  it("builds a nested group with not, and removes it", () => {
    const ui = setup();
    ui.select("notes");
    ui.click("Show only when…");
    ui.choose(ui.$<HTMLSelectElement>(".kv-props .kv-cond-question"), "role");
    ui.click("Add group");
    // all: [role eq dev, any: [langs contains ts]]
    ui.click("Add rule", ".kv-props .kv-cond-group .kv-cond-group");
    const rules = ui.$$<HTMLSelectElement>(".kv-props .kv-cond-question");
    expect(rules).toHaveLength(3);
    ui.choose(rules[2]!, "age");
    ui.choose(ui.$$<HTMLSelectElement>(".kv-props .kv-cond-op")[2]!, "gte");
    ui.choose(ui.$$<HTMLSelectElement>(".kv-props [aria-label='Group type']")[1]!, "any");
    const notButtons = ui.$$<HTMLButtonElement>(".kv-props .kv-cond-rule button").filter((b) => b.textContent === "Not");
    notButtons[1]!.click();
    flushSync();
    expect(ui.find("notes")!.visibleIf).toEqual({
      all: [
        { question: "role", op: "eq", value: "dev" },
        { any: [{ not: { question: "langs", op: "contains", value: "ts" } }, { question: "age", op: "gte", value: 0 }] },
      ],
    });
    expect(ui.summary()).toBe('Shown when Role is "Developer" and (not (Languages includes "TypeScript") or Age is at least 0)');
    expect(SurveySchema.safeParse(ui.changes.at(-1)).success).toBe(true);

    // Removing the group's last rules removes the group.
    ui.$$<HTMLButtonElement>(".kv-props .kv-cond-group .kv-cond-group [aria-label='Remove rule']")[0]!.click();
    flushSync();
    ui.$$<HTMLButtonElement>(".kv-props .kv-cond-group .kv-cond-group [aria-label='Remove rule']")[0]!.click();
    flushSync();
    expect(ui.find("notes")!.visibleIf).toEqual({ all: [{ question: "role", op: "eq", value: "dev" }] });
    ui.click("Remove condition");
    expect(ui.find("notes")!.visibleIf).toBeUndefined();
    ui.editor.destroy();
  });

  it("uses item scope inside a repeat, sets requiredIf and page conditions", () => {
    const ui = setup();
    ui.select("kidAge");
    ui.click("Require only when…");
    expect(ui.find("kidAge")!.requiredIf).toEqual({ question: "kidName", scope: "item", op: "eq", value: "" });
    ui.choose(ui.$<HTMLSelectElement>(".kv-props .kv-cond-op"), "notEmpty");
    expect(ui.find("kidAge")!.requiredIf).toEqual({ question: "kidName", scope: "item", op: "notEmpty" });
    expect(ui.summary()).toBe("Required when Child name (same item) is answered");
    expect(SurveySchema.safeParse(ui.changes.at(-1)).success).toBe(true);

    // Deselect: survey view, where later pages get a condition builder.
    ui.select("kidAge");
    ui.click("Show this page only when…");
    expect(ui.changes.at(-1)!.pages[1]!.visibleIf).toEqual({ question: "notes", op: "eq", value: "" });
    ui.editor.destroy();
  });

  it("writes an expression condition, shows syntax errors and mixes it with rules", () => {
    const ui = setup();
    ui.select("nick");
    ui.click("Write an expression");
    expect(ui.find("nick")!.visibleIf).toEqual({ expr: "{age} != null" });
    const type = (text: string) => {
      const input = ui.$<HTMLInputElement>(".kv-props .kv-cond-expr-input");
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      flushSync();
    };
    type("{age} >= 18 and");
    expect(ui.$(".kv-props .kv-cond-expr .kv-cond-error").textContent).toMatch(/Unexpected end of expression/);
    type("{age} >= 18 and {role} = 'dev'");
    expect(ui.$$(".kv-props .kv-cond-expr .kv-cond-error")).toHaveLength(0);
    expect(ui.summary()).toContain("the expression {age} >= 18 and {role} = 'dev' holds");
    ui.click("Add rule");
    const cond = ui.find("nick")!.visibleIf as { all: Condition[] };
    expect(cond.all[0]).toEqual({ expr: "{age} >= 18 and {role} = 'dev'" });
    expect(cond.all).toHaveLength(2);
    ui.editor.destroy();
  });

  it("inserts an earlier answer into a title", () => {
    const ui = setup();
    ui.select("nick");
    const pipe = ui.$<HTMLSelectElement>(".kv-props .kv-props-pipe");
    expect([...pipe.options].map((o) => o.value)).toEqual(["", "role", "age"]);
    ui.choose(pipe, "role");
    expect(ui.find("nick")!.title).toBe("Nickname {role}");
    expect(pipe.value).toBe("");
    ui.editor.destroy();
  });

  it("checks expression syntax and references in the model", () => {
    expect(expressionError("{a} +")).toMatch(/Unexpected end/);
    expect(expressionError("{a} + 1")).toBeNull();
    expect(invalidReferences(survey, { element: "age" }, { expr: "{role} = 'dev' and {nick} = 'x'" })).toEqual(["nick"]);
    expect(describeCondition(survey, { not: { expr: "{age} > 1" } })).toBe("not (the expression {age} > 1 holds)");
  });

  it("flags a condition that refers to a question it can't use", () => {
    const bad: SurveyInput = structuredClone(survey);
    (bad.pages[0]!.elements[0] as { visibleIf?: Condition }).visibleIf = { question: "notes", op: "notEmpty" };
    const target = document.createElement("div");
    document.body.append(target);
    const editor = mountEditor(target, { survey: bad, preview: false });
    flushSync();
    target.querySelector<HTMLElement>('[data-outline="role"] .kv-outline-select')!.click();
    flushSync();
    expect(target.querySelector(".kv-props .kv-cond-error")!.textContent).toMatch(/"notes", which isn’t an earlier question/);
    // The question list doesn't offer it: the only way forward is a valid question (none exist before the first).
    const options = [...target.querySelector<HTMLSelectElement>(".kv-props .kv-cond-question")!.options];
    expect(options.map((o) => [o.value, o.disabled])).toEqual([["", true]]);
    editor.destroy();
  });
});
