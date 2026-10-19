import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ load: vi.fn(), terminate: vi.fn(), exec: vi.fn(), ffprobe: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), writeFile: vi.fn(), blob: vi.fn(), revoke: vi.fn() }));
vi.mock("@ffmpeg/ffmpeg", () => ({ FFmpeg: class {
  load = mock.load; terminate = mock.terminate; exec = mock.exec;
  ffprobe = mock.ffprobe;
  readFile = mock.readFile; deleteFile = mock.deleteFile; writeFile = mock.writeFile;
} }));
vi.mock("@ffmpeg/util", () => ({ toBlobURL: mock.blob, fetchFile: async () => new Uint8Array([1]) }));
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers();
  mock.load.mockResolvedValue(true); mock.exec.mockResolvedValue(0);
  mock.ffprobe.mockResolvedValue(0);
  mock.readFile.mockResolvedValue(new Uint8Array([1, 2]));
  mock.blob.mockImplementation(async (url) => `blob:${url}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(mock.revoke);
});

it("keeps the full cropped recording within the original byte size even if an encode overshoots", async () => {
  const { cropVideo } = await import("./gif-conversion");
  const source = new File([new Uint8Array(1_000_000)], "source.mp4", { type: "video/mp4" });
  const encoded = [new Uint8Array(2_000_000), new Uint8Array(900_000)];
  mock.readFile.mockImplementation(async (_name, encoding) => encoding === "utf8"
    ? JSON.stringify({ format: { duration: "10" }, streams: [{ codec_type: "video" }] })
    : encoded.shift());
  const result = await cropVideo({ ...input(), file: source, crop: { x: 0, y: 40, width: 1200, height: 760 } });
  expect(result.size).toBeLessThanOrEqual(source.size);
  expect(mock.exec.mock.calls.every(([args]) => !args.includes("-fs") && !args.includes("-t"))).toBe(true);
  await vi.advanceTimersByTimeAsync(5000);
});

it("budgets audio and handles WebM recordings with no duration metadata", async () => {
  const { cropVideo } = await import("./gif-conversion");
  const source = new File([new Uint8Array(1_000_000)], "source.webm", { type: "video/webm" });
  const metadata = [
    { streams: [{ codec_type: "video" }, { codec_type: "audio" }] },
    { packets: [{ pts_time: "0", duration_time: "0.04" }, { pts_time: "9.96", duration_time: "0.04" }] },
  ];
  mock.readFile.mockImplementation(async (_name, encoding) => encoding === "utf8" ? JSON.stringify(metadata.shift()) : new Uint8Array(900_000));
  const result = await cropVideo({ ...input(), file: source, crop: { x: 0, y: 0, width: 1200, height: 800 } });
  expect(result.size).toBeLessThanOrEqual(source.size);
  expect(mock.ffprobe).toHaveBeenCalledTimes(2);
  expect(mock.exec.mock.calls[0][0]).toContain("0:a:0?");
  expect(mock.deleteFile).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(5000);
});

it("accepts fresh valid probe output when core 0.12.10 leaves its success status unset", async () => {
  const { cropVideo } = await import("./gif-conversion");
  const source = new File([new Uint8Array(1_000_000)], "source.mp4", { type: "video/mp4" });
  mock.ffprobe.mockResolvedValue(-1);
  mock.readFile.mockImplementation(async (_name, encoding) => encoding === "utf8"
    ? JSON.stringify({ format: { duration: "10" }, streams: [{ codec_type: "video" }] })
    : new Uint8Array(900_000));
  expect((await cropVideo({ ...input(), file: source, crop: { x: 0, y: 0, width: 1200, height: 800 } })).size).toBe(900_000);
  await vi.advanceTimersByTimeAsync(5000);
});

it("rejects an output that still exceeds the source after a bounded retry and cleans up", async () => {
  const { cropVideo } = await import("./gif-conversion");
  const source = new File([new Uint8Array(1_000_000)], "source.mp4", { type: "video/mp4" });
  mock.readFile.mockImplementation(async (_name, encoding) => encoding === "utf8"
    ? JSON.stringify({ format: { duration: "10" }, streams: [{ codec_type: "video" }] })
    : new Uint8Array(2_000_000));
  await expect(cropVideo({ ...input(), file: source, crop: { x: 0, y: 0, width: 1200, height: 800 } })).rejects.toThrow("original file size");
  expect(mock.exec).toHaveBeenCalledTimes(2);
  expect(mock.terminate).toHaveBeenCalledOnce();
  expect(mock.deleteFile).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(5000);
});

it("cancels a crop during metadata probing without starting an encode", async () => {
  const { cropVideo } = await import("./gif-conversion");
  const controller = new AbortController();
  const source = new File([new Uint8Array(1_000_000)], "source.mp4", { type: "video/mp4" });
  mock.ffprobe.mockImplementation(async () => { controller.abort(); return 0; });
  mock.readFile.mockResolvedValue(JSON.stringify({ format: { duration: "10" }, streams: [{ codec_type: "video" }] }));
  await expect(cropVideo({ ...input(), file: source, signal: controller.signal, crop: { x: 0, y: 0, width: 1200, height: 800 } })).rejects.toMatchObject({ name: "AbortError" });
  expect(mock.exec).not.toHaveBeenCalled();
  expect(mock.terminate).toHaveBeenCalledOnce();
  expect(mock.deleteFile).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(5000);
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
