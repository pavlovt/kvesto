// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mountSurvey } from "../src/index.js";
import { advancedSurvey, feedbackSurvey } from "./fixtures.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("renderSurvey", () => {
  it("renders pages, validates and completes", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    const onComplete = vi.fn();
    const { destroy } = mountSurvey(target, { survey: feedbackSurvey, onComplete });

    const form = target.querySelector("form")!;
    expect(target.querySelector(".kv-title")?.textContent).toBe("Product feedback");

    form.requestSubmit();
    expect(target.querySelector<HTMLElement>('[data-question="email"] .kv-error')?.hidden).toBe(false);

    const email = target.querySelector<HTMLInputElement>('input[type="email"]')!;
    email.value = "a@b.co";
    email.dispatchEvent(new Event("input"));
    form.requestSubmit();
    expect(target.querySelector('[data-question="score"]')).not.toBeNull();

    const nine = target.querySelector<HTMLInputElement>('[data-question="score"] input[value="9"]')!;
    nine.checked = true;
    nine.dispatchEvent(new Event("change"));
    form.requestSubmit();
    await tick();

    expect(onComplete).toHaveBeenCalledOnce();
    expect(target.querySelector(".kv-completed")).not.toBeNull();
    destroy();
    expect(target.children).toHaveLength(0);
  });
});

describe("renderSurvey with logic and new types", () => {
  const setup = () => {
    const target = document.createElement("div");
    document.body.append(target);
    const onComplete = vi.fn();
    const view = mountSurvey(target, { survey: advancedSurvey, onComplete });
    const q = (id: string) => target.querySelector<HTMLElement>(`[data-question="${id}"]`)!;
    const pick = (input: HTMLInputElement) => {
      input.checked = true;
      input.dispatchEvent(new Event("change"));
    };
    return { target, view, onComplete, q, pick, form: target.querySelector("form")! };
  };

  it("shows and hides questions without re-rendering the page", () => {
    const { q, pick, view } = setup();
    expect(q("stack").hidden).toBe(true);
    const roleInput = q("role").querySelector<HTMLInputElement>('input[value="dev"]')!;
    pick(roleInput);
    expect(q("stack").hidden).toBe(false);
    // Same element: the page was not rebuilt.
    expect(q("role").querySelector('input[value="dev"]')).toBe(roleInput);
    pick(q("role").querySelector<HTMLInputElement>('input[value="pm"]')!);
    expect(q("stack").hidden).toBe(true);
    view.destroy();
  });

  it("toggles the required marker with requiredIf", () => {
    const { q, pick, view, target } = setup();
    const star = () => q("why").querySelector<HTMLElement>(".kv-required")!;
    expect(star().hidden).toBe(true);
    const cell = target.querySelector<HTMLInputElement>('input[name$="-row-support"][value="poor"]')!;
    pick(cell);
    expect(view.model.getValue("quality")).toEqual({ support: "poor" });
    expect(star().hidden).toBe(false);
    view.destroy();
  });

  it("renders a matrix as a table with one radio group per row", () => {
    const { q, pick, view } = setup();
    const table = q("quality").querySelector("table")!;
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Poor", "OK", "Good"]);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    const speed = [...table.querySelectorAll<HTMLInputElement>('tbody tr:first-child input')];
    pick(speed[2]!);
    pick(speed[0]!);
    expect(view.model.getValue("quality")).toEqual({ speed: "poor" });
    view.destroy();
  });

  it("reorders a ranking with the arrow buttons and the keep button", async () => {
    const { q, pick, form, view, target } = setup();
    pick(q("role").querySelector<HTMLInputElement>('input[value="dev"]')!);
    const stack = q("stack").querySelector("input")!;
    stack.value = "svelte";
    stack.dispatchEvent(new Event("input"));
    form.requestSubmit();
    expect(view.model.snapshot.page.id).toBe("devs");

    const labels = () => [...target.querySelectorAll(".kv-ranking-label")].map((el) => el.textContent);
    expect(labels()).toEqual(["Docs", "Speed", "Price"]);
    const keep = target.querySelector<HTMLButtonElement>(".kv-ranking-keep")!;
    expect(keep.hidden).toBe(false);
    target.querySelectorAll<HTMLButtonElement>(".kv-ranking-down")[0]!.click();
    expect(labels()).toEqual(["Speed", "Docs", "Price"]);
    expect(view.model.getValue("priorities")).toEqual(["speed", "docs", "price"]);
    expect(keep.hidden).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move down: Docs");
    target.querySelectorAll<HTMLButtonElement>(".kv-ranking-up")[2]!.click();
    expect(labels()).toEqual(["Speed", "Price", "Docs"]);
    view.destroy();
  });

  it("lists uploaded files and removes them", async () => {
    const { q, pick, form, view } = setup();
    pick(q("role").querySelector<HTMLInputElement>('input[value="pm"]')!);
    form.requestSubmit();
    expect(view.model.snapshot.page.id).toBe("end");
    const input = q("screenshot").querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe("image/*");
    expect(input.multiple).toBe(true);

    await view.model.addFiles("screenshot", [new File([new Uint8Array(5)], "shot.png", { type: "image/png" })]);
    expect(q("screenshot").querySelector(".kv-file-name")?.textContent).toBe("shot.png");
    q("screenshot").querySelector<HTMLButtonElement>(".kv-file-remove")!.click();
    expect(q("screenshot").querySelectorAll(".kv-file")).toHaveLength(0);
    view.destroy();
  });
});
