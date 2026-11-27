import { describe, expect, it } from "vitest";
import { migrateSurvey } from "@kvesto/core";
import { columnName, crc32, responsesToXlsx } from "../src/index.js";

/** Read a stored (uncompressed) zip: name → text, checking each entry's CRC. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, string> = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    expect(crc32(data), name).toBe(crc);
    out[name] = new TextDecoder().decode(data);
    at += 30 + nameLength + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  return out;
}

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "xl",
  title: "XL",
  pages: [
    {
      id: "p",
      elements: [
        { id: "name", type: "text", title: "Name & <title>" },
        { id: "zip", type: "text", title: "Zip" },
        { id: "rate", type: "rating", title: "Rate" },
        { id: "fruit", type: "single-choice", title: "Fruit", choices: [{ value: "a", label: "Apple" }] },
      ],
    },
  ],
});
const responses = [{ id: "r1", surveyId: "xl", createdAt: "2026-01-01T00:00:00.000Z", answers: { name: "=cmd|' /C calc'!A0 <b>", zip: "007", rate: 4, fruit: "a" } }];

describe("responsesToXlsx", () => {
  it("writes a valid workbook with a bold header, numbers as numbers and answers as plain text", () => {
    const files = unzip(responsesToXlsx(survey, responses, { sheetName: "Results: 2026" }));
    expect(Object.keys(files)).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]);
    expect(files["xl/workbook.xml"]).toContain('<sheet name="Results  2026"');
    const sheet = files["xl/worksheets/sheet1.xml"]!;
    expect(sheet).toContain('<c r="D1" t="inlineStr" s="1"><is><t xml:space="preserve">Name &amp; &lt;title&gt;</t></is></c>');
    expect(sheet).toContain('<c r="D2" t="inlineStr"><is><t xml:space="preserve">=cmd|\' /C calc\'!A0 &lt;b&gt;</t></is></c>');
    expect(sheet).toContain('<c r="E2" t="inlineStr"><is><t xml:space="preserve">007</t></is></c>');
    expect(sheet).toContain('<c r="F2"><v>4</v></c>');
    expect(sheet).toContain("Apple");
    expect(sheet).not.toContain("<f>");
  });

  it("names columns like Excel", () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA"]);
  });
});
