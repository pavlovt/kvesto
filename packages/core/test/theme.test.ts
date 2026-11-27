// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SurveySchema, THEME_PRESETS, createSurvey, mountSurvey, renderSurvey, themeToCss, themeVariables } from "../src/index.js";

const survey = { schemaVersion: 1, id: "t", title: "T", pages: [{ id: "p", elements: [{ id: "a", type: "text", title: "A" }] }] };
const root = (target: HTMLElement) => target.querySelector<HTMLFormElement>("form.kv-survey")!;

describe("themes", () => {
  it("keep the default look without a theme", () => {
    const target = document.createElement("div");
    renderSurvey(target, createSurvey({ survey }));
    expect(root(target).hasAttribute("data-kv-theme")).toBe(false);
    expect(root(target).getAttribute("style")).toBeNull();
  });

  it("apply presets and variables, from the option or the survey", () => {
    const target = document.createElement("div");
    mountSurvey(target, { survey, theme: { preset: "dark", "color-primary": "#e11d48", radius: "0" } });
    expect(root(target).getAttribute("data-kv-theme")).toBe("dark");
    expect(root(target).style.getPropertyValue("--kv-color-primary")).toBe("#e11d48");
    expect(root(target).style.getPropertyValue("--kv-radius")).toBe("0");

    const other = document.createElement("div");
    mountSurvey(other, { survey: { ...survey, settings: { theme: "auto" } } });
    expect(root(other).getAttribute("data-kv-theme")).toBe("auto");
  });

  it("drop values that could break out of a declaration", () => {
    expect(themeVariables({ "color-primary": "red; } body { display: none", gap: "2rem", "Bad Name": "x" })).toEqual([["--kv-gap", "2rem"]]);
    expect(SurveySchema.safeParse({ ...survey, settings: { theme: { "color-primary": "red}" } } }).success).toBe(false);
    expect(SurveySchema.safeParse({ ...survey, settings: { theme: { "color-primary": "#123" } } }).success).toBe(true);
  });

  it("export as CSS", () => {
    expect(themeToCss({ preset: "dark", "color-primary": "#e11d48" })).toBe(
      '/* Preset: add data-kv-theme="dark" to the survey element, or pass theme: "dark". */\n.kv-survey {\n  --kv-color-primary: #e11d48;\n}\n',
    );
  });

  it("have a rule in the stylesheet for every preset, and dark values for auto", () => {
    // Tests run from the package folder (import.meta.url is not a file URL under happy-dom).
    const css = readFileSync("styles.css", "utf8");
    for (const preset of THEME_PRESETS.filter((p) => p !== "light")) expect(css, preset).toContain(`[data-kv-theme="${preset}"]`);
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*\.kv-survey\[data-kv-theme="auto"\]/);
  });
});
