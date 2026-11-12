import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { init } from "@jsquash/webp/encode.js";
import sharp from "sharp";
import { simd } from "wasm-feature-detect";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { createVideoPoster } from "./video-processing";

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const codec = await simd() ? "webp_enc_simd.wasm" : "webp_enc.wasm";
  await init({ noInitialRun: true, wasmBinary: await readFile(require.resolve(`@jsquash/webp/codec/enc/${codec}`)) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("exports real WebP posters when the browser canvas returns PNG", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  const video = { videoWidth: 2, videoHeight: 2, onloadeddata: null as (() => void) | null,
    removeAttribute: vi.fn(), load: vi.fn(), set src(_value: string) { queueMicrotask(() => video.onloadeddata?.()); } };
  const canvas = { width: 0, height: 0,
    getContext: () => ({ drawImage: vi.fn(), getImageData: () => ({ width: 2, height: 2, data: new Uint8ClampedArray([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255]) }) }),
    toBlob: (callback: BlobCallback) => callback(new Blob([new Uint8Array(png)], { type: "image/png" })),
  };
  vi.stubGlobal("document", { createElement: (tag: string) => tag === "video" ? video : canvas });
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  const poster = await createVideoPoster(new File(["video"], "recording.mp4", { type: "video/mp4" }));
  expect(await sharp(Buffer.from(await poster.file.arrayBuffer())).metadata()).toMatchObject({ format: "webp", width: 2, height: 2 });
  expect(poster.file).toMatchObject({ name: "recording-poster.webp", type: "image/webp" });
  expect(canvas.width).toBe(0);
  expect(canvas.height).toBe(0);
  expect(video.removeAttribute).toHaveBeenCalledWith("src");
  expect(video.load).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledOnce();
});
