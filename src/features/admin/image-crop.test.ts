// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cropImageFile } from "./image-crop";

const source = new Blob(["pixels"], { type: "image/png" });
const selection = { crop: { x: 1, y: 3, width: 33, height: 61 }, sourceDimensions: { width: 127, height: 65 } };
let load: boolean;
const draw = vi.fn();
let outputSize: number[];
beforeEach(() => {
  load = true; outputSize = []; draw.mockClear();
  vi.stubGlobal("Image", class {
    naturalWidth = 127; naturalHeight = 65;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_url: string) { if (load) queueMicrotask(() => this.onload?.()); }
    removeAttribute() {}
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:crop-source");
  vi.spyOn(URL, "revokeObjectURL");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback) {
    outputSize = [this.width, this.height]; callback(new Blob(["cropped"], { type: "image/png" }));
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("exports the exact odd-sized pixel rectangle to a transparent PNG without rescaling", async () => {
  const result = await cropImageFile(source, selection, new AbortController().signal);
  expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith("2d", { alpha: true });
  expect(draw).toHaveBeenCalledWith(expect.anything(), 1, 3, 33, 61, 0, 0, 33, 61);
  expect(outputSize).toEqual([33, 61]);
  expect(result.type).toBe("image/png");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:crop-source");
});

it("does not crop a source that changed dimensions after opening the editor", async () => {
  await expect(cropImageFile(source, { ...selection, sourceDimensions: { width: 128, height: 65 } }, new AbortController().signal)).rejects.toThrow("favicon changed");
  expect(draw).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});

it("cancels a stalled image decode and releases its object URL", async () => {
  load = false;
  const controller = new AbortController();
  const pending = cropImageFile(source, selection, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(draw).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});

it("times out a stalled decode without exporting or leaving an object URL", async () => {
  vi.useFakeTimers(); load = false;
  const pending = expect(cropImageFile(source, selection, new AbortController().signal)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(15000); await pending;
  expect(draw).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
