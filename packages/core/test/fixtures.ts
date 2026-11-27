import type { SurveyInput } from "@kvesto/schema";

export const feedbackSurvey: SurveyInput = {
  schemaVersion: 1,
  id: "feedback",
  title: "Product feedback",
  pages: [
    {
      id: "about",
      elements: [
        { id: "email", type: "text", inputType: "email", title: "Email", required: true },
        {
          id: "role",
          type: "single-choice",
          title: "Your role",
          choices: [
            { value: "dev", label: "Developer" },
            { value: "pm", label: "Product manager" },
          ],
        },
      ],
    },
    {
      id: "rating",
      elements: [
        { id: "score", type: "rating", title: "How likely are you to recommend us?", min: 0, max: 10, required: true },
        { id: "comment", type: "comment", title: "Anything else?" },
      ],
    },
  ],
};

/** Exercises conditional logic and the matrix, ranking and file question types. */
export const advancedSurvey: SurveyInput = {
  schemaVersion: 1,
  id: "advanced",
  title: "Advanced",
  pages: [
    {
      id: "start",
      elements: [
        {
          id: "role",
          type: "single-choice",
          title: "Your role",
          required: true,
          choices: [
            { value: "dev", label: "Developer" },
            { value: "pm", label: "Product manager" },
          ],
        },
        {
          id: "stack",
          type: "text",
          title: "Your stack",
          visibleIf: { question: "role", op: "eq", value: "dev" },
          required: true,
        },
        {
          id: "quality",
          type: "matrix",
          title: "Rate us",
          rows: [
            { value: "speed", label: "Speed" },
            { value: "support", label: "Support" },
          ],
          columns: [
            { value: "poor", label: "Poor" },
            { value: "ok", label: "OK" },
            { value: "good", label: "Good" },
          ],
        },
        {
          id: "why",
          type: "comment",
          title: "What went wrong?",
          requiredIf: { any: [{ question: "quality", row: "speed", op: "eq", value: "poor" }, { question: "quality", row: "support", op: "eq", value: "poor" }] },
        },
      ],
    },
    {
      id: "devs",
      visibleIf: { question: "role", op: "eq", value: "dev" },
      elements: [
        {
          id: "priorities",
          type: "ranking",
          title: "Order by importance",
          choices: [
            { value: "docs", label: "Docs" },
            { value: "speed", label: "Speed" },
            { value: "price", label: "Price" },
          ],
        },
      ],
    },
    {
      id: "end",
      elements: [{ id: "screenshot", type: "file", title: "Screenshot", accept: ["image/*"], maxSize: 1024, maxFiles: 2 }],
    },
  ],
};

/** Nested panels with conditions on the panels and inside them. */
export const panelSurvey: SurveyInput = {
  schemaVersion: 1,
  id: "pets",
  title: "Pets",
  pages: [
    {
      id: "p1",
      elements: [
        { id: "hasPet", type: "boolean", title: "Do you have a pet?", required: true },
        {
          id: "pet",
          type: "panel",
          title: "About your pet",
          description: "Tell us a little more.",
          visibleIf: { question: "hasPet", op: "eq", value: true },
          elements: [
            { id: "petName", type: "text", title: "Name", required: true },
            {
              id: "health",
              type: "panel",
              title: "Health",
              elements: [
                { id: "vet", type: "boolean", title: "Seen a vet this year?" },
                { id: "vetName", type: "text", title: "Which vet?", visibleIf: { question: "vet", op: "eq", value: true } },
              ],
            },
          ],
        },
        { id: "comment", type: "comment", title: "Anything else?" },
      ],
    },
  ],
};
