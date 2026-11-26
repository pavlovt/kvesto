import type { AnswerValue, Question } from "@kvesto/schema";

function isEmpty(value: AnswerValue | undefined): boolean {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

/** Returns an error message for one answer, or null when it is valid. */
export function validateAnswer(question: Question, value: AnswerValue | undefined): string | null {
  if (isEmpty(value)) return question.required ? "This question is required." : null;

  switch (question.type) {
    case "text":
    case "comment":
      if (typeof value !== "string") return "Expected text.";
      if (question.type === "text" && question.inputType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return "Enter a valid email address.";
      }
      return null;
    case "single-choice":
    case "dropdown":
      return typeof value === "string" && question.choices.some((c) => c.value === value)
        ? null
        : "Choose one of the options.";
    case "multiple-choice":
      return Array.isArray(value) && value.every((v) => question.choices.some((c) => c.value === v))
        ? null
        : "Choose from the options.";
    case "rating":
      return typeof value === "number" && Number.isInteger(value) && value >= question.min && value <= question.max
        ? null
        : `Choose a rating from ${question.min} to ${question.max}.`;
    case "boolean":
      return typeof value === "boolean" ? null : "Choose yes or no.";
  }
}
