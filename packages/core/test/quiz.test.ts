// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSurvey, migrateSurvey, renderSurvey, resolveLogic, scoreQuestion, scoreSurvey } from "../src/index.js";

const abc = [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C" }];
const quiz = migrateSurvey({
  schemaVersion: 1,
  id: "quiz",
  title: "Quiz",
  settings: { quiz: { passMark: 0.5, showCorrect: true } },
  pages: [
    {
      id: "p1",
      elements: [
        { id: "capital", type: "single-choice", title: "Capital of France?", choices: abc, correctAnswer: "b", feedback: { correct: "Well done", wrong: "It is Paris" } },
        { id: "primes", type: "multiple-choice", title: "Primes?", choices: abc, correctAnswer: ["a", "c"], points: 2, partialCredit: true, penalty: 0.5 },
        { id: "word", type: "text", title: "Say hello", correctAnswer: "Hello" },
        { id: "order", type: "ranking", title: "Order", choices: abc, correctAnswer: ["a", "b", "c"] },
        { id: "m", type: "matrix", title: "M", rows: [{ value: "r1", label: "R1" }, { value: "r2", label: "R2" }], columns: abc, correctAnswer: { r1: "a", r2: "b" }, partialCredit: true },
      ],
    },
  ],
});

describe("scoring", () => {
  const q = (id: string) => quiz.pages[0]!.elements.find((e) => e.id === id) as never;
  it.each([
    ["capital", "b", 1, true],
    ["capital", "a", 0, false],
    ["primes", ["a", "c"], 2, true],
    ["primes", ["a"], 1, false],
    ["primes", ["a", "b"], 0.5, false],
    ["primes", ["b"], 0, false],
    ["word", "  hello ", 1, true],
    ["order", ["a", "b", "c"], 1, true],
    ["order", ["b", "a", "c"], 0, false],
    ["m", { r1: "a", r2: "c" }, 0.5, false],
  ])("%s %j → %s", (id, value, score, correct) => {
    expect(scoreQuestion(q(id), value as never)).toMatchObject({ score, correct });
  });

  it("scores assessments by choice scores, and passes against the pass mark", () => {
    const survey = migrateSurvey({
      schemaVersion: 1,
      id: "a",
      title: "A",
      settings: { quiz: { passMark: 0.6 } },
      variables: [{ name: "level", expr: "iif(score() >= 4, 'advanced', 'beginner')" }],
      pages: [
        {
          id: "p",
          elements: [
            { id: "x", type: "single-choice", title: "X", choices: [{ value: "lo", label: "Lo", score: 1 }, { value: "hi", label: "Hi", score: 3 }] },
            { id: "y", type: "multiple-choice", title: "Y", choices: [{ value: "u", label: "U", score: 1 }, { value: "v", label: "V", score: 2 }, { value: "w", label: "W", score: -1 }] },
          ],
        },
      ],
    });
    expect(scoreSurvey(survey, { x: "hi", y: ["u", "w"] })).toMatchObject({ score: 3, max: 6, passed: false });
    expect(scoreSurvey(survey, { x: "hi", y: ["u", "v"] })).toMatchObject({ score: 6, passed: true });
    expect(resolveLogic(survey, { x: "hi", y: ["u"] }).variables.level).toBe("advanced");
    expect(resolveLogic(survey, { x: "lo" }).variables.level).toBe("beginner");
  });
});

describe("quiz runner", () => {
  afterEach(() => vi.useRealTimers());

  it("shows the score, pass or fail and the correct answers after submitting", async () => {
    const target = document.createElement("div");
    const model = createSurvey({ survey: quiz });
    renderSurvey(target, model);
    model.setValue("capital", "a");
    model.setValue("primes", ["a", "c"]);
    const result = await model.complete();
    expect(result!.response.meta).toEqual({ quiz: { score: 2, max: 6, passed: false } });
    expect(target.querySelector(".kv-quiz-score")!.textContent).toBe("Your score: 2 of 6.");
    expect(target.querySelector(".kv-quiz-failed")!.textContent).toBe("You did not pass this time.");
    const first = target.querySelector(".kv-quiz-answers li")!;
    expect(first.classList.contains("kv-quiz-wrong")).toBe(true);
    expect(first.textContent).toContain("Correct answer: B");
    expect(first.textContent).toContain("It is Paris");
  });

  it("keeps the score back when it is released by hand", async () => {
    const target = document.createElement("div");
    const manual = migrateSurvey({ ...quiz, settings: { quiz: { releaseScores: "manual" } } });
    const model = createSurvey({ survey: manual });
    renderSurvey(target, model);
    await model.complete();
    expect(target.querySelector(".kv-quiz-score")).toBeNull();
    expect(target.querySelector(".kv-quiz-later")!.textContent).toBe("Your score will be shared with you later.");
  });

  it("moves on when a page's time runs out, and submits when the survey's does", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const timed = migrateSurvey({
      schemaVersion: 1,
      id: "timed",
      title: "Timed",
      settings: { quiz: { timeLimit: 60 } },
      pages: [
        { id: "p1", timeLimit: 10, elements: [{ id: "a", type: "text", title: "A", required: true }] },
        { id: "p2", elements: [{ id: "b", type: "text", title: "B", required: true }] },
      ],
    });
    const target = document.createElement("div");
    const model = createSurvey({ survey: timed, onComplete });
    renderSurvey(target, model);
    expect(model.deadline).toBe(Date.now() + 10_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(target.querySelector(".kv-timer")!.textContent).toBe("Time left: 0:09");
    await vi.advanceTimersByTimeAsync(9000);
    expect(model.snapshot.page.id).toBe("p2");
    expect(model.deadline).toBe(Date.now() + 50_000);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0]![0].response.meta.quiz).toMatchObject({ timedOut: true });
  });
});
