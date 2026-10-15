import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ load: vi.fn(), terminate: vi.fn(), exec: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), writeFile: vi.fn(), blob: vi.fn(), revoke: vi.fn() }));
vi.mock("@ffmpeg/ffmpeg", () => ({ FFmpeg: class {
  load = mock.load; terminate = mock.terminate; exec = mock.exec;
  readFile = mock.readFile; deleteFile = mock.deleteFile; writeFile = mock.writeFile;
} }));
vi.mock("@ffmpeg/util", () => ({ toBlobURL: mock.blob, fetchFile: async () => new Uint8Array([1]) }));
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers();
  mock.load.mockResolvedValue(true); mock.exec.mockResolvedValue(0);
  mock.readFile.mockResolvedValue(new Uint8Array([1, 2]));
  mock.blob.mockImplementation(async (url) => `blob:${url}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(mock.revoke);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const input = () => ({ file: new File(["a"], "input.gif", { type: "image/gif" }), configuration: { coreUrl: "core", wasmUrl: "wasm" }, signal: new AbortController().signal, onStage: vi.fn() });

it("releases the successful conversion worker after idle, sharing it across sequential GIF/preview stages", async () => {
  const { convertGifToMp4, createVideoPreview } = await import("./gif-conversion");
  const converted = await convertGifToMp4(input());
  await createVideoPreview({ ...input(), file: converted });
  expect(mock.load).toHaveBeenCalledTimes(1);
  expect(mock.terminate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000);
  expect(mock.terminate).toHaveBeenCalledTimes(1);
  await createVideoPreview({ ...input(), file: converted });
  expect(mock.load).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(5000);
});

it("releases worker and blob URLs when engine initialization fails", async () => {
  mock.load.mockRejectedValueOnce(new Error("load failed"));
  const { convertGifToMp4 } = await import("./gif-conversion");
  await expect(convertGifToMp4(input())).rejects.toThrow("load failed");
  expect(mock.terminate).toHaveBeenCalledTimes(1);
  expect(mock.revoke.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining(["blob:core", "blob:wasm"]));
});

it("keeps an active queued conversion alive until all queued work has finished", async () => {
  const { convertGifToMp4 } = await import("./gif-conversion");
  let finish!: (value: number) => void;
  mock.exec.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = convertGifToMp4(input());
  const second = convertGifToMp4(input());
  await vi.waitFor(() => expect(mock.exec).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(10000);
  expect(mock.terminate).not.toHaveBeenCalled();
  finish(0);
  await Promise.all([first, second]);
  expect(mock.exec).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(5000);
  expect(mock.terminate).toHaveBeenCalledTimes(1);
});
