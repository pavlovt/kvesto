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
