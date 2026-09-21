import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { requireDatabase } from "../../db/client";
import {
  adminAuditLogs,
  cleanupJobs,
  creators,
  profileAccounts,
  profileMessages,
  submissionPublicationAttempts,
  submissionUploads,
  submissions,
} from "../../db/schema";
import { withWriteTransaction, type WriteTx } from "../../db/write-client";
import { getR2PublicUrl, isStorageKeyForKind } from "../../storage/r2";
import type { ManagedMediaAsset } from "../../storage/types";
import {
  enforceReviewedPublication,
  publishReviewedWork,
  type ReviewPublicationInput,
} from "../admin/publishing";
import { enqueueCleanup } from "./cleanup-jobs";
import type {
  PublishedWorkRef,
  SubmissionKind,
  SubmissionResult,
  SubmissionStatus,
} from "./types";

type ReviewAccountState = { status: "active" | "deleting" };
type ReviewCreatorState = { ownerUserId: string | null };

export type ReviewSubmissionState = {
  id: string;
  ownerUserId: string;
  creatorId: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  publishedRef: PublishedWorkRef | null;
  rejectionReason?: string | null;
  rejectedAt?: Date | null;
  expiresAt?: Date | null;
};

export type ReviewTransaction = {
  lockAccount(ownerUserId: string): Promise<ReviewAccountState | null>;
  lockSubmission(submissionId: string): Promise<ReviewSubmissionState | null>;
  lockCreator(creatorId: string): Promise<ReviewCreatorState | null>;
  publish(
    input: ReviewPublicationInput,
    actorId: string,
    creatorId: string,
  ): Promise<PublishedWorkRef>;
  markAccepted(
    submissionId: string,
    publishedRef: PublishedWorkRef,
    actorId: string,
    reviewedAt: Date,
  ): Promise<boolean>;
  insertAcceptanceMessage(
    submissionId: string,
    ownerUserId: string,
    publishedRef: PublishedWorkRef,
  ): Promise<void>;
  insertAuditEvent(
    submissionId: string,
    actorId: string,
    publishedRef: PublishedWorkRef,
  ): Promise<void>;
  markRejected(
    submissionId: string,
    actorId: string,
    reason: string,
    rejectedAt: Date,
    expiresAt: Date,
  ): Promise<boolean>;
  markAttemptAttached(
    attemptId: string,
    publishedRef: PublishedWorkRef,
  ): Promise<void>;
};

export type PreparedReviewPublication = {
  attemptId: string | null;
  input: ReviewPublicationInput;
};

export type ReviewServiceDependencies = {
  now(): Date;
  readSubmissionIdentity(
    submissionId: string,
  ): Promise<ReviewSubmissionState | null>;
  preparePublication(
    submissionId: string,
    input: ReviewPublicationInput,
    actorId: string,
  ): Promise<PreparedReviewPublication>;
  queuePreparedCleanup(attemptId: string): Promise<void>;
  transaction<T>(work: (tx: ReviewTransaction) => Promise<T>): Promise<T>;
};

function failure(
  code: "invalid_input" | "conflict" | "account_deleting" | "unavailable",
  message: string,
): SubmissionResult<never> {
  return { ok: false, code, message };
}

function acceptedResult(submission: ReviewSubmissionState) {
  return submission.status === "accepted" && submission.publishedRef
    ? ({ ok: true, value: submission.publishedRef } as const)
    : null;
}

export function createReviewService(dependencies: ReviewServiceDependencies) {
  return {
    async acceptAndPublish(
      submissionId: string,
      input: ReviewPublicationInput,
      actorId: string,
    ): Promise<SubmissionResult<PublishedWorkRef>> {
      const identity = await dependencies.readSubmissionIdentity(submissionId);
      if (!identity) return failure("conflict", "That submission is no longer available.");

      const previous = acceptedResult(identity);
      if (previous) return previous;
      if (identity.kind !== input.kind) {
        return failure("invalid_input", "The prepared content type does not match the submission.");
      }

      let prepared: PreparedReviewPublication;
      try {
        prepared = await dependencies.preparePublication(submissionId, input, actorId);
      } catch (error) {
        console.error("Review publication preparation failed", error);
        return failure("unavailable", "The public media could not be prepared. Try again.");
      }

      try {
        const outcome = await dependencies.transaction(async (tx) => {
          const account = await tx.lockAccount(identity.ownerUserId);
          if (!account) return {
            result: failure("conflict", "The submitter account is unavailable."),
            attachedAttempt: false,
          };
          if (account.status !== "active") {
            return {
              result: failure("account_deleting", "The submitter account is being deleted."),
              attachedAttempt: false,
            };
          }

          const submission = await tx.lockSubmission(submissionId);
          if (!submission || submission.ownerUserId !== identity.ownerUserId) {
            return {
              result: failure("conflict", "That submission is no longer available."),
              attachedAttempt: false,
            };
          }
          const accepted = acceptedResult(submission);
          if (accepted) return { result: accepted, attachedAttempt: false };
          if (submission.status !== "in_review") {
            return {
              result: failure("conflict", "That submission is no longer in review."),
              attachedAttempt: false,
            };
          }
          if (submission.kind !== prepared.input.kind) {
            return {
              result: failure("invalid_input", "The prepared content type does not match the submission."),
              attachedAttempt: false,
            };
          }

          const creator = await tx.lockCreator(submission.creatorId);
          if (!creator || creator.ownerUserId !== submission.ownerUserId) {
            return {
              result: failure("conflict", "The submission creator association changed."),
              attachedAttempt: false,
            };
          }

          const publishedRef = await tx.publish(
            prepared.input,
            actorId,
            submission.creatorId,
          );
          const reviewedAt = dependencies.now();
          if (!(await tx.markAccepted(submissionId, publishedRef, actorId, reviewedAt))) {
            throw new Error("The submission changed while it was being accepted.");
          }
          await tx.insertAcceptanceMessage(
            submissionId,
            submission.ownerUserId,
            publishedRef,
          );
          await tx.insertAuditEvent(submissionId, actorId, publishedRef);
          if (prepared.attemptId) {
            await tx.markAttemptAttached(prepared.attemptId, publishedRef);
          }
          return {
            result: { ok: true, value: publishedRef } as const,
            attachedAttempt: Boolean(prepared.attemptId),
          };
        });
        if (prepared.attemptId && !outcome.attachedAttempt) {
          await dependencies.queuePreparedCleanup(prepared.attemptId);
        }
        return outcome.result;
      } catch (error) {
        if (prepared.attemptId) {
          try {
            await dependencies.queuePreparedCleanup(prepared.attemptId);
          } catch (cleanupError) {
            console.error("Prepared publication cleanup could not be queued", cleanupError);
          }
        }
        console.error("Submission acceptance failed", error);
        return failure("unavailable", "The submission could not be published. Try again.");
      }
    },

    async rejectSubmission(
      submissionId: string,
      reason: string,
      actorId: string,
    ): Promise<SubmissionResult<null>> {
      const normalizedReason = reason.trim();
      if (!normalizedReason || normalizedReason.length > 2000) {
        return failure(
          "invalid_input",
          "Enter a rejection reason of 2,000 characters or fewer.",
        );
      }

      const identity = await dependencies.readSubmissionIdentity(submissionId);
      if (!identity) return failure("conflict", "That submission is no longer available.");
      if (identity.status === "rejected") return { ok: true, value: null };
      if (identity.status !== "in_review") {
        return failure("conflict", "That submission is no longer in review.");
      }

      return dependencies.transaction(async (tx) => {
        const account = await tx.lockAccount(identity.ownerUserId);
        if (!account) return failure("conflict", "The submitter account is unavailable.");
        if (account.status !== "active") {
          return failure("account_deleting", "The submitter account is being deleted.");
        }

        const submission = await tx.lockSubmission(submissionId);
        if (!submission || submission.ownerUserId !== identity.ownerUserId) {
          return failure("conflict", "That submission is no longer available.");
        }
        if (submission.status === "rejected") return { ok: true, value: null };
        if (submission.status !== "in_review") {
          return failure("conflict", "That submission is no longer in review.");
        }

        const rejectedAt = dependencies.now();
        const expiresAt = new Date(rejectedAt.getTime() + 48 * 60 * 60 * 1000);
        if (
          !(await tx.markRejected(
            submissionId,
            actorId,
            normalizedReason,
            rejectedAt,
            expiresAt,
          ))
        ) {
          return failure("conflict", "That submission changed while it was being rejected.");
        }
        return { ok: true, value: null };
      });
    },
  };
}

function publishedRefFromRow(row: typeof submissions.$inferSelect): PublishedWorkRef | null {
  if (!row.publishedKind || !row.publishedId || !row.publishedHref) return null;
  return {
    kind: row.publishedKind as PublishedWorkRef["kind"],
    id: row.publishedId,
    href: row.publishedHref,
  };
}

function reviewSubmissionFromRow(
  row: typeof submissions.$inferSelect,
): ReviewSubmissionState {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    creatorId: row.creatorId,
    kind: row.kind as SubmissionKind,
    status: row.status as SubmissionStatus,
    publishedRef: publishedRefFromRow(row),
    rejectionReason: row.rejectionReason,
    rejectedAt: row.rejectedAt,
    expiresAt: row.expiresAt,
  };
}

export type AdminSubmissionReview = {
  id: string;
  ownerUserId: string;
  creatorId: string;
  creatorName: string;
  creatorUsername: string | null;
  kind: SubmissionKind;
  status: SubmissionStatus;
  sourceUrl: string | null;
  uploadId: string | null;
  mediaType: string | null;
  mediaHref: string | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  publishedRef: PublishedWorkRef | null;
};

const reviewProjection = {
  id: submissions.id,
  ownerUserId: submissions.ownerUserId,
  creatorId: submissions.creatorId,
  creatorName: creators.name,
  creatorUsername: creators.username,
  kind: submissions.kind,
  status: submissions.status,
  sourceUrl: submissions.sourceUrl,
  uploadId: submissions.uploadId,
  mediaType: submissionUploads.verifiedContentType,
  createdAt: submissions.createdAt,
  reviewedAt: submissions.reviewedAt,
  rejectionReason: submissions.rejectionReason,
  expiresAt: submissions.expiresAt,
  publishedKind: submissions.publishedKind,
  publishedId: submissions.publishedId,
  publishedHref: submissions.publishedHref,
};

type ReviewProjectionRow = {
  [Key in keyof typeof reviewProjection]:
    Key extends "createdAt" ? Date :
    Key extends "reviewedAt" | "expiresAt" ? Date | null :
    Key extends "creatorUsername" | "sourceUrl" | "uploadId" | "mediaType" |
      "rejectionReason" | "publishedKind" | "publishedId" | "publishedHref"
      ? string | null
      : string;
};

function mapAdminSubmissionReview(row: ReviewProjectionRow): AdminSubmissionReview {
  const publishedRef =
    row.publishedKind && row.publishedId && row.publishedHref
      ? {
          kind: row.publishedKind as PublishedWorkRef["kind"],
          id: row.publishedId,
          href: row.publishedHref,
        }
      : null;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    creatorUsername: row.creatorUsername,
    kind: row.kind as SubmissionKind,
    status: row.status as SubmissionStatus,
    sourceUrl: row.sourceUrl,
    uploadId: row.uploadId,
    mediaType: row.mediaType,
    mediaHref: row.uploadId ? `/api/submissions/${row.id}/media` : null,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    publishedRef,
  };
}

function reviewQuery() {
  return requireDatabase()
    .select(reviewProjection)
    .from(submissions)
    .innerJoin(creators, eq(creators.id, submissions.creatorId))
    .leftJoin(submissionUploads, eq(submissionUploads.id, submissions.uploadId));
}

export async function getSubmissionReviewQueue() {
  const rows = await reviewQuery()
    .where(eq(submissions.status, "in_review"))
    .orderBy(desc(submissions.createdAt), desc(submissions.id));
  return rows.map((row) => mapAdminSubmissionReview(row as ReviewProjectionRow));
}

export async function getSubmissionReviewById(submissionId: string) {
  const [row] = await reviewQuery()
    .where(eq(submissions.id, submissionId))
    .limit(1);
  return row ? mapAdminSubmissionReview(row as ReviewProjectionRow) : null;
}

type ManagedInputMedia = {
  type?: "image" | "video";
  storageProvider?: "r2";
  storageKey?: string;
  variants?: { storageKey: string }[];
  videoPreview?: { storageKey: string };
  posterStorageKey?: string;
};

function managedAsset(media: ManagedInputMedia): ManagedMediaAsset[] {
  if (media.storageProvider !== "r2" || !media.storageKey) return [];
  return [{
    storageProvider: "r2",
    storageKey: media.storageKey,
    type: media.type ?? "image",
    variantStorageKeys: media.variants?.map((variant) => variant.storageKey),
    videoPreviewStorageKey: media.videoPreview?.storageKey,
    posterStorageKey: media.posterStorageKey,
  }];
}

function assertPublicManagedMedia(
  media: ManagedInputMedia & {
    url: string;
    posterUrl?: string;
    variants?: { storageKey: string; url: string }[];
    videoPreview?: { storageKey: string; url: string };
  },
  kinds: Parameters<typeof isStorageKeyForKind>[1][],
  publicUrlForKey: (key: string) => string,
) {
  if (media.storageProvider !== "r2" || !media.storageKey) {
    throw new Error("Review publication media must use a managed public upload.");
  }
  assertAllowedPublicKey(media.storageKey, kinds);
  if (media.url !== publicUrlForKey(media.storageKey)) {
    throw new Error("Review publication media URL does not match its public upload.");
  }
  for (const variant of media.variants ?? []) {
    assertAllowedPublicKey(variant.storageKey, kinds);
    if (variant.url !== publicUrlForKey(variant.storageKey)) {
      throw new Error("Review publication variant URL does not match its public upload.");
    }
  }
  if (media.videoPreview) {
    assertAllowedPublicKey(media.videoPreview.storageKey, kinds);
    if (media.videoPreview.url !== publicUrlForKey(media.videoPreview.storageKey)) {
      throw new Error("Review publication preview URL does not match its public upload.");
    }
  }
  if (media.posterStorageKey) {
    const posterKinds = kinds.includes("website-recording")
      ? ["website-poster"] as const
      : kinds;
    assertAllowedPublicKey(media.posterStorageKey, [...posterKinds]);
    if (media.posterUrl !== publicUrlForKey(media.posterStorageKey)) {
      throw new Error("Review publication poster URL does not match its public upload.");
    }
  } else if (media.posterUrl) {
    throw new Error("Review publication poster must use a managed public upload.");
  }
}

export function collectReviewedPublicationAssets(
  input: ReviewPublicationInput,
  publicUrlForKey: (key: string) => string,
) {
  if (input.kind === "design") {
    for (const media of input.content.media) {
      assertPublicManagedMedia(media, ["post-media"], publicUrlForKey);
    }
    return input.content.media.flatMap((media) => managedAsset(media));
  }
  if (input.kind === "website") {
    for (const media of input.content.media) {
      assertPublicManagedMedia(
        media,
        [media.role === "recording" ? "website-recording" : "website-favicon"],
        publicUrlForKey,
      );
    }
    for (const section of input.content.sections) {
      assertPublicManagedMedia(section, ["website-section"], publicUrlForKey);
    }
    return [
      ...input.content.media.flatMap((media) =>
        managedAsset({
          ...media,
          type: media.role === "recording" ? "video" : "image",
        }),
      ),
      ...input.content.sections.flatMap((section) =>
        managedAsset({ ...section, type: "image" }),
      ),
    ];
  }
  assertPublicManagedMedia(input.content.media, ["logo-media"], publicUrlForKey);
  return managedAsset(input.content.media);
}

function assertAllowedPublicKey(
  key: string,
  kinds: Parameters<typeof isStorageKeyForKind>[1][],
) {
  if (!kinds.some((kind) => isStorageKeyForKind(key, kind))) {
    throw new Error("Prepared public media has an invalid storage key.");
  }
}

function createDrizzleReviewTransaction(tx: WriteTx): ReviewTransaction {
  return {
    async lockAccount(ownerUserId) {
      const [account] = await tx
        .select({ status: profileAccounts.status })
        .from(profileAccounts)
        .where(eq(profileAccounts.userId, ownerUserId))
        .for("update");
      return account
        ? { status: account.status as ReviewAccountState["status"] }
        : null;
    },
    async lockSubmission(submissionId) {
      const [submission] = await tx
        .select()
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .for("update");
      return submission ? reviewSubmissionFromRow(submission) : null;
    },
    async lockCreator(creatorId) {
      const [creator] = await tx
        .select({ ownerUserId: creators.ownerUserId })
        .from(creators)
        .where(eq(creators.id, creatorId))
        .for("update");
      return creator ?? null;
    },
    publish: (input, actorId, creatorId) =>
      publishReviewedWork(tx, input, actorId, creatorId),
    async markAccepted(submissionId, publishedRef, actorId, reviewedAt) {
      const [updated] = await tx
        .update(submissions)
        .set({
          status: "accepted",
          reviewedBy: actorId,
          reviewedAt,
          publishedKind: publishedRef.kind,
          publishedId: publishedRef.id,
          publishedHref: publishedRef.href,
          updatedAt: reviewedAt,
        })
        .where(and(eq(submissions.id, submissionId), eq(submissions.status, "in_review")))
        .returning({ id: submissions.id });
      return Boolean(updated);
    },
    async insertAcceptanceMessage(submissionId, ownerUserId, publishedRef) {
      await tx.insert(profileMessages).values({
        submissionId,
        ownerUserId,
        publishedKind: publishedRef.kind,
        publishedId: publishedRef.id,
        publishedHref: publishedRef.href,
      });
    },
    async insertAuditEvent(submissionId, actorId, publishedRef) {
      await tx.insert(adminAuditLogs).values({
        actorId,
        action: "submission.accepted",
        resourceType:
          publishedRef.kind === "design" ? "post" : publishedRef.kind,
        resourceId: publishedRef.id,
        details: { submissionId, publishedHref: publishedRef.href },
      });
    },
    async markRejected(submissionId, actorId, reason, rejectedAt, expiresAt) {
      const [updated] = await tx
        .update(submissions)
        .set({
          status: "rejected",
          rejectionReason: reason,
          reviewedBy: actorId,
          reviewedAt: rejectedAt,
          rejectedAt,
          expiresAt,
          updatedAt: rejectedAt,
        })
        .where(and(eq(submissions.id, submissionId), eq(submissions.status, "in_review")))
        .returning({ id: submissions.id });
      return Boolean(updated);
    },
    async markAttemptAttached(attemptId, publishedRef) {
      const [current] = await tx
        .select({
          submissionId: submissionPublicationAttempts.submissionId,
          assets: submissionPublicationAttempts.assets,
        })
        .from(submissionPublicationAttempts)
        .where(eq(submissionPublicationAttempts.id, attemptId));
      if (!current) throw new Error("The publication attempt is unavailable.");
      const matching = await tx
        .select({ id: submissionPublicationAttempts.id })
        .from(submissionPublicationAttempts)
        .where(and(
          eq(submissionPublicationAttempts.submissionId, current.submissionId),
          inArray(submissionPublicationAttempts.status, ["prepared", "cleanup"]),
          sql`${submissionPublicationAttempts.assets} = ${JSON.stringify(current.assets)}::jsonb`,
        ));
      const matchingIds = matching.map((attempt) => attempt.id);
      if (matchingIds.length === 0) {
        throw new Error("The publication attempt could not be attached.");
      }
      await tx
        .update(submissionPublicationAttempts)
        .set({
          status: "attached",
          publishedKind: publishedRef.kind,
          publishedId: publishedRef.id,
          publishedHref: publishedRef.href,
          updatedAt: new Date(),
        })
        .where(inArray(submissionPublicationAttempts.id, matchingIds));
      await tx
        .delete(cleanupJobs)
        .where(inArray(cleanupJobs.targetId, matchingIds));
    },
  };
}

const productionReviewService = createReviewService({
  now: () => new Date(),
  async readSubmissionIdentity(submissionId) {
    const [submission] = await requireDatabase()
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);
    return submission ? reviewSubmissionFromRow(submission) : null;
  },
  async preparePublication(submissionId, input, actorId) {
    const reviewed = enforceReviewedPublication(input);
    const assets = collectReviewedPublicationAssets(reviewed, getR2PublicUrl);
    return withWriteTransaction(async (tx) => {
      const [attempt] = await tx
        .insert(submissionPublicationAttempts)
        .values({ submissionId, actorId, assets })
        .returning({ id: submissionPublicationAttempts.id });
      if (!attempt) throw new Error("The publication attempt could not be recorded.");
      return { attemptId: attempt.id, input: reviewed };
    });
  },
  async queuePreparedCleanup(attemptId) {
    await withWriteTransaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(submissionPublicationAttempts)
        .where(eq(submissionPublicationAttempts.id, attemptId));
      if (!current || current.status !== "prepared") return;
      const [attached] = await tx
        .select()
        .from(submissionPublicationAttempts)
        .where(and(
          eq(submissionPublicationAttempts.submissionId, current.submissionId),
          eq(submissionPublicationAttempts.status, "attached"),
          sql`${submissionPublicationAttempts.assets} = ${JSON.stringify(current.assets)}::jsonb`,
        ))
        .limit(1);
      if (attached?.publishedKind && attached.publishedId && attached.publishedHref) {
        await tx
          .update(submissionPublicationAttempts)
          .set({
            status: "attached",
            publishedKind: attached.publishedKind,
            publishedId: attached.publishedId,
            publishedHref: attached.publishedHref,
            updatedAt: new Date(),
          })
          .where(eq(submissionPublicationAttempts.id, attemptId));
        await tx
          .delete(cleanupJobs)
          .where(eq(cleanupJobs.targetId, attemptId));
        return;
      }
      const [attempt] = await tx
        .update(submissionPublicationAttempts)
        .set({ status: "cleanup", updatedAt: new Date() })
        .where(and(
          eq(submissionPublicationAttempts.id, attemptId),
          eq(submissionPublicationAttempts.status, "prepared"),
        ))
        .returning({ id: submissionPublicationAttempts.id });
      if (!attempt) return;
      await enqueueCleanup(tx, {
        kind: "delete_public_orphan",
        targetId: attempt.id,
        idempotencyKey: `publication-attempt:${attempt.id}`,
        notBefore: new Date().toISOString(),
      });
    });
  },
  transaction: (work) =>
    withWriteTransaction((tx) => work(createDrizzleReviewTransaction(tx))),
});

export function acceptAndPublishSubmission(
  submissionId: string,
  input: ReviewPublicationInput,
  actorId: string,
) {
  return productionReviewService.acceptAndPublish(submissionId, input, actorId);
}

export function rejectSubmissionForReview(
  submissionId: string,
  reason: string,
  actorId: string,
) {
  return productionReviewService.rejectSubmission(submissionId, reason, actorId);
}
