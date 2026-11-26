import { mount, unmount } from "svelte";
import SurveyEditor, { type SurveyEditorProps } from "./SurveyEditor.svelte";

export interface MountedEditor {
  destroy(): void;
}

/** Render the survey editor into a DOM element, for apps that don't use Svelte themselves. */
export function mountEditor(target: Element, props: SurveyEditorProps = {}): MountedEditor {
  const app = mount(SurveyEditor, { target, props });
  return { destroy: () => void unmount(app) };
}
