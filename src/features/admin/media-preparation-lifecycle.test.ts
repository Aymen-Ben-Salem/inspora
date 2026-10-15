import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readMediaDimensions } from "./media-upload";
import { createVideoPoster } from "./video-processing";

let video: {
  onloadedmetadata: (() => void) | null; onloadeddata: (() => void) | null; onerror: (() => void) | null;
  videoWidth: number; videoHeight: number; load: ReturnType<typeof vi.fn>; removeAttribute: ReturnType<typeof vi.fn>;
};
const file = new File(["video"], "test.mp4", { type: "video/mp4" });
beforeEach(() => {
  vi.useFakeTimers();
  video = { onloadedmetadata: null, onloadeddata: null, onerror: null, videoWidth: 1200, videoHeight: 800, load: vi.fn(), removeAttribute: vi.fn() };
  vi.stubGlobal("document", { createElement: () => video });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("releases the metadata decoder and blob after reading dimensions", async () => {
  const pending = readMediaDimensions(file);
  video.onloadedmetadata!();
  await expect(pending).resolves.toEqual({ width: 1200, height: 800 });
  expect(video.removeAttribute).toHaveBeenCalledWith("src");
  expect(video.load).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
});

it.each([readMediaDimensions, createVideoPoster])("cancels a decoder that never produces a media event", async (read) => {
  const controller = new AbortController();
  const pending = read(file, controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(video.removeAttribute).toHaveBeenCalledWith("src");
  expect(video.load).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
});

it.each([readMediaDimensions, createVideoPoster])("times out a stuck decoder and releases its resources", async (read) => {
  const pending = expect(read(file)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(15000);
  await pending;
  expect(video.load).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
});
