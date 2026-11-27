import { describe, expect, it } from "vitest";
import { migrateSurvey, responsesToCsv, safeCell } from "../src/index.js";

const abc = [{ value: "a", label: "Apple, red" }, { value: "b", label: 'Banana "yellow"' }];
const survey = migrateSurvey({
  schemaVersion: 1,
  id: "csv",
  title: "CSV",
  hiddenFields: ["src"],
  pages: [
    {
      id: "p1",
      elements: [
        { id: "text", type: "text", title: "Text" },
        { id: "comment", type: "comment", title: "Comment" },
        { id: "one", type: "single-choice", title: "One", choices: abc },
        { id: "many", type: "multiple-choice", title: "Many", choices: abc },
        { id: "drop", type: "dropdown", title: "Drop", choices: abc },
        { id: "rate", type: "rating", title: "Rate" },
        { id: "yes", type: "boolean", title: "Yes?" },
        { id: "m", type: "matrix", title: "M", rows: [{ value: "r", label: "Row" }], columns: abc },
        { id: "g", type: "grid", title: "G", rows: [{ value: "r", label: "Row" }], columns: [{ value: "n", label: "N", cellType: "number" }] },
        { id: "rank", type: "ranking", title: "Rank", choices: abc },
        { id: "file", type: "file", title: "File" },
        { id: "mt", type: "multi-text", title: "MT", items: [{ value: "f", label: "First" }] },
        { id: "slide", type: "slider", title: "Slide" },
        { id: "tags", type: "tags", title: "Tags", choices: abc, allowCustom: true },
        { id: "sum", type: "computed", title: "Sum", expr: "1" },
        { id: "kids", type: "panel", repeat: {}, elements: [{ id: "kid", type: "text", title: "Kid" }] },
      ],
    },
  ],
});
const responses = [
  {
    id: "r1",
    surveyId: "csv",
    createdAt: "2026-01-01T00:00:00.000Z",
    meta: { hidden: { src: "news, letter" } },
    answers: {
      text: 'He said "hi", twice',
      comment: "line one\nline two",
      one: "a",
      many: ["a", "b"],
      drop: "b",
      rate: 4,
      yes: true,
      m: { r: "b" },
      g: { r: { n: 7 } },
      rank: ["b", "a"],
      file: [{ name: "cv.pdf", type: "application/pdf", size: 1, url: "https://x/cv.pdf" }],
      mt: { f: "Ana" },
      slide: 30,
      tags: ["a", "custom"],
      sum: 1,
      kids: [{ kid: "Mila" }, { kid: "=HYPERLINK(evil)" }],
    },
  },
  { id: "r2", surveyId: "csv", createdAt: "2026-01-02T00:00:00.000Z", status: "partial" as const, answers: { text: "@cmd" } },
];

describe("CSV export", () => {
  it("writes every question type with labels, quoting commas, quotes and newlines", () => {
    const lines = responsesToCsv(survey, responses).split("\r\n");
    expect(lines[0]).toBe(
      '﻿id,submitted,status,Text,Comment,One,Many,Drop,Rate,Yes?,M: Row,G: Row / N,Rank,File,MT: First,Slide,Tags,Sum,Kid (1),Kid (2),hidden.src',
    );
    expect(lines[1]).toBe(
      'r1,2026-01-01T00:00:00.000Z,complete,"He said ""hi"", twice","line one\nline two","Apple, red","Apple, red, Banana ""yellow""","Banana ""yellow""",4,Yes,"Banana ""yellow""",7,"Banana ""yellow"", Apple, red",cv.pdf,Ana,30,"Apple, red, custom",1,Mila,\'=HYPERLINK(evil),"news, letter"',
    );
    expect(lines[2]).toBe("r2,2026-01-02T00:00:00.000Z,partial,'@cmd,,,,,,,,,,,,,,,,,");
    expect(lines[3]).toBe("");
  });

  it("writes values and keys instead of labels when asked", () => {
    const [header, first] = responsesToCsv(survey, responses.slice(0, 1), { values: true }).split("\r\n");
    expect(header).toContain(",one,many,drop,rate,yes,m.r,g.r.n,rank,file,mt.f,");
    expect(first).toContain(",a,\"a, b\",b,4,true,b,7,\"b, a\",cv.pdf,Ana,");
  });

  it("defuses formulas", () => {
    expect(["=1+1", "+1", "-2", "@x", "\tx", "ok", "a=b"].map(safeCell)).toEqual(["'=1+1", "'+1", "'-2", "'@x", "'\tx", "ok", "a=b"]);
  });
});
