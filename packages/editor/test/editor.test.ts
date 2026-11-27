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
    expect(target.querySelectorAll("button")).toHaveLength(13); // one per question type, panel and repeating panel; no Save without storage

    const rating = [...target.querySelectorAll("button")].find((b) => b.textContent === "rating")!;
    rating.click();
    flushSync();
    expect(changes.at(-1)?.pages[0]?.elements[0]?.type).toBe("rating");

    const panel = [...target.querySelectorAll("button")].find((b) => b.textContent === "panel")!;
    panel.click();
    flushSync();
    expect(changes.at(-1)?.pages[0]?.elements[1]).toEqual({ id: "panel1", type: "panel", title: "Group 1", elements: [] });

    const textarea = target.querySelector("textarea")!;
    textarea.value = "{ nope";
    textarea.dispatchEvent(new Event("input"));
    flushSync();
    expect(target.querySelector(".kv-editor-error")?.textContent).toBeTruthy();
  });
});
