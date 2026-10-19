import { expect, it } from "vitest";
import { buildVideoCropFfmpegArgs, packetDuration, videoCropEncodingBudget } from "./video-crop-encoding";

it.each([false, true])("budgets video, audio (%s), rate buffering and MP4 overhead within a 15 MB source", (audio) => {
  const sourceBytes = 15_000_000;
  const seconds = 30;
  const budget = videoCropEncodingBudget(sourceBytes, seconds, audio);
  const payload = (budget.videoBitrate + budget.audioBitrate) * (seconds + 0.5) / 8;
  expect(payload).toBeLessThan(sourceBytes * 0.9);
  expect(budget.videoBitrate).toBeGreaterThan(0);
  expect(budget.audioBitrate > 0).toBe(audio);
  const args = buildVideoCropFfmpegArgs("in.mp4", "out.mp4", { x: 0, y: 20, width: 1600, height: 900 }, budget);
  expect(args).not.toContain("-crf");
  expect(args).not.toContain("-fs");
  expect(args).not.toContain("-t");
  expect(args[args.indexOf("-b:v") + 1]).toBe(String(budget.videoBitrate));
});

it("accounts for packet timestamps when a WebM recording omits duration metadata", () => {
  expect(packetDuration([{ pts_time: "-0.02", duration_time: "0.04" }, { pts_time: "2", duration_time: "0.04" }])).toBeCloseTo(2.06);
  expect(packetDuration([{ dts_time: "0", duration_time: "0.5" }, { dts_time: "1", duration_time: "0.5" }])).toBe(1.5);
});

it("rejects unknown durations and impossible file-size budgets", () => {
  expect(() => videoCropEncodingBudget(15_000_000, NaN, false)).toThrow("duration");
  expect(() => videoCropEncodingBudget(15_000_000, 0, false)).toThrow("duration");
  expect(() => videoCropEncodingBudget(100, 30, true)).toThrow("too small");
});
