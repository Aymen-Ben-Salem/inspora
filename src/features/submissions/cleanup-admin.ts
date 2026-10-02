import "server-only";

import { and, asc, count, eq, inArray, isNull, lte } from "drizzle-orm";
import { requireAdmin } from "../../auth/require-admin";
import { requireDatabase } from "../../db/client";
import { cleanupJobs, submissions, submissionUploads, submissionQuotaEvents, submissionReceipts } from "../../db/schema";

export async function getCleanupSummary() {
  await requireAdmin();
  const db = requireDatabase();
  const now = new Date();
  const [jobs, rejected, uploads, receipts, quota] = await Promise.all([
    db.select({ total: count() }).from(cleanupJobs),
    db.select({ total: count() }).from(submissions).where(and(eq(submissions.status, "rejected"), lte(submissions.expiresAt, now))),
    db.select({ total: count() }).from(submissionUploads).where(and(isNull(submissionUploads.attachedSubmissionId), lte(submissionUploads.expiresAt, now), inArray(submissionUploads.state, ["pending", "completed"]))),
    db.select({ total: count() }).from(submissionReceipts).where(lte(submissionReceipts.expiresAt, now)),
    db.select({ total: count() }).from(submissionQuotaEvents).where(lte(submissionQuotaEvents.expiresAt, now)),
  ]);
  return { pending: jobs[0].total, rejected: rejected[0].total, uploads: uploads[0].total, temporary: receipts[0].total + quota[0].total };
}

export async function getCleanupItems() {
  await requireAdmin();
  return requireDatabase().select({
    id: cleanupJobs.id, kind: cleanupJobs.kind, status: cleanupJobs.status,
    attempts: cleanupJobs.attempts, createdAt: cleanupJobs.createdAt,
    updatedAt: cleanupJobs.updatedAt, leaseExpiresAt: cleanupJobs.leaseExpiresAt,
  }).from(cleanupJobs).orderBy(asc(cleanupJobs.createdAt)).limit(100);
}
