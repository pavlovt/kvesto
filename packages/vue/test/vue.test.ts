// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { Survey, useSurvey } from "../src/index.js";

const survey = { schemaVersion: 1, id: "v", title: "Vue", pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Name" }] }] };

describe("@kvesto/vue", () => {
  it("<Survey> renders the survey, applies render options and emits complete", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    const onComplete = vi.fn();
    const app = createApp({ render: () => h(Survey, { survey, render: { theme: "dark" }, onComplete }) });
    app.mount(target);
    await nextTick();
    expect(target.querySelector(".kv-title")!.textContent).toBe("Vue");
    expect(target.querySelector("form")!.getAttribute("data-kv-theme")).toBe("dark");
    target.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onComplete).toHaveBeenCalledOnce();
    app.unmount();
  });

  it("useSurvey keeps a custom UI up to date", async () => {
    const target = document.createElement("div");
    let set: (v: string) => void = () => {};
    const Custom = defineComponent({
      setup() {
        const { model, state } = useSurvey({ survey });
        set = (v) => model.setValue("name", v);
        return () => h("p", `Hello ${String(state.value.answers.name ?? "")}`);
      },
    });
    const app = createApp(Custom);
    app.mount(target);
    set("Ana");
    await nextTick();
    expect(target.textContent).toBe("Hello Ana");
    app.unmount();
  });

  it("rebuilds when the survey changes", async () => {
    const target = document.createElement("div");
    const current = ref<object>(survey);
    const app = createApp({ render: () => h(Survey, { survey: current.value }) });
    app.mount(target);
    await nextTick();
    current.value = { ...survey, title: "Second" };
    await nextTick();
    expect(target.querySelector(".kv-title")!.textContent).toBe("Second");
    app.unmount();
  });
});
