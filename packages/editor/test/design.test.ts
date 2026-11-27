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

describe("preview layout", () => {
  it("switches the preview to one question at a time", async () => {
    const ui = setup(true);
    await tick();
    const visible = () => [...ui.target.querySelectorAll<HTMLElement>(".kv-preview [data-question]")].filter((e) => !e.hidden && !e.closest("[hidden]")).length;
    expect(visible()).toBeGreaterThan(1);
    const toggle = ui.$<HTMLInputElement>(".kv-editor-layout input");
    toggle.click();
    await tick();
    expect(visible()).toBe(1);
    ui.editor.destroy();
  });
});

describe("translations in the editor", () => {
  const multi: SurveyInput = {
    schemaVersion: 1,
    id: "m",
    title: { en: "Hello", de: "Hallo" },
    locales: ["en", "de"],
    pages: [{ id: "p1", elements: [{ id: "name", type: "text", title: { en: "Name", de: "Name" } }, { id: "c", type: "text", title: "City" }] }],
  };
  const mount = (translate?: (t: Record<string, string>) => Record<string, string>) => {
    const target = document.createElement("div");
    document.body.append(target);
    const changes: Survey[] = [];
    const editor = mountEditor(target, { survey: multi, preview: false, onchange: (s) => changes.push(s), ...(translate ? { translate } : {}) });
    flushSync();
    const $ = <T extends Element = HTMLElement>(sel: string) => target.querySelector<T>(sel)!;
    const click = (text: string) => {
      [...target.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text)!.click();
      flushSync();
    };
    return { target, editor, changes, $, click, last: () => changes.at(-1)! };
  };

  it("keeps other languages when the default text is edited", () => {
    const ui = mount();
    ui.$<HTMLElement>('[data-outline="name"] .kv-outline-select').click();
    flushSync();
    const title = [...ui.target.querySelectorAll<HTMLLabelElement>(".kv-props label")].find((l) => l.textContent?.trim().startsWith("Title"))!.querySelector("input")!;
    expect(title.value).toBe("Name");
    title.value = "Full name";
    title.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(ui.last().pages[0]!.elements[0]).toMatchObject({ title: { en: "Full name", de: "Name" } });
    expect(ui.$('[data-outline="name"]').textContent).toContain("Full name");
    ui.editor.destroy();
  });

  it("lists texts per language, edits them, drafts the missing ones with AI and marks them reviewed", async () => {
    const ui = mount((texts) => Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, `DE ${v}`])));
    ui.click("Translations");
    const rows = () => [...ui.target.querySelectorAll<HTMLTableRowElement>(".kv-translations-table tbody tr")];
    expect(rows().map((r) => r.querySelector(".kv-translations-key")!.textContent)).toEqual(["survey.title", "name.title", "c.title"]);
    expect(rows()[2]!.classList.contains("kv-translations-missing")).toBe(true);
    expect(ui.$(".kv-translations-stats").textContent).toBe("1 missing · 0 to review");

    ui.click("Translate missing with AI");
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
    expect(ui.last().pages[0]!.elements[1]).toMatchObject({ title: { en: "City", de: "DE City" } });
    expect(ui.last().translationsToReview).toEqual({ de: ["c.title"] });
    expect(rows()[2]!.querySelector(".kv-translations-flag")).not.toBeNull();
    ui.click("Looks right");
    expect(ui.last().translationsToReview).toBeUndefined();

    const field = rows()[0]!.querySelector("textarea")!;
    field.value = "Servus";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(ui.last().title).toEqual({ en: "Hello", de: "Servus" });

    // A language can be added.
    const add = ui.$<HTMLInputElement>('.kv-translations-add input');
    add.value = "fr";
    add.dispatchEvent(new Event("input", { bubbles: true }));
    ui.click("Add language");
    expect(ui.last().locales).toEqual(["en", "de", "fr"]);
    ui.editor.destroy();
  });
});

describe("hidden fields in the editor", () => {
  it("declares hidden fields and offers them in conditions", () => {
    const ui = setup(false);
    const input = ui.$<HTMLInputElement>(".kv-props-hidden");
    input.value = "source, bad id, userId";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expect(ui.last().hiddenFields).toEqual(["source", "userId"]);
    select(ui, "name");
    ui.$$<HTMLButtonElement>(".kv-props button").find((b) => b.textContent?.trim() === "Show only when…")!.click();
    flushSync();
    const options = [...ui.$<HTMLSelectElement>(".kv-props .kv-cond-question").options].map((o) => o.value);
    expect(options).toEqual(["source", "userId"]);
    ui.editor.destroy();
  });
});

describe("themes in the editor", () => {
  it("switches the editor between light, dark and auto", () => {
    const ui = setup(false);
    expect(ui.$(".kv-editor").getAttribute("data-kv-ui-theme")).toBe("light");
    const pick = ui.$<HTMLSelectElement>(".kv-editor-ui-theme");
    pick.value = "dark";
    pick.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expect(ui.$(".kv-editor").getAttribute("data-kv-ui-theme")).toBe("dark");
    ui.editor.destroy();
  });

  it("edits the survey's theme and exports it", () => {
    const ui = setup(false);
    ui.$$<HTMLButtonElement>(".kv-editor-tabs button").find((b) => b.textContent === "Theme")!.click();
    flushSync();
    const preset = ui.$<HTMLSelectElement>(".kv-theme select");
    preset.value = "dark";
    preset.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expect(ui.last().settings).toEqual({ theme: "dark" });
    ui.type(ui.$<HTMLInputElement>('.kv-theme input[aria-label="radius"]'), "0");
    expect(ui.last().settings).toEqual({ theme: { preset: "dark", radius: "0" } });
    expect(ui.$<HTMLTextAreaElement>(".kv-theme-export").value).toContain("--kv-radius: 0;");
    ui.$$<HTMLButtonElement>(".kv-theme button").find((b) => b.textContent === "Reset to the default look")!.click();
    flushSync();
    expect(ui.last().settings).toBeUndefined();
    ui.editor.destroy();
  });
});

describe("quiz settings in the editor", () => {
  it("turns on scoring and sets a question's correct answer, points and feedback", () => {
    const ui = setup(false);
    field(ui, "Score answers").click();
    flushSync();
    expect(ui.last().settings).toEqual({ quiz: {} });
    ui.type(field(ui, "Pass mark"), "60");
    expect(ui.last().settings).toEqual({ quiz: { passMark: 0.6 } });
    select(ui, "role");
    const correct = ui.$<HTMLInputElement>(".kv-props .kv-props-correct");
    correct.value = "dev";
    correct.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    ui.type(field(ui, "Points"), "3");
    ui.type(field(ui, "If wrong"), "Try again");
    expect(ui.last().pages[0]!.elements[1]).toMatchObject({ correctAnswer: "dev", points: 3, feedback: { wrong: "Try again" } });
    ui.editor.destroy();
  });
});
