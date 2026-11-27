import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import type { Survey, SurveyInput } from "@kvesto/core";
import { mountEditor } from "../src/lib/index.js";
import { SurveyDocument } from "../src/lib/doc/document.js";
import { newElement } from "../src/lib/doc/factory.js";
import { canDropInto, describeTarget, dropTargets } from "../src/lib/doc/positions.js";

const survey: SurveyInput = {
  schemaVersion: 1,
  id: "s",
  title: "S",
  pages: [
    {
      id: "p1",
      title: "First",
      elements: [
        { id: "name", type: "text", title: "Name" },
        { id: "box", type: "panel", title: "Box", elements: [{ id: "inner", type: "boolean", title: "Inner" }] },
        { id: "items", type: "panel", title: "Items", repeat: { min: 1 }, elements: [] },
      ],
    },
    { id: "p2", elements: [] },
  ],
};

const key = (t: { container: object; index: number }) => `${Object.values(t.container)[0]}@${t.index}`;

describe("drop targets", () => {
  it("lists every place in document order, once for the moving element's own spot", () => {
    const doc = new SurveyDocument(survey);
    const name = doc.find("name")!.element;
    expect(dropTargets(doc.survey, name, "name").map(key)).toEqual([
      "p1@0", // current position
      "box@0",
      "box@1",
      "p1@2",
      "items@0",
      "p1@3",
      "p2@0",
    ]);
    // A new element has every slot, including both sides of each element.
    expect(dropTargets(doc.survey, newElement("text", doc.survey), null).map(key)).toEqual([
      "p1@0",
      "p1@1",
      "box@0",
      "box@1",
      "p1@2",
      "items@0",
      "p1@3",
      "p2@0",
    ]);
  });

  it("keeps panels out of themselves, repeats out of repeats and file questions out of repeats", () => {
    const doc = new SurveyDocument(survey);
    const box = doc.find("box")!.element;
    expect(canDropInto(doc.survey, box, "box", { panel: "box" })).toBe(false);
    expect(dropTargets(doc.survey, box, "box").map(key)).not.toContain("box@0");
    expect(canDropInto(doc.survey, newElement("file", doc.survey), null, { panel: "items" })).toBe(false);
    expect(canDropInto(doc.survey, newElement("repeat", doc.survey), null, { panel: "items" })).toBe(false);
    expect(canDropInto(doc.survey, newElement("text", doc.survey), null, { panel: "items" })).toBe(true);
  });

  it("describes targets in words", () => {
    const doc = new SurveyDocument(survey);
    expect(describeTarget(doc.survey, { container: { page: "p1" }, index: 1 })).toBe('before "Box" in page "First"');
    expect(describeTarget(doc.survey, { container: { panel: "box" }, index: 1 })).toBe('at the end of panel "Box"');
    expect(describeTarget(doc.survey, { container: { panel: "items" }, index: 0 })).toBe('in empty repeating panel "Items"');
  });
});

describe("keyboard drag and drop", () => {
  function setup() {
    const target = document.createElement("div");
    document.body.append(target);
    const changes: Survey[] = [];
    const editor = mountEditor(target, { survey, preview: false, onchange: (s) => changes.push(s) });
    flushSync();
    const handle = (id: string) => target.querySelector<HTMLButtonElement>(`[data-outline="${id}"] .kv-outline-handle`)!;
    const press = (el: HTMLElement, key: string) => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      flushSync();
    };
    const live = () => target.querySelector('.kv-outline [role="status"]')!.textContent;
    const ids = (s: Survey) => s.pages[0]!.elements.map((e) => e.id);
    return { target, editor, changes, handle, press, live, ids };
  }

  it("picks up with Space, moves with the arrow keys and drops with Space, in one undo step", async () => {
    const ui = setup();
    const h = ui.handle("name");
    h.focus();
    ui.press(h, " ");
    expect(ui.live()).toMatch(/^Picked up Name\. Current position, 1 of 7\./);
    expect(h.getAttribute("aria-pressed")).toBe("true");
    ui.press(h, "ArrowDown");
    expect(ui.live()).toBe('Before "Inner" in panel "Box", 2 of 7');
    expect(ui.target.querySelector('[data-outline="inner"]')!.classList.contains("kv-drop-before")).toBe(true);
    ui.press(h, "ArrowDown");
    expect(ui.live()).toBe('At the end of panel "Box", 3 of 7');
    expect(ui.target.querySelector('[data-outline="inner"]')!.classList.contains("kv-drop-after")).toBe(true);
    const before = ui.changes.length;
    ui.press(h, " ");
    expect(ui.changes.length).toBe(before + 1);
    const box = ui.changes.at(-1)!.pages[0]!.elements[0] as unknown as { id: string; elements: { id: string }[] };
    expect(box.id).toBe("box");
    expect(box.elements.map((e) => e.id)).toEqual(["inner", "name"]);
    expect(ui.live()).toBe('Moved Name at the end of panel "Box".');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(ui.handle("name"));

    ui.target.querySelector<HTMLButtonElement>(".kv-editor-undo")!.click();
    flushSync();
    expect(ui.ids(ui.changes.at(-1)!)).toEqual(["name", "box", "items"]);
    ui.editor.destroy();
  });

  it("moves into an empty page and cancels with Escape", () => {
    const ui = setup();
    const h = ui.handle("name");
    ui.press(h, "Enter");
    ui.press(h, "End");
    expect(ui.live()).toBe('In empty page "p2", 7 of 7');
    expect(ui.target.querySelector('[data-container="page:p2"]')!.classList.contains("kv-drop-into")).toBe(true);
    ui.press(h, "Escape");
    expect(ui.live()).toBe("Cancelled. Name was not moved.");
    expect(h.getAttribute("aria-pressed")).toBe("false");
    expect(ui.target.querySelector(".kv-drop-into")).toBeNull();

    ui.press(h, " ");
    ui.press(h, "End");
    ui.press(h, " ");
    const pages = ui.changes.at(-1)!.pages;
    expect(pages[1]!.elements.map((e) => e.id)).toEqual(["name"]);
    ui.editor.destroy();
  });
});
