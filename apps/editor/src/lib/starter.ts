import type { SurveyInput } from "@kvesto/core";

export const starterSurvey: SurveyInput = {
  schemaVersion: 1,
  id: "customer-feedback",
  title: "Customer feedback",
  description: "Two minutes, five questions.",
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
      ],
    },
    {
      id: "opinion",
      elements: [
        { id: "nps", type: "rating", title: "How likely are you to recommend us?", min: 0, max: 10, required: true },
        { id: "again", type: "boolean", title: "Would you use it again?" },
        { id: "comment", type: "comment", title: "Anything else?" },
      ],
    },
  ],
};
