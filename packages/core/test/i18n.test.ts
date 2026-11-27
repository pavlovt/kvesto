// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  BUILTIN_LOCALES,
  ENGLISH_LABELS,
  ENGLISH_MESSAGES,
  SurveySchema,
  addLocalePack,
  createSurvey,
  detectLocale,
  exportTranslations,
  importTranslations,
  labelsFor,
  localizeSurvey,
  markReviewed,
  message,
  migrateSurvey,
  renderSurvey,
  summarizeResponses,
  textOf,
  translateSurvey,
  translationTable,
  validateAnswers,
  withText,
} from "../src/index.js";

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "multi",
  title: { en: "Feedback", bg: "Обратна връзка" },
  defaultLocale: "en",
  locales: ["en", "bg"],
  pages: [
    {
      id: "p1",
      elements: [
        { id: "name", type: "text", title: { en: "Your name", bg: "Вашето име" }, required: true },
        {
          id: "color",
          type: "single-choice",
          title: { en: "Hi {name}, favourite colour?", bg: "Здравей, {name}! Любим цвят?" },
          choices: [
            { value: "r", label: { en: "Red", bg: "Червен" } },
            { value: "g", label: "Green" },
          ],
        },
      ],
    },
  ],
});

describe("localized text", () => {
  it("falls back from the locale to its language, then the default", () => {
    expect(textOf({ en: "A", pt: "B" }, "pt-BR", "en")).toBe("B");
    expect(textOf({ en: "A", pt: "B" }, "de", "en")).toBe("A");
    expect(textOf("plain", "de", "en")).toBe("plain");
  });

  it("sets one locale's text, turning a plain string into an object and back", () => {
    expect(withText("Hi", "de", "Hallo", "en")).toEqual({ en: "Hi", de: "Hallo" });
    expect(withText({ en: "Hi", de: "Hallo" }, "de", "", "en")).toBe("Hi");
    expect(withText("Hi", "en", "Hello", "en")).toBe("Hello");
  });

  it("localizes a whole survey for a runner", () => {
    const bg = localizeSurvey(survey, "bg");
    expect(bg.title).toBe("Обратна връзка");
    const color = bg.pages[0]!.elements[1] as { title: string; choices: { label: string }[] };
    expect(color.title).toBe("Здравей, {name}! Любим цвят?");
    expect(color.choices.map((c) => c.label)).toEqual(["Червен", "Green"]);
  });

  it("rejects bad locale codes and empty required text", () => {
    const bad = (title: unknown) => SurveySchema.safeParse({ schemaVersion: 1, id: "s", title, pages: [{ id: "p", elements: [] }] }).success;
    expect(bad({ en: "x", "not a locale": "y" })).toBe(false);
    expect(bad({ en: "" })).toBe(false);
    expect(bad({ en: "x" })).toBe(true);
  });
});

describe("rendering in two locales", () => {
  const render = (locale?: string) => {
    const target = document.createElement("div");
    const model = createSurvey({ survey, ...(locale ? { locale } : {}) });
    renderSurvey(target, model);
    return { target, model };
  };

  it("shows texts, piped answers and built-in labels in the locale", () => {
    const { target, model } = render("bg");
    expect(target.querySelector(".kv-title")!.textContent).toBe("Обратна връзка");
    model.setValue("name", "Ана");
    expect(target.querySelector('[data-question="color"] .kv-question-title')!.firstChild!.textContent).toBe("Здравей, Ана! Любим цвят?");
    expect(target.querySelector(".kv-next")!.textContent).toBe("Изпрати");
    expect([...target.querySelectorAll('[data-question="color"] .kv-choice')].map((l) => l.textContent?.trim())).toEqual(["Червен", "Green"]);
  });

  it("uses the default locale for a locale the survey lacks, and English labels", () => {
    const { target } = render();
    expect(target.querySelector(".kv-title")!.textContent).toBe("Feedback");
    expect(target.querySelector(".kv-next")!.textContent).toBe("Submit");
    const de = render("de");
    expect(de.target.querySelector(".kv-title")!.textContent).toBe("Feedback");
    expect(de.target.querySelector(".kv-next")!.textContent).toBe("Absenden");
  });

  it("validates with messages in the locale", () => {
    const { model } = render("bg");
    model.validatePage();
    expect(model.snapshot.errors.name).toBe("Този въпрос е задължителен.");
    expect(validateAnswers(survey, {}, { locale: "de" }).issues[0]!.message).toBe("Diese Frage ist erforderlich.");
    expect(validateAnswers(survey, {}).issues[0]!.message).toBe("This question is required.");
  });

  it("summarises with labels in the locale", () => {
    const responses = [{ id: "1", surveyId: "multi", createdAt: "", answers: { color: "r" } }];
    const color = summarizeResponses(survey, responses, 5, "bg").find((s) => s.question.id === "color")!;
    expect(color.counts![0]!.label).toBe("Червен");
  });
});

describe("locale packs", () => {
  it("cover every built-in label and message in every locale", () => {
    expect(BUILTIN_LOCALES).toEqual(expect.arrayContaining(["en", "bg", "de", "fr", "es", "it", "pt", "nl", "pl", "ru", "zh", "ja"]));
    for (const locale of BUILTIN_LOCALES) {
      const labels = labelsFor(locale);
      for (const key of Object.keys(ENGLISH_LABELS)) expect(labels[key as keyof typeof labels], `${locale} ${key}`).toBeTruthy();
      if (locale !== "en") expect(labels.next, locale).not.toBe(ENGLISH_LABELS.next);
      for (const key of Object.keys(ENGLISH_MESSAGES)) expect(message(locale, key as keyof typeof ENGLISH_MESSAGES), `${locale} ${key}`).toBeTruthy();
    }
  });

  it("can be added and extended", () => {
    addLocalePack("xx", { labels: { next: "Next!" } });
    expect(labelsFor("xx").next).toBe("Next!");
    expect(labelsFor("xx").prev).toBe("Back");
  });
});

describe("translation files and machine translation", () => {
  it("exports and imports CSV, XLIFF and JSON without changing the survey", () => {
    for (const format of ["csv", "xliff", "json"] as const) {
      const file = exportTranslations(survey, "bg", format);
      const back = importTranslations(survey, "bg", file, format);
      expect(back.survey, format).toEqual(survey);
      expect(back.unknownKeys).toEqual([]);
      expect(back.placeholderMismatches).toEqual([]);
    }
  });

  it("escapes awkward text in CSV and XLIFF", () => {
    const awkward = migrateSurvey({
      schemaVersion: 1,
      id: "a",
      title: 'He said "hi", <b>&</b>\nnew line',
      pages: [{ id: "p", elements: [] }],
    });
    for (const format of ["csv", "xliff"] as const) {
      const file = exportTranslations(awkward, "de", format);
      const translated = format === "csv" ? file.replace(/,\r\n$/, ',"Er sagte ""hi"", <b>&</b>\nneu"\r\n') : file.replace("</source>", "</source><target>Er sagte &quot;hi&quot;, &lt;b&gt;&amp;&lt;/b&gt;\nneu</target>");
      const { survey: back } = importTranslations(awkward, "de", translated, format);
      expect(back.title).toEqual({ en: 'He said "hi", <b>&</b>\nnew line', de: 'Er sagte "hi", <b>&</b>\nneu' });
    }
  });

  it("refuses imports that break placeholders and reports unknown keys", () => {
    const file = JSON.stringify({ strings: { "color.title": { translation: "Hallo, Lieblingsfarbe?" }, "name.title": "Ihr Name", "gone.title": "x" } });
    const r = importTranslations(survey, "de", file, "json");
    expect(r.applied).toEqual(["name.title"]);
    expect(r.placeholderMismatches).toEqual(["color.title"]);
    expect(r.unknownKeys).toEqual(["gone.title"]);
    expect(r.survey.locales).toEqual(["en", "bg", "de"]);
  });

  it("fills a new locale with machine-translated drafts that need review", async () => {
    const seen: Record<string, string>[] = [];
    const translate = (texts: Record<string, string>, from: string, to: string) => {
      seen.push(texts);
      expect([from, to]).toEqual(["en", "de"]);
      return Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, k === "color.choices.g" ? "Grün {oops}" : `DE ${v}`]));
    };
    const r = await translateSurvey(survey, "de", translate);
    expect(Object.keys(seen[0]!)).toEqual(["survey.title", "name.title", "color.title", "color.choices.r", "color.choices.g"]);
    expect(r.placeholderMismatches).toEqual(["color.choices.g"]);
    const table = translationTable(r.survey, "de");
    expect(table.find((t) => t.key === "color.title")).toMatchObject({ translation: "DE Hi {name}, favourite colour?", needsReview: true });
    expect(r.survey.translationsToReview!.de).toHaveLength(4);
    const reviewed = markReviewed(r.survey, "de", ["name.title"]);
    expect(reviewed.translationsToReview!.de).toHaveLength(3);
    expect(markReviewed(reviewed, "de").translationsToReview).toBeUndefined();
    // A second run only asks for what is still missing.
    seen.length = 0;
    await translateSurvey(r.survey, "de", translate);
    expect(Object.keys(seen[0]!)).toEqual(["color.choices.g"]);
    expect(SurveySchema.safeParse(r.survey).success).toBe(true);
  });
});

describe("detectLocale", () => {
  const s = { defaultLocale: "en", locales: ["en", "de", "pt-BR"] };
  it("prefers the URL parameter, then the browser languages, then the default", () => {
    expect(detectLocale(s, { url: "https://x.test/s?lang=de", languages: ["pt-BR"] })).toBe("de");
    expect(detectLocale(s, { url: "https://x.test/s?lang=fr", languages: ["fr-FR", "de-AT"] })).toBe("de");
    expect(detectLocale(s, { languages: ["pt-BR"] })).toBe("pt-BR");
    expect(detectLocale(s, { languages: ["ja"] })).toBe("en");
    expect(detectLocale(s, { url: "/s?locale=de", param: "locale", languages: [] })).toBe("de");
  });
});
