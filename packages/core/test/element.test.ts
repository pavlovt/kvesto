// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { defineSurveyElement, memoryStorage } from "../src/index.js";

const survey = { schemaVersion: 1, id: "wc", title: "Web component", pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Name" }] }] };
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("<kvesto-survey>", () => {
  defineSurveyElement();

  it("renders a survey from an inline script and fires events", async () => {
    const el = document.createElement("kvesto-survey");
    el.setAttribute("theme", "dark");
    el.innerHTML = `<script type="application/json">${JSON.stringify(survey)}</script>`;
    const changes = vi.fn();
    const done = vi.fn();
    el.addEventListener("kvesto-change", changes);
    el.addEventListener("kvesto-complete", done);
    document.body.append(el);
    await tick();
    expect(el.querySelector(".kv-title")!.textContent).toBe("Web component");
    expect(el.querySelector("form")!.getAttribute("data-kv-theme")).toBe("dark");
    const input = el.querySelector<HTMLInputElement>('[data-question="name"] input')!;
    input.value = "Ana";
    input.dispatchEvent(new Event("input"));
    expect(changes).toHaveBeenCalled();
    el.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await tick();
    expect(done.mock.calls[0]![0].detail.response.answers).toEqual({ name: "Ana" });
    el.remove();
  });

  it("takes the survey as a property, with options, and re-renders on attribute changes", async () => {
    const el = document.createElement("kvesto-survey") as HTMLElement & { survey: unknown; options: object; model: { locale: string } | null };
    el.options = { labels: { complete: "Send it" } };
    el.survey = survey;
    document.body.append(el);
    await tick();
    expect(el.querySelector(".kv-next")!.textContent).toBe("Send it");
    el.setAttribute("locale", "de");
    await tick();
    expect(el.model!.locale).toBe("de");
    el.remove();
  });

  it("loads a survey by id from storage", async () => {
    const storage = memoryStorage([survey as never]);
    const el = document.createElement("kvesto-survey") as HTMLElement & { options: object };
    el.setAttribute("survey-id", "wc");
    el.options = { storage };
    document.body.append(el);
    await tick();
    expect(el.querySelector(".kv-title")!.textContent).toBe("Web component");
    el.remove();
  });

  it("can be defined twice without throwing", () => {
    expect(defineSurveyElement()).toBe(customElements.get("kvesto-survey"));
  });
});
