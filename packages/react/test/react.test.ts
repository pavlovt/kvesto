// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Survey, useSurvey } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const survey = { schemaVersion: 1, id: "r", title: "React", pages: [{ id: "p", elements: [{ id: "name", type: "text", title: "Name" }] }] };

describe("@kvesto/react", () => {
  it("<Survey> renders the survey and reports completion", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    const onComplete = vi.fn();
    const root = createRoot(target);
    await act(async () => root.render(createElement(Survey, { survey, onComplete, theme: "dark", className: "box" })));
    expect(target.querySelector("div.box .kv-title")!.textContent).toBe("React");
    expect(target.querySelector("form")!.getAttribute("data-kv-theme")).toBe("dark");
    await act(async () => {
      target.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    });
    expect(onComplete).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    target.remove();
  });

  it("useSurvey re-renders a custom UI as answers change", async () => {
    const target = document.createElement("div");
    let set: (v: string) => void = () => {};
    function Custom() {
      const { model, state } = useSurvey({ survey });
      set = (v) => model.setValue("name", v);
      return createElement("p", null, `Hello ${String(state.answers.name ?? "")}`);
    }
    const root = createRoot(target);
    await act(async () => root.render(createElement(Custom)));
    expect(target.textContent).toBe("Hello ");
    await act(async () => set("Ana"));
    expect(target.textContent).toBe("Hello Ana");
    await act(async () => root.unmount());
  });

  it("rebuilds when the survey changes", async () => {
    const target = document.createElement("div");
    let swap: () => void = () => {};
    function App() {
      const [s, setS] = useState<object>(survey);
      swap = () => setS({ ...survey, title: "Second" });
      return createElement(Survey, { survey: s });
    }
    const root = createRoot(target);
    await act(async () => root.render(createElement(App)));
    await act(async () => swap());
    expect(target.querySelector(".kv-title")!.textContent).toBe("Second");
    await act(async () => root.unmount());
  });
});
