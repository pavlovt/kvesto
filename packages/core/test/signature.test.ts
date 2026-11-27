// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SurveySchema, createSurvey, memoryStorage, migrateSurvey, renderSurvey, validateAnswers } from "../src/index.js";

const survey = migrateSurvey({
  schemaVersion: 1,
  id: "sign",
  title: "Sign",
  pages: [{ id: "p1", elements: [{ id: "sig", type: "signature", title: "Sign here", required: true, width: 300, height: 120 }] }],
});

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/** happy-dom has no 2D canvas: record the drawing calls and hand out a small PNG blob. */
function mockCanvas() {
  const calls: string[] = [];
  const ctx = {
    lineWidth: 0,
    lineCap: "",
    strokeStyle: "",
    beginPath: () => calls.push("beginPath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    stroke: () => calls.push("stroke"),
    clearRect: () => calls.push("clearRect"),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
    cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("signature", () => {
  it("draws with pointer events and saves a PNG through the storage adapter", async () => {
    const calls = mockCanvas();
    const storage = memoryStorage();
    const uploadFile = vi.fn(async (_s: string, _q: string, f: File) => ({ name: f.name, type: f.type, size: f.size, url: "https://files/sig.png" }));
    const model = createSurvey({ survey, storage: { ...storage, uploadFile } });
    const target = document.createElement("div");
    renderSurvey(target, model);
    const canvas = target.querySelector<HTMLCanvasElement>("canvas.kv-signature-pad")!;
    expect([canvas.width, canvas.height]).toEqual([300, 120]);
    canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: 5, clientY: 5 }));
    canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 40 }));
    canvas.dispatchEvent(new PointerEvent("pointerup"));
    await flush();
    expect(calls).toEqual(expect.arrayContaining(["beginPath", "moveTo", "lineTo", "stroke"]));
    expect(uploadFile).toHaveBeenCalledOnce();
    expect(uploadFile.mock.calls[0]![2].type).toBe("image/png");
    expect(model.getValue("sig")).toEqual([{ name: "signature.png", type: "image/png", size: 4, url: "https://files/sig.png" }]);
    expect(target.querySelector(".kv-signature-status")!.textContent).toBe("Signed.");

    // Another stroke replaces the saved signature instead of adding a second file.
    canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    canvas.dispatchEvent(new PointerEvent("pointerup"));
    await flush();
    expect(model.getValue("sig")).toHaveLength(1);

    target.querySelector<HTMLButtonElement>(".kv-signature-clear")!.click();
    expect(model.getValue("sig")).toBeUndefined();
    expect(calls.at(-1)).toBe("clearRect");
  });

  it("is validated like a single PNG upload", () => {
    const file = (type: string, size = 10) => [{ name: "s", type, size, url: "https://x/s" }];
    expect(validateAnswers(survey, { sig: file("image/png") }).issues).toEqual([]);
    expect(validateAnswers(survey, { sig: file("image/jpeg") }).issues[0]!.message).toContain("not an accepted file type");
    expect(validateAnswers(survey, { sig: file("image/png", 10_000_000) }).issues[0]!.message).toContain("larger than");
    expect(validateAnswers(survey, {}).issues[0]!.message).toBe("This question is required.");
  });

  it("is not allowed inside repeating panels yet", () => {
    const r = SurveySchema.safeParse({
      schemaVersion: 1,
      id: "s",
      title: "S",
      pages: [{ id: "p", elements: [{ id: "r", type: "panel", repeat: {}, elements: [{ id: "sig", type: "signature", title: "Sign" }] }] }],
    });
    expect(r.error!.issues[0]!.message).toContain("Signature questions are not supported in repeating panels yet");
  });
});
