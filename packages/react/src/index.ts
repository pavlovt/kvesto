/**
 * React bindings for Kvesto. `useSurvey` gives you the headless model and its
 * state for your own UI; `<Survey>` renders the bundled DOM renderer.
 */
import {
  createSurvey,
  renderSurvey,
  type CreateSurveyOptions,
  type RenderOptions,
  type SurveyModel,
  type SurveyState,
} from "@kvesto/core";
import { createElement, useEffect, useRef, useState, useSyncExternalStore, type HTMLAttributes, type ReactElement } from "react";

export type UseSurveyOptions = CreateSurveyOptions;

/**
 * A survey model and its current state, re-rendering on every change. The
 * model is created once per `survey` value; pass a stable object (state,
 * `useMemo` or a module constant).
 */
export function useSurvey(options: UseSurveyOptions): { model: SurveyModel; state: SurveyState } {
  const [model, setModel] = useState(() => createSurvey(options));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setModel(createSurvey(options));
    // A new survey (or locale) means a new model; other options are read when they are used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.survey, options.locale]);
  const state = useSyncExternalStore(
    (onChange) => model.subscribe(() => onChange()),
    () => model.snapshot,
    () => model.snapshot,
  );
  return { model, state };
}

export type SurveyProps = CreateSurveyOptions &
  RenderOptions &
  Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
    /** Use this model instead of creating one (for example from `useSurvey`). */
    model?: SurveyModel;
  };

const MODEL_KEYS = [
  "survey", "storage", "onComplete", "onChange", "initialAnswers", "meta", "validators", "functions", "now",
  "locale", "resume", "autoSaveProgress", "onProgress", "hidden", "hiddenFromUrl",
] as const;
const RENDER_KEYS = ["labels", "sanitizeHtml", "layout", "progressBar", "autoAdvance", "theme"] as const;

/** Renders a survey with Kvesto's DOM renderer. Import `@kvesto/core/styles.css` (or your own CSS) for the look. */
export function Survey(props: SurveyProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const modelOptions = Object.fromEntries(MODEL_KEYS.filter((k) => k in props).map((k) => [k, props[k]])) as unknown as CreateSurveyOptions;
  const renderOptions = Object.fromEntries(RENDER_KEYS.filter((k) => k in props && props[k] !== undefined).map((k) => [k, props[k]])) as RenderOptions;
  const rest = Object.fromEntries(Object.entries(props).filter(([k]) => k !== "model" && !(MODEL_KEYS as readonly string[]).includes(k) && !(RENDER_KEYS as readonly string[]).includes(k)));
  const latest = useRef({ modelOptions, renderOptions });
  latest.current = { modelOptions, renderOptions };

  useEffect(() => {
    if (!ref.current) return;
    const { modelOptions: m, renderOptions: r } = latest.current;
    const view = renderSurvey(ref.current, props.model ?? createSurvey(m), r);
    return () => view.destroy();
    // Rebuilt when the survey, model, locale, layout or theme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.model, props.survey, props.locale, props.layout, JSON.stringify(props.theme ?? null)]);

  return createElement("div", { ...rest, ref });
}
