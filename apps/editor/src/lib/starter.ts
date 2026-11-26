import type { SurveyInput } from "@kvesto/core";

export const starterSurvey: SurveyInput = {
  schemaVersion: 1,
  id: "customer-feedback",
  title: "Customer feedback",
  description: "Two minutes, a handful of questions.",
  pages: [
    {
      id: "about-you",
      elements: [
        { id: "email", type: "text", inputType: "email", title: "Your email", required: true },
        {
          id: "role",
          type: "single-choice",
          title: "What describes you best?",
          choices: [
            { value: "dev", label: "Developer" },
            { value: "design", label: "Designer" },
            { value: "other", label: "Something else" },
          ],
        },
        {
          id: "role-other",
          type: "text",
          title: "What do you do?",
          // Conditional logic: only shown when "Something else" is picked.
          visibleIf: { question: "role", op: "eq", value: "other" },
        },
      ],
    },
    {
      id: "opinion",
      elements: [
        { id: "nps", type: "rating", title: "How likely are you to recommend us?", min: 0, max: 10, required: true },
        {
          id: "quality",
          type: "matrix",
          title: "How do we do on…",
          rows: [
            { value: "speed", label: "Speed" },
            { value: "support", label: "Support" },
            { value: "price", label: "Price" },
          ],
          columns: [
            { value: "poor", label: "Poor" },
            { value: "ok", label: "OK" },
            { value: "good", label: "Good" },
          ],
        },
        {
          id: "priorities",
          type: "ranking",
          title: "What should we improve first?",
          choices: [
            { value: "docs", label: "Documentation" },
            { value: "speed", label: "Performance" },
            { value: "features", label: "New features" },
          ],
        },
        { id: "again", type: "boolean", title: "Would you use it again?" },
        {
          id: "comment",
          type: "comment",
          title: "What would bring you back?",
          visibleIf: { question: "again", op: "eq", value: false },
          requiredIf: { question: "nps", op: "lte", value: 6 },
        },
        { id: "screenshot", type: "file", title: "Attach a screenshot (optional)", accept: ["image/*"], maxSize: 2097152 },
      ],
    },
  ],
};
