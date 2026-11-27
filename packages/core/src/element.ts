/**
 * `<kvesto-survey>`: a custom element that renders a survey, for plain HTML
 * and any framework. It renders into its own children (no shadow DOM), so
 * `@kvesto/core/styles.css` and your own CSS apply as usual.
 *
 * ```html
 * <kvesto-survey api="https://example.com/api" survey-id="feedback" locale="de" theme="auto"></kvesto-survey>
 * <kvesto-survey>
 *   <script type="application/json">{ "schemaVersion": 1, … }</script>
 * </kvesto-survey>
 * ```
 *
 * Or set `element.survey` (and `element.options`) from script. It fires
 * `kvesto-complete` (detail: the completion result) and `kvesto-change`
 * (detail: `{ answers, questionId }`).
 */
import { httpStorage } from "./adapters/http.js";
import { createSurvey, type CreateSurveyOptions } from "./model.js";
import { renderSurvey, type RenderedSurvey, type RenderOptions } from "./render.js";
import type { Theme } from "./theme.js";

export type SurveyElementOptions = Omit<CreateSurveyOptions, "survey"> & RenderOptions;

const ATTRIBUTES = ["api", "survey-id", "locale", "layout", "theme"] as const;

/**
 * Register the element (default tag `kvesto-survey`). Safe to call more than
 * once. Returns the element class.
 */
export function defineSurveyElement(tag = "kvesto-survey"): CustomElementConstructor {
  const existing = customElements.get(tag);
  if (existing) return existing;

  class KvestoSurveyElement extends HTMLElement {
    static observedAttributes = ATTRIBUTES;
    #survey: unknown;
    #options: SurveyElementOptions = {};
    #view: RenderedSurvey | null = null;
    #run = 0;

    /** Survey JSON, instead of an inline script or `api` + `survey-id`. */
    get survey(): unknown {
      return this.#survey;
    }
    set survey(value: unknown) {
      this.#survey = value;
      this.#render();
    }

    /** Any `createSurvey` and render options (storage, hidden fields, functions, …). Attributes win. */
    get options(): SurveyElementOptions {
      return this.#options;
    }
    set options(value: SurveyElementOptions) {
      this.#options = value ?? {};
      this.#render();
    }

    /** The running survey model, once rendered. */
    get model() {
      return this.#view?.model ?? null;
    }

    connectedCallback() {
      this.#render();
    }
    disconnectedCallback() {
      this.#view?.destroy();
      this.#view = null;
    }
    attributeChangedCallback() {
      if (this.isConnected) this.#render();
    }

    async #render() {
      if (!this.isConnected) return;
      const run = ++this.#run;
      const api = this.getAttribute("api");
      const storage = this.#options.storage ?? (api ? httpStorage({ baseUrl: api }) : undefined);
      let survey = this.#survey;
      if (survey === undefined) {
        const inline = this.querySelector<HTMLScriptElement>(':scope > script[type="application/json"]');
        if (inline?.textContent) survey = JSON.parse(inline.textContent);
      }
      const id = this.getAttribute("survey-id");
      if (survey === undefined && id && storage) survey = await storage.loadSurvey(id);
      // Another render started while this one waited.
      if (run !== this.#run || survey === undefined || survey === null) return;
      this.#view?.destroy();
      const host = document.createElement("div");
      this.replaceChildren(host);
      const attr = (name: string) => this.getAttribute(name) ?? undefined;
      const layout = attr("layout");
      const theme = attr("theme");
      const locale = attr("locale");
      const model = createSurvey({
        ...this.#options,
        survey,
        ...(storage ? { storage } : {}),
        ...(locale ? { locale } : {}),
        onComplete: (result) => {
          this.dispatchEvent(new CustomEvent("kvesto-complete", { detail: result, bubbles: true }));
          return this.#options.onComplete?.(result);
        },
        onChange: (answers, questionId) => {
          this.dispatchEvent(new CustomEvent("kvesto-change", { detail: { answers, questionId }, bubbles: true }));
          this.#options.onChange?.(answers, questionId);
        },
      });
      this.#view = renderSurvey(host, model, {
        ...this.#options,
        ...(layout === "page" || layout === "question" ? { layout } : {}),
        ...(theme ? { theme: theme as Theme } : {}),
      });
    }
  }

  customElements.define(tag, KvestoSurveyElement);
  return KvestoSurveyElement;
}
