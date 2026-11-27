import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { registerQuestionType, unregisterQuestionType, type Survey, type SurveyInput } from "@kvesto/core";
import { mountEditor } from "../src/lib/index.js";

const survey: SurveyInput = {
  schemaVersion: 1,
  id: "s",
  title: "S",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "name", type: "text", title: "Name" },
        { id: "role", type: "single-choice", title: "Role", choices: [{ value: "dev", label: "Dev" }] },
        { id: "box", type: "panel", title: "Box", elements: [{ id: "inner", type: "boolean", title: "Inner" }] },
      ],
    },
  ],
};

const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
};

function setup(preview = true) {
  const target = document.createElement("div");
  document.body.append(target);
  const changes: Survey[] = [];
  const editor = mountEditor(target, { survey, preview, onchange: (s) => changes.push(s) });
  flushSync();
  const $ = <T extends Element = HTMLElement>(sel: string) => target.querySelector<T>(sel)!;
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...target.querySelectorAll<T>(sel)];
  const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
  };
  const last = () => changes.at(-1)!;
  return { target, editor, changes, $, $$, type, last };
}

type UI = ReturnType<typeof setup>;

const select = (ui: UI, id: string) => {
  ui.$(`[data-outline="${id}"] .kv-outline-select`).click();
  flushSync();
};
const field = (ui: UI, label: string) =>
  ui.$$<HTMLLabelElement>(".kv-props label").find((l) => l.textContent?.trim().startsWith(label))!.querySelector("input")!;

describe("design view", () => {
  it("shows the outline, including panels, and survey properties without a selection", () => {
    const ui = setup(false);
    expect(ui.$$("[data-outline]").map((el) => el.dataset.outline)).toEqual(["name", "role", "box", "inner"]);
    expect(ui.$(".kv-props h3").textContent).toBe("Survey");
    ui.type(field(ui, "Title"), "New title");
    expect(ui.last().title).toBe("New title");
    ui.editor.destroy();
  });

  it("edits the selected question through the property panel", () => {
    const ui = setup(false);
    select(ui, "name");
    expect(ui.$(".kv-props h3").textContent).toBe("Question · text");
    ui.type(field(ui, "Title"), "Full name");
    expect(ui.last().pages[0]!.elements[0]).toMatchObject({ id: "name", title: "Full name" });
    field(ui, "Required").click();
    flushSync();
    expect(ui.last().pages[0]!.elements[0]).toMatchObject({ required: true });

    // Renames happen on change; a taken id is refused with a message.
    const id = ui.$<HTMLInputElement>(".kv-props-id");
    const rename = (value: string) => {
      id.value = value;
      id.dispatchEvent(new Event("input", { bubbles: true }));
      id.dispatchEvent(new Event("change", { bubbles: true }));
      flushSync();
    };
    rename("role");
    expect(ui.$(".kv-props-error").textContent).toMatch(/already used/);
    rename("fullName");
    expect(ui.last().pages[0]!.elements[0]!.id).toBe("fullName");
    expect(ui.$('[data-outline="fullName"]').classList.contains("kv-outline-selected")).toBe(true);
    ui.editor.destroy();
  });

  it("edits choices and adds validators", () => {
    const ui = setup(false);
    select(ui, "role");
    ui.$<HTMLButtonElement>(".kv-choice-add").click();
    flushSync();
    const role = () => ui.last().pages[0]!.elements[1] as unknown as { choices: { value: string; label: string }[] };
    expect(role().choices).toEqual([
      { value: "dev", label: "Dev" },
      { value: "option2", label: "Option 2" },
    ]);
    ui.type(ui.$$<HTMLInputElement>(".kv-choice-label")[1]!, "PM");
    expect(role().choices[1]!.label).toBe("PM");

    select(ui, "name");
    const add = ui.$<HTMLSelectElement>(".kv-validator-add select");
    expect([...add.options].map((o) => o.value)).toEqual(["", "pattern", "length", "email", "url", "expression", "custom"]);
    add.value = "length";
    add.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    ui.$<HTMLButtonElement>(".kv-validator-add button").click();
    flushSync();
    expect((ui.last().pages[0]!.elements[0] as unknown as { validators: unknown }).validators).toEqual([
      { type: "length", max: 100 },
    ]);
    ui.editor.destroy();
  });

  it("reorders, duplicates and deletes from the outline, with undo", () => {
    const ui = setup(false);
    const button = (id: string, title: string) =>
      ui.$(`[data-outline="${id}"] > .kv-outline-row`).querySelector<HTMLButtonElement>(`[title="${title}"]`)!;
    const ids = () => ui.last().pages[0]!.elements.map((e) => e.id);
    button("role", "Move up").click();
    flushSync();
    expect(ids()).toEqual(["role", "name", "box"]);
    button("inner", "Duplicate").click();
    flushSync();
    expect(ui.$$("[data-outline]").map((el) => el.dataset.outline)).toEqual(["role", "name", "box", "inner", "inner2"]);
    button("box", "Delete").click();
    flushSync();
    expect(ids()).toEqual(["role", "name"]);
    ui.$<HTMLButtonElement>(".kv-editor-undo").click();
    flushSync();
    expect(ids()).toEqual(["role", "name", "box"]);
    ui.$<HTMLButtonElement>(".kv-outline-add-page").click();
    flushSync();
    expect(ui.$$("[data-page]")).toHaveLength(2);
    ui.editor.destroy();
  });

  it("adds palette items into the selected panel", () => {
    const ui = setup(false);
    select(ui, "box");
    ui.$$<HTMLButtonElement>(".kv-editor-palette button").find((b) => b.textContent?.trim() === "rating")!.click();
    flushSync();
    const box = ui.last().pages[0]!.elements[2] as unknown as { elements: { type: string }[] };
    expect(box.elements.map((e) => e.type)).toEqual(["boolean", "rating"]);
    ui.editor.destroy();
  });

  it("selects by clicking the preview and highlights the selection", async () => {
    const ui = setup(true);
    await tick();
    ui.$('.kv-preview [data-question="role"]').click();
    flushSync();
    await tick();
    expect(ui.$(".kv-props h3").textContent).toBe("Question · single-choice");
    expect(ui.$('.kv-preview [data-question="role"]').classList.contains("kv-editor-selected")).toBe(true);
    ui.editor.destroy();
  });

  it("switches to the JSON view and back", () => {
    const ui = setup(false);
    ui.$$<HTMLButtonElement>(".kv-editor-tabs button")[1]!.click();
    flushSync();
    expect(JSON.parse(ui.$<HTMLTextAreaElement>("textarea").value).id).toBe("s");
    ui.$$<HTMLButtonElement>(".kv-editor-tabs button")[0]!.click();
    flushSync();
    expect(ui.$(".kv-outline")).not.toBeNull();
    ui.editor.destroy();
  });
});

describe("calculated values in the editor", () => {
  it("adds a computed question, variables, read-only and default settings, and expression rules", () => {
    const ui = setup(false);
    ui.$$<HTMLButtonElement>(".kv-editor-palette button").find((b) => b.textContent?.trim() === "computed")!.click();
    flushSync();
    const computed = ui.last().pages[0]!.elements.find((e) => e.type === "computed") as { id: string; expr: string };
    expect(computed.expr).toBe("0");
    ui.type(field(ui, "Expression"), "{name} +");
    expect(ui.$(".kv-props .kv-props-error").textContent).toMatch(/Unexpected end/);
    ui.type(field(ui, "Expression"), "length({name})");
    expect((ui.last().pages[0]!.elements.find((e) => e.id === computed.id) as { expr: string }).expr).toBe("length({name})");

    select(ui, "name");
    field(ui, "Read-only").click();
    flushSync();
    ui.type(field(ui, "Default (expression)"), "'Ana'");
    expect(ui.last().pages[0]!.elements[0]).toMatchObject({ readOnly: true, defaultExpr: "'Ana'" });

    ui.editor.destroy();
  });

  it("edits survey variables", () => {
    const ui = setup(false);
    ui.$$<HTMLButtonElement>(".kv-props button").find((b) => b.textContent?.trim() === "Add a variable")!.click();
    flushSync();
    expect(ui.last().variables).toEqual([{ name: "var1", expr: "0" }]);
    ui.type(ui.$<HTMLInputElement>('.kv-props [aria-label="Variable expression"]'), "{name} * 2");
    expect(ui.last().variables).toEqual([{ name: "var1", expr: "{name} * 2" }]);
    ui.$<HTMLButtonElement>('.kv-props [aria-label="Remove variable var1"]').click();
    flushSync();
    expect(ui.last().variables).toBeUndefined();
    ui.editor.destroy();
  });
});

describe("triggers in the editor", () => {
  it("adds a trigger, changes its action and removes it", () => {
    const ui = setup(false);
    const click = (text: string) => {
      ui.$$<HTMLButtonElement>(".kv-props button").find((b) => b.textContent?.trim() === text)!.click();
      flushSync();
    };
    click("Add a trigger");
    expect(ui.last().triggers).toEqual([
      { when: { question: "inner", op: "notEmpty" }, action: { type: "setValue", question: "name", value: "" } },
    ]);
    ui.type(ui.$<HTMLInputElement>('.kv-trigger [aria-label="Value"]'), "Ana");
    expect(ui.last().triggers![0]!.action).toEqual({ type: "setValue", question: "name", value: "Ana" });
    const action = ui.$<HTMLSelectElement>('.kv-trigger [aria-label="Action"]');
    action.value = "skipToPage";
    action.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expect(ui.last().triggers![0]!.action).toEqual({ type: "skipToPage", page: "p1" });
    ui.$<HTMLButtonElement>('.kv-trigger [aria-label="Remove trigger 1"]').click();
    flushSync();
    expect(ui.last().triggers).toBeUndefined();
    ui.editor.destroy();
  });
});

describe("custom question types in the editor", () => {
  it("adds a registered type from the palette with its defaults", () => {
    registerQuestionType({ type: "x-stars", label: "stars", editorDefaults: { max: 3 } });
    const ui = setup(false);
    ui.$$<HTMLButtonElement>(".kv-editor-palette button").find((b) => b.textContent?.trim() === "stars")!.click();
    flushSync();
    expect(ui.last().pages[0]!.elements.at(-1)).toMatchObject({ type: "x-stars", max: 3 });
    ui.editor.destroy();
    unregisterQuestionType("x-stars");
  });
});

describe("content blocks in the editor", () => {
  it("adds a text block and an image and edits them", () => {
    const ui = setup(false);
    const add = (label: string) => {
      ui.$$<HTMLButtonElement>(".kv-editor-palette button").find((b) => b.textContent?.trim() === label)!.click();
      flushSync();
    };
    add("text block");
    expect(ui.$(".kv-props h3").textContent).toBe("Content");
    ui.type(ui.$<HTMLTextAreaElement>(".kv-props .kv-props-markdown"), "Hello **{name}**");
    expect(ui.last().pages[0]!.elements.at(-1)).toEqual({ id: "content1", type: "content", markdown: "Hello **{name}**" });
    add("image");
    ui.type(field(ui, "Alt text"), "A cat");
    expect(ui.last().pages[0]!.elements.at(-1)).toMatchObject({ id: "image1", type: "image", alt: "A cat" });
    ui.editor.destroy();
  });
});

describe("input question types in the editor", () => {
  it("adds a slider and an image choice and edits their settings", () => {
    const ui = setup(false);
    const add = (label: string) => {
      ui.$$<HTMLButtonElement>(".kv-editor-palette button").find((b) => b.textContent?.trim() === label)!.click();
      flushSync();
    };
    add("slider");
    ui.type(field(ui, "Step"), "5");
    expect(ui.last().pages[0]!.elements.at(-1)).toMatchObject({ type: "slider", min: 0, max: 100, step: 5 });
    add("image-choice");
    ui.type(ui.$<HTMLInputElement>('.kv-props [aria-label="option 1 image URL"]'), "/a.png");
    expect((ui.last().pages[0]!.elements.at(-1) as { choices: { imageUrl: string }[] }).choices[0]!.imageUrl).toBe("/a.png");
    ui.editor.destroy();
  });
});
