import axe from "axe-core";
import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { mountEditor } from "../src/lib/index.js";

async function violations(root: Element) {
  const result = await axe.run(root, { resultTypes: ["violations"], rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

describe("editor accessibility", () => {
  for (const tab of ["Design", "JSON", "Translations", "Theme"]) {
    it(`has no axe violations on the ${tab} tab`, async () => {
      const target = document.createElement("main");
      document.body.append(target);
      const editor = mountEditor(target, { preview: false });
      flushSync();
      [...target.querySelectorAll<HTMLButtonElement>(".kv-editor-tabs button")].find((b) => b.textContent === tab)!.click();
      flushSync();
      if (tab === "Design") {
        target.querySelector<HTMLElement>("[data-outline] .kv-outline-select")!.click();
        flushSync();
      }
      expect(await violations(target)).toEqual([]);
      editor.destroy();
      target.remove();
    });
  }
});
