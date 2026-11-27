import { describe, expect, it } from "vitest";
import type { SurveyInput } from "@kvesto/core";
import { SurveyDocument, uniqueId } from "../src/lib/doc/document.js";

const base = (): SurveyInput => ({
  schemaVersion: 1,
  id: "s",
  title: "S",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "a", type: "text", title: "A" },
        { id: "g", type: "panel", title: "G", elements: [{ id: "b", type: "text", title: "B" }] },
      ],
    },
    { id: "p2", elements: [{ id: "c", type: "boolean", title: "C" }] },
  ],
});

const ids = (doc: SurveyDocument) =>
  doc.survey.pages.map((p) => p.elements.map((e) => (e.type === "panel" ? `${e.id}(${e.elements.map((x) => x.id).join(",")})` : e.id)).join(" "));

describe("SurveyDocument", () => {
  it("adds, removes and undoes every command", () => {
    const doc = new SurveyDocument(base());
    const original = JSON.stringify(doc.survey);
    const steps: [string, () => unknown][] = [
      ["add", () => doc.addElement({ id: "a", type: "rating", title: "R" }, { container: { panel: "g" }, index: 0 })],
      ["remove", () => doc.removeElement("c")],
      ["move", () => doc.moveElement("a", { panel: "g" }, 1)],
      ["update", () => doc.updateElement("b", { title: "Bee", description: "d" })],
      ["duplicate", () => doc.duplicateElement("g")],
      ["page", () => doc.addPage({ title: "Third" })],
      ["movePage", () => doc.movePage("p2", 0)],
      ["updatePage", () => doc.updatePage("p1", { title: "First" })],
      ["removePage", () => doc.removePage("p1")],
      ["survey", () => doc.updateSurvey({ title: "New", description: "x" })],
      ["replace", () => doc.replace({ ...base(), title: "Replaced" })],
    ];
    const snapshots = [JSON.stringify(doc.survey)];
    for (const [name, step] of steps) {
      step();
      const now = JSON.stringify(doc.survey);
      expect(now, name).not.toBe(snapshots.at(-1));
      snapshots.push(now);
    }
    for (let i = snapshots.length - 2; i >= 0; i--) {
      expect(doc.undo()).toBe(true);
      expect(JSON.stringify(doc.survey)).toBe(snapshots[i]);
    }
    expect(doc.undo()).toBe(false);
    expect(JSON.stringify(doc.survey)).toBe(original);
    for (let i = 1; i < snapshots.length; i++) {
      expect(doc.redo()).toBe(true);
      expect(JSON.stringify(doc.survey)).toBe(snapshots[i]);
    }
    expect(doc.redo()).toBe(false);
  });

  it("gives added elements fresh ids", () => {
    const doc = new SurveyDocument(base());
    const id = doc.addElement({ id: "a", type: "text", title: "Copy" });
    expect(id).toBe("a2");
    const copy = doc.duplicateElement("g")!;
    expect(copy).toBe("g2");
    expect(ids(doc)[0]).toBe("a g(b) g2(b2)");
    expect(uniqueId(doc.survey, "p1")).toBe("p12");
  });

  it("moves within and across containers with before-move indexes", () => {
    const doc = new SurveyDocument(base());
    expect(doc.moveElement("a", { page: "p1" }, 2)).toBe(true);
    expect(ids(doc)[0]).toBe("g(b) a");
    expect(doc.moveElement("c", { panel: "g" }, 0)).toBe(true);
    expect(ids(doc)).toEqual(["g(c,b) a", ""]);
    expect(doc.nudgeElement("b", -1)).toBe(true);
    expect(ids(doc)[0]).toBe("g(b,c) a");
    expect(doc.nudgeElement("b", -1)).toBe(false);
    expect(doc.moveElement("a", { page: "p1" }, 2)).toBe(false); // already there
  });

  it("refuses impossible moves and edits", () => {
    const doc = new SurveyDocument(base());
    doc.addElement({ id: "inner", type: "panel", elements: [] }, { container: { panel: "g" } });
    expect(doc.moveElement("g", { panel: "g" }, 0)).toBe(false);
    expect(doc.moveElement("g", { panel: "inner" }, 0)).toBe(false);
    expect(doc.moveElement("a", { page: "nope" }, 0)).toBe(false);
    expect(doc.updateElement("a", { id: "b" })).toBe(false);
    expect(doc.removePage("p1")).toBe(true);
    expect(doc.removePage("p2")).toBe(false); // the last page stays
    doc.updateElement("c", { type: "panel", repeat: {}, elements: [] });
    const r = doc.addElement({ id: "r2", type: "panel", repeat: {}, elements: [] }, { container: { panel: "c" } });
    expect(r).toBeNull();
  });

  it("merges consecutive edits with the same merge key into one undo step", () => {
    const doc = new SurveyDocument(base());
    for (const t of ["H", "He", "Hel", "Hello"]) doc.updateElement("a", { title: t }, { mergeKey: "a.title" });
    doc.updateElement("a", { description: "x" }, { mergeKey: "a.description" });
    doc.undo();
    expect(doc.find("a")?.element).toEqual({ id: "a", type: "text", title: "Hello" });
    doc.undo();
    expect(doc.find("a")?.element).toEqual({ id: "a", type: "text", title: "A" });
  });

  it("tracks the selection, follows renames and drops deleted elements", () => {
    const doc = new SurveyDocument(base());
    const states: (string | null)[] = [];
    doc.subscribe((s) => states.push(s.selected));
    doc.select("b");
    doc.updateElement("b", { id: "bee" });
    expect(doc.selected).toBe("bee");
    doc.removeElement("bee");
    expect(doc.selected).toBeNull();
    doc.select("missing");
    expect(doc.selected).toBeNull();
    expect(states).toEqual([null, "b", "bee", null]);
  });

  it("adds into the selected element's container by default", () => {
    const doc = new SurveyDocument(base());
    doc.select("b");
    doc.addElement({ id: "n", type: "text", title: "N" });
    expect(ids(doc)[0]).toBe("a g(b,n)");
    doc.select("g");
    doc.addElement({ id: "m", type: "text", title: "M" });
    expect(ids(doc)[0]).toBe("a g(b,n,m)");
    expect(doc.selected).toBe("m");
  });

  it("names the undo and redo steps", () => {
    const doc = new SurveyDocument(base());
    expect(doc.state.undoLabel).toBeNull();
    doc.moveElement("a", { page: "p2" }, 0);
    expect(doc.state.undoLabel).toBe("Move");
    doc.undo();
    expect(doc.state).toMatchObject({ canUndo: false, canRedo: true, redoLabel: "Move" });
  });
});

describe("the consent preset", () => {
  it("adds a yes/no question marked as consent", async () => {
    const { newElement } = await import("../src/lib/doc/factory.js");
    const el = newElement("consent", { schemaVersion: 1, id: "s", title: "S", pages: [{ id: "p", elements: [] }] });
    expect(el).toMatchObject({ type: "boolean", consent: true });
  });
});
