import { isCustomQuestion, questionType, registeredQuestionTypes, type ElementInput, type QuestionType, type SurveyInput } from "@kvesto/core";
import { usedIds } from "./document.js";

/** What the palette can add: every question type, panels and repeating panels, and content blocks and images. */
export type PaletteKind = QuestionType | "panel" | "repeat" | "content" | "image";

export const QUESTION_TYPES: readonly QuestionType[] = [
  "text",
  "comment",
  "single-choice",
  "multiple-choice",
  "dropdown",
  "rating",
  "boolean",
  "matrix",
  "grid",
  "ranking",
  "file",
  "computed",
];

export const PALETTE: readonly { kind: PaletteKind; label: string }[] = [
  ...QUESTION_TYPES.map((kind) => ({ kind, label: kind })),
  { kind: "panel", label: "panel" },
  { kind: "repeat", label: "repeating panel" },
  { kind: "content", label: "text block" },
  { kind: "image", label: "image" },
];

/** The built-in palette plus every custom question type registered so far. */
export function palette(): { kind: PaletteKind; label: string }[] {
  const custom = registeredQuestionTypes().map((t) => ({ kind: t.type as PaletteKind, label: t.label ?? t.type }));
  return [...PALETTE.slice(0, QUESTION_TYPES.length), ...custom, ...PALETTE.slice(QUESTION_TYPES.length)];
}

const firstFree = (survey: SurveyInput, prefix: string, start: number) => {
  const ids = usedIds(survey);
  let n = start;
  while (ids.has(`${prefix}${n}`)) n++;
  return n;
};

const twoChoices = () => [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
];

/** A new element of a kind, with sensible defaults and an id not yet used in `survey`. */
export function newElement(kind: PaletteKind, survey: SurveyInput): ElementInput {
  if (kind === "panel" || kind === "repeat") {
    const n = firstFree(survey, "panel", 1);
    const id = `panel${n}`;
    return kind === "panel"
      ? { id, type: "panel", title: `Group ${n}`, elements: [] }
      : { id, type: "panel", title: `Group ${n}`, repeat: { min: 1 }, elements: [{ id: `${id}-q1`, type: "text", title: "Name" }] };
  }
  if (kind === "content" || kind === "image") {
    const n = firstFree(survey, kind, 1);
    return kind === "content"
      ? { id: `content${n}`, type: "content", markdown: "Some **text** for respondents." }
      : { id: `image${n}`, type: "image", src: "https://example.com/image.png", alt: "Describe the image" };
  }
  const count = usedIds(survey).size - survey.pages.length;
  const n = firstFree(survey, "q", count + 1);
  const base = { id: `q${n}`, title: `Question ${n}` };
  if (isCustomQuestion({ type: kind })) {
    return { ...base, ...questionType(kind)?.editorDefaults, type: kind } as ElementInput;
  }
  switch (kind) {
    case "single-choice":
    case "multiple-choice":
    case "dropdown":
    case "ranking":
      return { ...base, type: kind, choices: twoChoices() };
    case "rating":
      return { ...base, type: kind, min: 1, max: 5 };
    case "matrix":
      return {
        ...base,
        type: kind,
        rows: [
          { value: "row1", label: "Statement 1" },
          { value: "row2", label: "Statement 2" },
        ],
        columns: [
          { value: "disagree", label: "Disagree" },
          { value: "neutral", label: "Neutral" },
          { value: "agree", label: "Agree" },
        ],
      };
    case "grid":
      return {
        ...base,
        type: kind,
        rows: [
          { value: "row1", label: "Item 1" },
          { value: "row2", label: "Item 2" },
        ],
        columns: [
          { value: "name", label: "Name", cellType: "text" },
          { value: "amount", label: "Amount", cellType: "number" },
        ],
      };
    case "file":
      return { ...base, type: kind, maxFiles: 1, maxSize: 5 * 1024 * 1024 };
    case "computed":
      return { ...base, title: `Result ${n}`, type: kind, expr: "0" };
    default:
      return { ...base, type: kind };
  }
}
