// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mountSurvey } from "../src/index.js";
import { feedbackSurvey } from "./fixtures.js";

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
