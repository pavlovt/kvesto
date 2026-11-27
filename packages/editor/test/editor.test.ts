import { flushSync } from "svelte";
import { describe, expect, it, vi } from "vitest";
import { memoryStorage, type Survey } from "@kvesto/core";
import { mountEditor, starterSurvey } from "../src/lib/index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("mountEditor", () => {
  it("renders the JSON, the live preview and saves to storage", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    const storage = memoryStorage();
    const onsave = vi.fn();
    const editor = mountEditor(target, { storage, onsave });
    flushSync();

    const textarea = target.querySelector("textarea")!;
    expect(JSON.parse(textarea.value).id).toBe(starterSurvey.id);
    expect(target.querySelector(".kv-survey, form, .kv-question")).not.toBeNull();

    const save = [...target.querySelectorAll("button")].find((b) => b.textContent === "Save")!;
    save.click();
    await tick();
    flushSync();
    expect((await storage.loadSurvey(starterSurvey.id))?.title).toBe(starterSurvey.title);
    expect(onsave).toHaveBeenCalledOnce();
    editor.destroy();
    expect(target.innerHTML).toBe("");
  });

  it("adds questions, reports valid edits and flags invalid JSON", () => {
    const target = document.createElement("div");
    const changes: Survey[] = [];
    const survey = { schemaVersion: 1 as const, id: "s", title: "S", pages: [{ id: "p", elements: [] }] };
    mountEditor(target, { survey, preview: false, onchange: (s) => changes.push(s) });
    flushSync();
    expect(target.querySelectorAll("button")).toHaveLength(15); // undo, redo, one per question type, panel and repeating panel; no Save without storage

    const rating = [...target.querySelectorAll("button")].find((b) => b.textContent === "rating")!;
    rating.click();
    flushSync();
    expect(changes.at(-1)?.pages[0]?.elements[0]?.type).toBe("rating");

    const panel = [...target.querySelectorAll("button")].find((b) => b.textContent === "panel")!;
    panel.click();
    flushSync();
    expect(changes.at(-1)?.pages[0]?.elements[1]).toEqual({ id: "panel1", type: "panel", title: "Group 1", elements: [] });

    const undo = target.querySelector<HTMLButtonElement>(".kv-editor-undo")!;
    const redo = target.querySelector<HTMLButtonElement>(".kv-editor-redo")!;
    expect(redo.disabled).toBe(true);
    undo.click();
    flushSync();
    expect(changes.at(-1)?.pages[0]?.elements).toHaveLength(1);
    expect(redo.disabled).toBe(false);
    redo.click();
    flushSync();
    expect(changes.at(-1)?.pages[0]?.elements).toHaveLength(2);

    // Ctrl+Z outside text fields undoes; inside the JSON it is left to the browser.
    target.querySelector(".kv-editor")!.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    flushSync();
    expect(changes.at(-1)?.pages[0]?.elements).toHaveLength(1);

    const textarea = target.querySelector("textarea")!;
    textarea.value = JSON.stringify({ ...survey, title: "Typed" });
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(changes.at(-1)?.title).toBe("Typed");
    undo.click();
    flushSync();
    expect(changes.at(-1)?.title).toBe("S");
    expect(JSON.parse(textarea.value).title).toBe("S");

    textarea.value = "{ nope";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(target.querySelector(".kv-editor-error")?.textContent).toBeTruthy();
  });
});
