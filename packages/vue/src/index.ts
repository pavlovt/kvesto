/**
 * Vue bindings for Kvesto. `useSurvey` gives you the headless model and a
 * reactive state for your own UI; `<Survey>` renders the bundled DOM renderer.
 */
import {
  createSurvey,
  renderSurvey,
  type CreateSurveyOptions,
  type RenderedSurvey,
  type RenderOptions,
  type SurveyModel,
  type SurveyState,
} from "@kvesto/core";
import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, type PropType, type ShallowRef } from "vue";

/** A survey model and its state as a shallow ref that updates on every change. Unsubscribes when the component unmounts. */
export function useSurvey(options: CreateSurveyOptions): { model: SurveyModel; state: ShallowRef<SurveyState> } {
  const model = createSurvey(options);
  const state = shallowRef(model.snapshot);
  const stop = model.subscribe((s) => (state.value = s));
  onBeforeUnmount(stop);
  return { model, state };
}

/** Renders a survey with Kvesto's DOM renderer. Emits `complete` and `change`. */
export const Survey = defineComponent({
  name: "KvestoSurvey",
  props: {
    survey: { type: null as unknown as PropType<unknown>, required: false },
    /** Use this model instead of creating one. */
    model: { type: Object as PropType<SurveyModel>, required: false },
    /** Any other `createSurvey` options (storage, locale, hidden, functions, …). */
    options: { type: Object as PropType<Omit<CreateSurveyOptions, "survey">>, default: () => ({}) },
    /** Render options (theme, layout, labels, …). */
    render: { type: Object as PropType<RenderOptions>, default: () => ({}) },
  },
  emits: ["complete", "change"],
  setup(props, { emit }) {
    const el = ref<HTMLDivElement>();
    let view: RenderedSurvey | null = null;
    const mount = () => {
      view?.destroy();
      if (!el.value || (!props.model && props.survey === undefined)) return;
      const model =
        props.model ??
        createSurvey({
          ...props.options,
          survey: props.survey,
          onComplete: (result) => {
            emit("complete", result);
            return props.options.onComplete?.(result);
          },
          onChange: (answers, questionId) => {
            emit("change", answers, questionId);
            props.options.onChange?.(answers, questionId);
          },
        });
      view = renderSurvey(el.value, model, props.render);
    };
    onMounted(mount);
    watch(() => [props.survey, props.model, props.options.locale, props.render.theme, props.render.layout], mount);
    onBeforeUnmount(() => view?.destroy());
    return () => h("div", { ref: el });
  },
});
