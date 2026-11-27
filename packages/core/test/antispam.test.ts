// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createSurvey, mountSurvey, type SurveyInput } from "../src/index.js";

const survey = (antiSpam: Record<string, unknown>): SurveyInput => ({
  schemaVersion: 1,
  id: "spam",
  title: "Spam",
  settings: { antiSpam },
  pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Name" }] }],
});

describe("anti-spam in the runner", () => {
  it("renders a honeypot people can't reach, and sends what a bot typed in it", async () => {
    const target = document.createElement("div");
    const onComplete = vi.fn();
    const { model } = mountSurvey(target, { survey: survey({ honeypot: true }), onComplete });
    const box = target.querySelector<HTMLElement>(".kv-hp")!;
    expect(box.getAttribute("aria-hidden")).toBe("true");
    const trap = box.querySelector("input")!;
    expect(trap.tabIndex).toBe(-1);
    trap.value = "http://spam.test";
    trap.dispatchEvent(new Event("input"));
    model.setValue("name", "Bot");
    const result = await model.complete();
    expect(result?.response.meta?.honeypot).toBe("http://spam.test");
  });

  it("has no honeypot unless the survey asks for one", () => {
    const target = document.createElement("div");
    mountSurvey(target, { survey: survey({}) });
    expect(target.querySelector(".kv-hp")).toBeNull();
  });

  it("asks the challenge hook for a token on submit", async () => {
    const model = createSurvey({ survey: survey({ challenge: true }), challenge: async () => "token-1" });
    model.setValue("name", "Ana");
    expect((await model.complete())?.response.meta?.challenge).toBe("token-1");
    const failing = createSurvey({ survey: survey({ challenge: true }), challenge: async () => Promise.reject(new Error("No CAPTCHA")) });
    expect(await failing.complete()).toBeNull();
    expect(failing.snapshot.submitError).toBe("No CAPTCHA");
  });
});
