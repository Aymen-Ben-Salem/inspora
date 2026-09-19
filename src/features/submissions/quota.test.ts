import { expect, it } from "vitest";

import { submissionCapacity } from "./quota";

it("does not grant a new batch when review is full", () => {
  expect(
    submissionCapacity({
      submittedLast24Hours: 0,
      inReview: 5,
      activeUploads: 0,
      nextDailySlotAt: null,
    }),
  ).toBe(0);
});

it("shares capacity between review and new uploads", () => {
  expect(
    submissionCapacity({
      submittedLast24Hours: 0,
      inReview: 4,
      activeUploads: 1,
      nextDailySlotAt: null,
    }),
  ).toBe(0);
});

it("still enforces the rolling allowance after review finishes", () => {
  expect(
    submissionCapacity({
      submittedLast24Hours: 5,
      inReview: 0,
      activeUploads: 0,
      nextDailySlotAt: "2026-09-19T12:00:00Z",
    }),
  ).toBe(0);
});

it("returns the lower remaining capacity across both limits", () => {
  expect(
    submissionCapacity({
      submittedLast24Hours: 2,
      inReview: 1,
      activeUploads: 2,
      nextDailySlotAt: null,
    }),
  ).toBe(2);
});
