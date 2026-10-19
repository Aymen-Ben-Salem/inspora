import { describe, expect, it } from "vitest";
import { constrainVideoCrop, cropForAspectRatio, moveVideoCrop, resizeVideoCrop, videoCropFilter } from "./video-crop";
import { buildVideoPreviewFfmpegArgs } from "./gif-conversion";

const bounds = { width: 1920, height: 1080 };
describe("website recording crop", () => {
  it("fits centered aspect ratios and aligns odd source sizes for encoding", () => {
    expect(cropForAspectRatio(bounds, 1)).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
    expect(cropForAspectRatio({ width: 1919, height: 1079 })).toEqual({ x: 0, y: 0, width: 1918, height: 1078 });
  });
  it("keeps a moved crop inside the video without changing its size", () => {
    const crop = { x: 400, y: 200, width: 800, height: 600 };
    expect(moveVideoCrop(crop, 9000, -9000, bounds)).toEqual({ x: 1120, y: 0, width: 800, height: 600 });
  });
  it("resizes from each corner while keeping the opposite corner anchored", () => {
    const crop = { x: 400, y: 200, width: 800, height: 600 };
    expect(resizeVideoCrop(crop, "nw", 100, 50, bounds)).toEqual({ x: 500, y: 250, width: 700, height: 550 });
    expect(resizeVideoCrop(crop, "se", 100, 50, bounds)).toEqual({ x: 400, y: 200, width: 900, height: 650 });
    expect(resizeVideoCrop(crop, "ne", 100, 50, bounds)).toEqual({ x: 400, y: 250, width: 900, height: 550 });
    expect(resizeVideoCrop(crop, "sw", 100, 50, bounds)).toEqual({ x: 500, y: 200, width: 700, height: 650 });
  });
  it("preserves a locked ratio and constrains resizing at the edges", () => {
    const crop = { x: 100, y: 100, width: 800, height: 450 };
    const result = resizeVideoCrop(crop, "se", 9000, 9000, bounds, 16 / 9);
    expect(result.x + result.width).toBeLessThanOrEqual(bounds.width);
    expect(result.y + result.height).toBeLessThanOrEqual(bounds.height);
    expect(Math.abs(result.width / result.height - 16 / 9)).toBeLessThan(0.005);
  });
  it("rejects invalid input and prevents zero or out-of-bounds crops", () => {
    expect(() => constrainVideoCrop({ x: NaN, y: 0, width: 10, height: 10 }, bounds)).toThrow("valid video dimensions");
    expect(constrainVideoCrop({ x: 9999, y: -3, width: -2, height: 9999 }, bounds)).toEqual({ x: 1918, y: 0, width: 2, height: 1080 });
    expect(() => videoCropFilter({ x: 1, y: 0, width: 50, height: 50 })).toThrow("even pixel");
  });
  it("crops the full recording without downscaling it or trimming its duration", () => {
    const args = buildVideoPreviewFfmpegArgs("source.mp4", "cropped.mp4", { x: 40, y: 20, width: 1600, height: 900 });
    expect(args[args.indexOf("-vf") + 1]).toBe("crop=1600:900:40:20,fps=30,setsar=1");
    expect(args).not.toContain("-t");
    expect(args).not.toContain("-ss");
    expect(args).not.toContain("-an");
    expect(args).toContain("aac");
  });
});
