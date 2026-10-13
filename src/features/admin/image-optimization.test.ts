import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { init } from "@jsquash/webp/encode.js";
import sharp from "sharp";
import { simd } from "wasm-feature-detect";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getOptimizedImageWidths, optimizeStaticImage } from "./image-optimization";

const require = createRequire(import.meta.url);

beforeAll(async () => {
  // Run the real browser codec offline, with its WASM bytes supplied by Node.
  const codec = await simd() ? "webp_enc_simd.wasm" : "webp_enc.wasm";
  const options = {
    noInitialRun: true,
    wasmBinary: await readFile(require.resolve(`@jsquash/webp/codec/enc/${codec}`)),
  };
  await init(options);
});

afterEach(() => vi.unstubAllGlobals());

function mockImageBrowser(blob: Blob | null, width = 2, height = 2, allowPixelRead = true) {
  const bitmap = { width, height, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          getImageData: () => {
            if (!allowPixelRead) throw new Error("The native encoder should not need pixel reads.");
            const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
            for (let i = 0; i < data.length; i += 4) {
              data[i] = 255;
              data[i + 3] = i === 0 ? 0 : 255;
            }
            return { data, width: canvas.width, height: canvas.height } as ImageData;
          },
        }),
        toBlob: (callback: BlobCallback) => callback(blob),
      };
      return canvas;
    },
  });
  return bitmap;
}

describe("responsive image widths", () => {
  it("creates applicable breakpoints and retains the capped source width", () => {
    expect(getOptimizedImageWidths(2000, "post-media")).toEqual([640, 960, 1600, 2000]);
    expect(getOptimizedImageWidths(4000, "post-media")).toEqual([
      640,
      960,
      1600,
      2560,
    ]);
  });

  it("never upscales small images or creator avatars", () => {
    expect(getOptimizedImageWidths(480, "post-media")).toEqual([480]);
    expect(getOptimizedImageWidths(120, "creator-avatar")).toEqual([120]);
    expect(getOptimizedImageWidths(1200, "creator-avatar")).toEqual([256]);
  });
});

describe("static image preparation", () => {
  it("creates real WebP with transparency when canvas falls back to PNG in Safari", async () => {
    const bitmap = mockImageBrowser(new Blob(["png"], { type: "image/png" }));
    const source = new File(["png"], "logo.png", { type: "image/png" });

    const [output] = await optimizeStaticImage(source, "logo-media");

    expect(output).toMatchObject({ width: 2, height: 2 });
    expect(output.file.name).toBe("logo-2w.webp");
    expect(output.file.type).toBe("image/webp");
    const bytes = Buffer.from(await output.file.arrayBuffer());
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: "webp", width: 2, height: 2, hasAlpha: true,
    });
    const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(255);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("keeps native WebP output without invoking the fallback", async () => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } })
      .webp().toBuffer();
    const native = new Blob([new Uint8Array(bytes)], { type: "image/webp" });
    mockImageBrowser(native, 2, 2, false);

    const [output] = await optimizeStaticImage(new File(["png"], "logo.png", { type: "image/png" }), "logo-media");

    expect(Buffer.from(await output.file.arrayBuffer())).toEqual(bytes);
  });

  it("preserves responsive variant dimensions and small-asset limits with the fallback", async () => {
    mockImageBrowser(new Blob(["png"], { type: "image/png" }), 700, 14);
    const source = new File(["png"], "logo.png", { type: "image/png" });

    const outputs = await optimizeStaticImage(source, "logo-media");

    expect(outputs.map(({ width, height }) => [width, height])).toEqual([[640, 13], [700, 14]]);
    for (const output of outputs) {
      expect(await sharp(Buffer.from(await output.file.arrayBuffer())).metadata()).toMatchObject({
        format: "webp", width: output.width, height: output.height,
      });
    }
    const [avatar] = await optimizeStaticImage(source, "creator-avatar");
    expect(avatar).toMatchObject({ width: 256, height: 5 });
  });

  it("uses the fallback when the native canvas export returns no blob", async () => {
    mockImageBrowser(null);

    const [output] = await optimizeStaticImage(new File(["png"], "logo.png", { type: "image/png" }), "logo-media");

    expect(await sharp(Buffer.from(await output.file.arrayBuffer())).metadata()).toMatchObject({ format: "webp" });
  });
});
