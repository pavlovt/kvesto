import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import type { Survey, SurveyInput } from "@kvesto/core";
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
    expect([...add.options].map((o) => o.value)).toEqual(["", "pattern", "length", "email", "url", "custom"]);
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
