import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { requireDatabase } from "../../db/client";
import {
  cleanupJobs,
  creatorClaims,
  creators,
  logoMedia,
  postMedia,
  profileAccounts,
  profileMessages,
  savedPosts,
  submissionPublicationAttempts,
  submissionQuotaEvents,
  submissionReceipts,
  submissions,
  submissionUploads,
  websiteMedia,
  websiteSections,
} from "../../db/schema";
import { withWriteTransaction, type WriteTx } from "../../db/write-client";
import {
  createR2PresignedUpload,
  deleteR2StorageKeys,
  getR2PublicUrl,
  verifyR2Upload,
} from "../../storage/r2";
import {
  deletePrivateUploads,
} from "../../storage/private-submissions";
import type { ManagedMediaAsset } from "../../storage/types";
import { enqueueCleanup } from "./cleanup-jobs";
import type { CleanupJobInput, SubmissionResult } from "./types";

const HOUR = 60 * 60 * 1000;
const LEASE_MILLISECONDS = 5 * 60 * 1000;

export type CleanupReport = {
  expiredSubmissions: number;
  abandonedUploads: number;
  completedJobs: number;
  retryableFailures: number;
};

export type LeasedCleanupJob = {
  id: string;
  kind: CleanupJobInput["kind"];
  targetId: string;
  attempts: number;
};

export type CleanupRunnerDependencies = {
  expireRejected(now: Date, batchSize: number): Promise<number>;
  expireAbandonedUploads(now: Date, batchSize: number): Promise<number>;
  leaseJobs(now: Date, batchSize: number): Promise<LeasedCleanupJob[]>;
  processJob(job: LeasedCleanupJob): Promise<void>;
  completeJob(id: string): Promise<void>;
  retryJob(id: string, nextAttemptAt: Date, error: string): Promise<void>;
  pruneReceipts(now: Date): Promise<void>;
};

export function rejectionExpiresAt(rejectedAt: Date): Date {
  return new Date(rejectedAt.getTime() + 48 * HOUR);
}

export function retryDelayMilliseconds(attempt: number) {
  return Math.min(6 * HOUR, 30_000 * 2 ** Math.min(Math.max(attempt - 1, 0), 10));
}

export function withdrawalFailure(
  submission: { ownerUserId: string; status: string } | null,
  ownerUserId: string,
): SubmissionResult<never> | null {
  if (!submission || submission.ownerUserId !== ownerUserId) {
    return { ok: false, code: "forbidden", message: "That submission is unavailable." };
  }
  if (submission.status !== "in_review") {
    return { ok: false, code: "conflict", message: "Only work in review can be withdrawn." };
  }
  return null;
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Cleanup failed.").slice(0, 1000);
}

export function createCleanupRunner(dependencies: CleanupRunnerDependencies) {
  return async (now: Date, batchSize: number): Promise<CleanupReport> => {
    const boundedBatch = Math.min(100, Math.max(1, Math.trunc(batchSize)));
    const expiredSubmissions = await dependencies.expireRejected(now, boundedBatch);
    const abandonedUploads = await dependencies.expireAbandonedUploads(now, boundedBatch);
    const jobs = await dependencies.leaseJobs(now, boundedBatch);
    let completedJobs = 0;
    let retryableFailures = 0;

    for (const job of jobs) {
      try {
        await dependencies.processJob(job);
        await dependencies.completeJob(job.id);
        completedJobs += 1;
      } catch (error) {
        const attempts = job.attempts + 1;
        await dependencies.retryJob(
          job.id,
          new Date(now.getTime() + retryDelayMilliseconds(attempts)),
          errorMessage(error),
        );
        retryableFailures += 1;
      }
    }
    await dependencies.pruneReceipts(now);
    return { expiredSubmissions, abandonedUploads, completedJobs, retryableFailures };
  };
}

function privateUploadCleanupInput(uploadId: string, now: Date): CleanupJobInput {
  return {
    kind: "delete_private_upload",
    targetId: uploadId,
    idempotencyKey: `private-upload:${uploadId}`,
    notBefore: now.toISOString(),
  };
}

async function queuePublicationAttemptCleanup(
  tx: WriteTx,
  submissionId: string,
  now: Date,
) {
  const attempts = await tx
    .update(submissionPublicationAttempts)
    .set({ status: "cleanup", updatedAt: now })
    .where(and(
      eq(submissionPublicationAttempts.submissionId, submissionId),
      eq(submissionPublicationAttempts.status, "prepared"),
    ))
    .returning({ id: submissionPublicationAttempts.id });
  const alreadyQueued = await tx
    .select({ id: submissionPublicationAttempts.id })
    .from(submissionPublicationAttempts)
    .where(and(
      eq(submissionPublicationAttempts.submissionId, submissionId),
      eq(submissionPublicationAttempts.status, "cleanup"),
    ));
  for (const attempt of [...attempts, ...alreadyQueued]) {
    await enqueueCleanup(tx, {
      kind: "delete_public_orphan",
      targetId: attempt.id,
      idempotencyKey: `publication-attempt:${attempt.id}`,
      notBefore: now.toISOString(),
    });
  }
}

async function removeSubmission(
  tx: WriteTx,
  submission: typeof submissions.$inferSelect,
  now: Date,
  keepWithdrawalReceipt: boolean,
) {
  await queuePublicationAttemptCleanup(tx, submission.id, now);
  if (submission.uploadId) {
    await tx
      .update(submissionUploads)
      .set({
        state: "discarded",
        attachedSubmissionId: null,
        attachedAt: null,
        discardedAt: now,
        updatedAt: now,
      })
      .where(eq(submissionUploads.id, submission.uploadId));
  }
  await tx.delete(submissions).where(eq(submissions.id, submission.id));
  if (submission.uploadId) {
    await enqueueCleanup(tx, privateUploadCleanupInput(submission.uploadId, now));
  }
  if (keepWithdrawalReceipt) {
    const [quota] = await tx
      .select({ expiresAt: submissionQuotaEvents.expiresAt })
      .from(submissionQuotaEvents)
      .where(eq(submissionQuotaEvents.submissionId, submission.id))
      .limit(1);
    if (quota && quota.expiresAt > now) {
      await tx.insert(submissionReceipts).values({
        submissionId: submission.id,
        ownerUserId: submission.ownerUserId,
        requestId: submission.requestId,
        state: "withdrawn",
        expiresAt: quota.expiresAt,
      }).onConflictDoNothing({ target: submissionReceipts.submissionId });
    }
  }
}

export async function withdrawSubmissionForOwner(
  ownerUserId: string,
  submissionId: string,
): Promise<SubmissionResult<null>> {
  return withWriteTransaction(async (tx) => {
    const [account] = await tx
      .select({ status: profileAccounts.status })
      .from(profileAccounts)
      .where(eq(profileAccounts.userId, ownerUserId))
      .for("update");
    if (!account) return { ok: false, code: "forbidden", message: "That submission is unavailable." };
    if (account.status !== "active") {
      return { ok: false, code: "account_deleting", message: "This account is being deleted." };
    }

    const [submission] = await tx
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .for("update");
    if (!submission) {
      const [receipt] = await tx
        .select({ submissionId: submissionReceipts.submissionId })
        .from(submissionReceipts)
        .where(and(
          eq(submissionReceipts.submissionId, submissionId),
          eq(submissionReceipts.ownerUserId, ownerUserId),
        ));
      return receipt
        ? { ok: true, value: null }
        : { ok: false, code: "forbidden", message: "That submission is unavailable." };
    }
    const invalid = withdrawalFailure(submission, ownerUserId);
    if (invalid) return invalid;
    await removeSubmission(tx, submission, new Date(), true);
    return { ok: true, value: null };
  });
}

async function expireRejected(now: Date, batchSize: number) {
  const candidates = await requireDatabase()
    .select({ id: submissions.id, ownerUserId: submissions.ownerUserId })
    .from(submissions)
    .where(and(eq(submissions.status, "rejected"), lte(submissions.expiresAt, now)))
    .orderBy(asc(submissions.expiresAt))
    .limit(batchSize);
  let removed = 0;
  for (const candidate of candidates) {
    removed += await withWriteTransaction(async (tx) => {
      await tx.select({ userId: profileAccounts.userId }).from(profileAccounts)
        .where(eq(profileAccounts.userId, candidate.ownerUserId)).for("update");
      const [submission] = await tx.select().from(submissions)
        .where(eq(submissions.id, candidate.id)).for("update");
      if (!submission || submission.status !== "rejected" || !submission.expiresAt || submission.expiresAt > now) return 0;
      await removeSubmission(tx, submission, now, false);
      return 1;
    });
  }
  return removed;
}

async function expireAbandonedUploads(now: Date, batchSize: number) {
  const candidates = await requireDatabase()
    .select({ id: submissionUploads.id, ownerUserId: submissionUploads.ownerUserId })
    .from(submissionUploads)
    .where(and(
      isNull(submissionUploads.attachedSubmissionId),
      lte(submissionUploads.expiresAt, now),
      inArray(submissionUploads.state, ["pending", "completed"]),
    ))
    .orderBy(asc(submissionUploads.expiresAt))
    .limit(batchSize);
  let queued = 0;
  for (const candidate of candidates) {
    queued += await withWriteTransaction(async (tx) => {
      await tx.select({ userId: profileAccounts.userId }).from(profileAccounts)
        .where(eq(profileAccounts.userId, candidate.ownerUserId)).for("update");
      const [upload] = await tx.select().from(submissionUploads)
        .where(eq(submissionUploads.id, candidate.id)).for("update");
      if (!upload || upload.attachedSubmissionId || upload.expiresAt > now) return 0;
      await tx.update(submissionUploads).set({
        state: "discarded",
        discardedAt: upload.discardedAt ?? now,
        updatedAt: now,
      }).where(eq(submissionUploads.id, upload.id));
      await enqueueCleanup(tx, privateUploadCleanupInput(upload.id, now));
      return 1;
    });
  }
  return queued;
}

export async function queuePrivateUploadCleanupForOwner(
  ownerUserId: string,
  uploadId: string,
) {
  await withWriteTransaction(async (tx) => {
    const [account] = await tx.select({ userId: profileAccounts.userId })
      .from(profileAccounts).where(eq(profileAccounts.userId, ownerUserId)).for("update");
    if (!account) throw new Error("The upload owner is unavailable.");
    const [upload] = await tx.select({
      id: submissionUploads.id,
      ownerUserId: submissionUploads.ownerUserId,
      state: submissionUploads.state,
      attachedSubmissionId: submissionUploads.attachedSubmissionId,
    }).from(submissionUploads).where(eq(submissionUploads.id, uploadId)).for("update");
    if (
      !upload ||
      upload.ownerUserId !== ownerUserId ||
      upload.state !== "discarded" ||
      upload.attachedSubmissionId
    ) throw new Error("The upload is not ready for cleanup.");
    await enqueueCleanup(tx, privateUploadCleanupInput(uploadId, new Date()));
  });
}

async function leaseJobs(now: Date, batchSize: number): Promise<LeasedCleanupJob[]> {
  return withWriteTransaction(async (tx) => {
    const rows = await tx.select().from(cleanupJobs)
      .where(and(
        lte(cleanupJobs.nextAttemptAt, now),
        or(
          eq(cleanupJobs.status, "pending"),
          and(eq(cleanupJobs.status, "leased"), lte(cleanupJobs.leaseExpiresAt, now)),
        ),
      ))
      .orderBy(asc(cleanupJobs.nextAttemptAt), asc(cleanupJobs.createdAt))
      .limit(batchSize)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    await tx.update(cleanupJobs).set({
      status: "leased",
      leaseExpiresAt: new Date(now.getTime() + LEASE_MILLISECONDS),
      updatedAt: now,
    }).where(inArray(cleanupJobs.id, ids));
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as CleanupJobInput["kind"],
      targetId: row.targetId,
      attempts: row.attempts,
    }));
  });
}

export const leaseCleanupJobs = leaseJobs;

async function completeJob(id: string) {
  await requireDatabase().delete(cleanupJobs).where(eq(cleanupJobs.id, id));
}

async function retryJob(id: string, nextAttemptAt: Date, error: string) {
  await requireDatabase().update(cleanupJobs).set({
    status: "pending",
    attempts: sql`${cleanupJobs.attempts} + 1`,
    nextAttemptAt,
    leaseExpiresAt: null,
    lastError: error,
    updatedAt: new Date(),
  }).where(eq(cleanupJobs.id, id));
}

async function processPrivateUpload(uploadId: string) {
  const prepared = await withWriteTransaction(async (tx) => {
    const [identity] = await tx.select({ ownerUserId: submissionUploads.ownerUserId })
      .from(submissionUploads).where(eq(submissionUploads.id, uploadId));
    if (!identity) return null;
    await tx.select({ userId: profileAccounts.userId }).from(profileAccounts)
      .where(eq(profileAccounts.userId, identity.ownerUserId)).for("update");
    const [upload] = await tx.select().from(submissionUploads)
      .where(eq(submissionUploads.id, uploadId)).for("update");
    if (!upload) return null;
    const [reference] = await tx.select({ id: submissions.id }).from(submissions)
      .where(eq(submissions.uploadId, upload.id)).limit(1);
    if (reference || upload.attachedSubmissionId) return { referenced: true as const, keys: [] };
    await tx.update(submissionUploads).set({
      state: "discarded",
      discardedAt: upload.discardedAt ?? new Date(),
      updatedAt: new Date(),
    }).where(eq(submissionUploads.id, upload.id));
    return {
      referenced: false as const,
      keys: [upload.stagingKey, upload.objectKey, ...upload.derivativeKeys].filter((key): key is string => Boolean(key)),
    };
  });
  if (!prepared || prepared.referenced) return;
  await deletePrivateUploads(prepared.keys);
  await withWriteTransaction(async (tx) => {
    const [reference] = await tx.select({ id: submissions.id }).from(submissions)
      .where(eq(submissions.uploadId, uploadId)).limit(1);
    if (!reference) await tx.delete(submissionUploads).where(eq(submissionUploads.id, uploadId));
  });
}

function keysForAsset(asset: ManagedMediaAsset) {
  return [
    asset.storageKey,
    ...(asset.variantStorageKeys ?? []),
    ...(asset.videoPreviewStorageKey ? [asset.videoPreviewStorageKey] : []),
    ...(asset.posterStorageKey ? [asset.posterStorageKey] : []),
  ];
}

export function unreferencedAssetKeys(
  assets: ManagedMediaAsset[],
  referenced: ReadonlySet<string>,
) {
  return [...new Set(assets.flatMap(keysForAsset))].filter((key) => !referenced.has(key));
}

function addMediaKeys(target: Set<string>, row: {
  storageKey: string | null;
  variants: { storageKey: string }[];
  videoPreview?: { storageKey: string } | null;
  posterStorageKey?: string | null;
}) {
  if (row.storageKey) target.add(row.storageKey);
  for (const variant of row.variants) target.add(variant.storageKey);
  if (row.videoPreview?.storageKey) target.add(row.videoPreview.storageKey);
  if (row.posterStorageKey) target.add(row.posterStorageKey);
}

async function publicReferenceKeys() {
  const database = requireDatabase();
  const [posts, logos, websiteAssets, sections, avatars, attachedAttempts] = await Promise.all([
    database.select({ storageKey: postMedia.storageKey, variants: postMedia.variants, videoPreview: postMedia.videoPreview, posterStorageKey: postMedia.posterStorageKey }).from(postMedia),
    database.select({ storageKey: logoMedia.storageKey, variants: logoMedia.variants }).from(logoMedia),
    database.select({ storageKey: websiteMedia.storageKey, variants: websiteMedia.variants, videoPreview: websiteMedia.videoPreview, posterStorageKey: websiteMedia.posterStorageKey }).from(websiteMedia),
    database.select({ storageKey: websiteSections.imageStorageKey, variants: websiteSections.imageVariants }).from(websiteSections),
    database.select({ storageKey: creators.avatarStorageKey }).from(creators),
    database.select({ assets: submissionPublicationAttempts.assets }).from(submissionPublicationAttempts).where(eq(submissionPublicationAttempts.status, "attached")),
  ]);
  const keys = new Set<string>();
  for (const row of [...posts, ...logos, ...websiteAssets, ...sections]) addMediaKeys(keys, row);
  for (const avatar of avatars) if (avatar.storageKey) keys.add(avatar.storageKey);
  for (const attempt of attachedAttempts) {
    for (const asset of attempt.assets) for (const key of keysForAsset(asset)) keys.add(key);
  }
  return keys;
}

async function processPublicOrphan(attemptId: string) {
  const [attempt] = await requireDatabase().select().from(submissionPublicationAttempts)
    .where(eq(submissionPublicationAttempts.id, attemptId)).limit(1);
  if (!attempt || attempt.status === "attached") return;
  if (attempt.status !== "cleanup") throw new Error("Publication assets are not ready for cleanup.");
  const referenced = await publicReferenceKeys();
  const deletable = unreferencedAssetKeys(attempt.assets, referenced);
  await deleteR2StorageKeys(deletable);
  await requireDatabase().delete(submissionPublicationAttempts)
    .where(and(eq(submissionPublicationAttempts.id, attemptId), eq(submissionPublicationAttempts.status, "cleanup")));
}

function clerkMissing(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; statusCode?: unknown; clerkError?: unknown };
  return candidate.status === 404 || candidate.statusCode === 404;
}

export function createAccountDeletionFinalizer(dependencies: {
  deleteClerk(userId: string): Promise<void>;
  recordFailure(userId: string, message: string): Promise<void>;
  finalize(userId: string): Promise<void>;
  isMissing(error: unknown): boolean;
}) {
  return async (userId: string) => {
    try {
      await dependencies.deleteClerk(userId);
    } catch (error) {
      if (!dependencies.isMissing(error)) {
        await dependencies.recordFailure(userId, errorMessage(error));
        throw error;
      }
    }
    await dependencies.finalize(userId);
  };
}

async function ensureDurableCreatorAvatar(userId: string) {
  const [creator] = await requireDatabase().select({
    id: creators.id,
    avatarUrl: creators.avatarUrl,
    avatarStorageKey: creators.avatarStorageKey,
  }).from(creators).where(eq(creators.ownerUserId, userId)).limit(1);
  if (!creator || creator.avatarStorageKey || creator.avatarUrl.startsWith("/")) return;
  const url = new URL(creator.avatarUrl);
  if (url.protocol !== "https:") throw new Error("The retained creator avatar URL is invalid.");

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("The retained creator avatar could not be downloaded.");
  const source = new Uint8Array(await response.arrayBuffer());
  if (source.byteLength > 10 * 1024 * 1024) throw new Error("The retained creator avatar is too large.");
  const { default: sharp } = await import("sharp");
  const bytes = await sharp(source).resize(256, 256, { fit: "cover" }).webp({ quality: 84 }).toBuffer();
  const upload = await createR2PresignedUpload({ kind: "creator-avatar", contentType: "image/webp" });
  const uploadResponse = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body: bytes,
  });
  if (!uploadResponse.ok) throw new Error("The retained creator avatar could not be stored.");
  await verifyR2Upload({ kind: "creator-avatar", storageKey: upload.storageKey, contentType: "image/webp", size: bytes.byteLength });
  const updated = await requireDatabase().update(creators).set({
    avatarUrl: getR2PublicUrl(upload.storageKey),
    avatarStorageProvider: "r2",
    avatarStorageKey: upload.storageKey,
    updatedAt: new Date(),
  }).where(and(
    eq(creators.id, creator.id),
    eq(creators.ownerUserId, userId),
    isNull(creators.avatarStorageKey),
  )).returning({ id: creators.id });
  if (updated.length === 0) await deleteR2StorageKeys([upload.storageKey]);
}

async function processAccountDeletion(userId: string) {
  await ensureDurableCreatorAvatar(userId);
  const uploadIds = await withWriteTransaction(async (tx) => {
    const [account] = await tx.select().from(profileAccounts)
      .where(eq(profileAccounts.userId, userId)).for("update");
    if (!account) return null;
    if (account.status !== "deleting") throw new Error("The account is not marked for deletion.");
    const ownedSubmissions = await tx.select({ id: submissions.id }).from(submissions)
      .where(eq(submissions.ownerUserId, userId));
    const ids = ownedSubmissions.map((submission) => submission.id);
    for (const submission of ownedSubmissions) {
      await queuePublicationAttemptCleanup(tx, submission.id, new Date());
    }
    if (ids.length > 0) await tx.delete(submissions).where(inArray(submissions.id, ids));
    const uploads = await tx.select({ id: submissionUploads.id }).from(submissionUploads)
      .where(eq(submissionUploads.ownerUserId, userId));
    for (const upload of uploads) {
      await tx.update(submissionUploads).set({
        state: "discarded",
        attachedSubmissionId: null,
        attachedAt: null,
        discardedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(submissionUploads.id, upload.id));
      await enqueueCleanup(tx, privateUploadCleanupInput(upload.id, new Date()));
    }
    await tx.delete(creatorClaims).where(eq(creatorClaims.requesterUserId, userId));
    await tx.delete(profileMessages).where(eq(profileMessages.ownerUserId, userId));
    await tx.delete(savedPosts).where(eq(savedPosts.userId, userId));
    await tx.delete(submissionReceipts).where(eq(submissionReceipts.ownerUserId, userId));
    await tx.delete(submissionQuotaEvents).where(eq(submissionQuotaEvents.ownerUserId, userId));
    return uploads.map((upload) => upload.id);
  });
  if (!uploadIds) return;
  for (const uploadId of uploadIds) await processPrivateUpload(uploadId);

  await withWriteTransaction(async (tx) => {
    const [account] = await tx.select({ status: profileAccounts.status }).from(profileAccounts)
      .where(eq(profileAccounts.userId, userId)).for("update");
    if (!account) return;
    const [remainingUpload] = await tx.select({ id: submissionUploads.id }).from(submissionUploads)
      .where(eq(submissionUploads.ownerUserId, userId)).limit(1);
    if (remainingUpload) throw new Error("Private account media cleanup is still pending.");
    await tx.update(creators).set({ ownerUserId: null, xProviderId: null, updatedAt: new Date() })
      .where(eq(creators.ownerUserId, userId));
  });

  await createAccountDeletionFinalizer({
    async deleteClerk(targetUserId) {
      const client = await clerkClient();
      await client.users.deleteUser(targetUserId);
    },
    async recordFailure(targetUserId, message) {
      await requireDatabase().update(profileAccounts).set({ deletionError: message, updatedAt: new Date() })
        .where(eq(profileAccounts.userId, targetUserId));
    },
    async finalize(targetUserId) {
      await requireDatabase().delete(profileAccounts).where(eq(profileAccounts.userId, targetUserId));
    },
    isMissing: clerkMissing,
  })(userId);
}

async function processJob(job: LeasedCleanupJob) {
  if (job.kind === "delete_private_upload") return processPrivateUpload(job.targetId);
  if (job.kind === "delete_public_orphan") return processPublicOrphan(job.targetId);
  return processAccountDeletion(job.targetId);
}

async function pruneReceipts(now: Date) {
  const database = requireDatabase();
  await Promise.all([
    database.delete(submissionReceipts).where(lte(submissionReceipts.expiresAt, now)),
    database.delete(submissionQuotaEvents).where(lte(submissionQuotaEvents.expiresAt, now)),
  ]);
}

const productionRunner = createCleanupRunner({
  expireRejected,
  expireAbandonedUploads,
  leaseJobs,
  processJob,
  completeJob,
  retryJob,
  pruneReceipts,
});

export function runProfileCleanup(now: Date, batchSize: number): Promise<CleanupReport> {
  return productionRunner(now, batchSize);
}
