import type { QuotaSnapshot } from "./types";

export const SUBMISSION_LIMIT = 5;

export function submissionCapacity(q: QuotaSnapshot): number {
  return Math.max(
    0,
    Math.min(
      SUBMISSION_LIMIT - q.submittedLast24Hours,
      SUBMISSION_LIMIT - q.inReview - q.activeUploads,
    ),
  );
}
