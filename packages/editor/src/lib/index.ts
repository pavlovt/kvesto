export { default as SurveyEditor, type SurveyEditorProps } from "./SurveyEditor.svelte";
export { default as SurveyPreview } from "./SurveyPreview.svelte";
export { mountEditor, type MountedEditor } from "./mount.js";
export { starterSurvey } from "./starter.js";
export {
  SurveyDocument,
  createDocument,
  uniqueId,
  usedIds,
  type Container,
  type DocumentListener,
  type DocumentState,
  type ElementPosition,
  type RunOptions,
} from "./doc/document.js";
export { PALETTE, QUESTION_TYPES, newElement, type PaletteKind } from "./doc/factory.js";
export { canDropInto, describeTarget, dropTargets, type DropTarget } from "./doc/positions.js";
