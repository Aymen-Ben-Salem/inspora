import "server-only";

import { randomUUID } from "node:crypto";

import { and, count, eq, gt, inArray, isNull, min } from "drizzle-orm";

import { creators, profileAccounts, submissionQuotaEvents, submissions, submissionUploads } from "../../db/schema";
import { withWriteTransaction, type WriteTx } from "../../db/write-client";
import { getDatabase } from "../../db/client";

import { SUBMISSION_LIMIT } from "./quota";
import type {
  QuotaSnapshot,
  SubmissionKind,
  SubmissionReceipt,
  SubmissionResult,
  SubmissionStatus,
  ValidatedCreateSubmissionInput,
} from "./types";

export type SubmissionRecord = {
  id: string;
  ownerUserId: string;
  creatorId: string;
  requestId: string;
  kind: SubmissionKind;
  sourceUrl: string | null;
  uploadId: string | null;
  sourceFingerprint: string;
  status: SubmissionStatus;
  publishedHref: string | null;
};

export type UploadIntentRecord = {
  id: string;
  ownerUserId: string;
  requestId: string;
  kind: "design" | "logo";
  state: "pending" | "completed" | "discarded";
  stagingKey: string;
  objectKey: string | null;
  derivativeKeys: string[];
  contentType: string;
  sizeBytes: number;
  verifiedContentType: string | null;
  verifiedSizeBytes: number | null;
  digest: string | null;
  expiresAt: Date;
  attachedSubmissionId: string | null;
};

export type SubmissionTransaction = {
  lockAccount(ownerUserId: string): Promise<{
    status: "active" | "deleting";
    creatorId: string;
  } | null>;
  findSubmissionByRequest(
    ownerUserId: string,
    requestId: string,
  ): Promise<SubmissionRecord | null>;
  readQuota(ownerUserId: string, now: Date): Promise<QuotaSnapshot>;
  findOwnedUpload(
    ownerUserId: string,
    uploadId: string,
  ): Promise<UploadIntentRecord | null>;
  findUploadByRequest(
    ownerUserId: string,
    requestId: string,
  ): Promise<UploadIntentRecord | null>;
  findActiveDuplicate(
    ownerUserId: string,
    fingerprint: string,
  ): Promise<SubmissionRecord | null>;
  insertSubmission(input: Omit<SubmissionRecord, "status" | "publishedHref">): Promise<SubmissionRecord>;
  insertQuotaEvent(input: {
    id: string;
    ownerUserId: string;
    submissionId: string;
    createdAt: Date;
    expiresAt: Date;
  }): Promise<void>;
  attachUpload(
    ownerUserId: string,
    uploadId: string,
    submissionId: string,
  ): Promise<boolean>;
  insertUpload(
    input: Omit<
      UploadIntentRecord,
      | "state"
      | "objectKey"
      | "derivativeKeys"
      | "verifiedContentType"
      | "verifiedSizeBytes"
      | "digest"
      | "attachedSubmissionId"
    >,
  ): Promise<UploadIntentRecord>;
  completeUpload(
    ownerUserId: string,
    uploadId: string,
    metadata: {
      objectKey: string;
      derivativeKeys: string[];
      contentType: string;
      sizeBytes: number;
      digest: string;
    },
  ): Promise<boolean>;
  discardUpload(ownerUserId: string, uploadId: string): Promise<boolean>;
};

export type SubmissionDataStore = {
  transaction<T>(work: (tx: SubmissionTransaction) => Promise<T>): Promise<T>;
};

function receipt(record: SubmissionRecord): SubmissionReceipt {
  return {
    id: record.id,
    status: record.status,
    ownerHref:
      record.status === "accepted" && record.publishedHref
        ? record.publishedHref
        : record.status === "in_review"
          ? `/profile?filter=in-review&submission=${record.id}`
          : `/profile?submission=${record.id}`,
  };
}

function failure(
  code: "forbidden" | "account_deleting" | "daily_limit" | "review_limit" | "upload_expired" | "conflict" | "duplicate",
  message: string,
  retryAt?: string,
): SubmissionResult<never> {
  return { ok: false, code, message, ...(retryAt ? { retryAt } : {}) };
}

export function createSubmissionRepository(
  store: SubmissionDataStore,
  options: { now?: () => Date; randomUUID?: () => string } = {},
) {
  const now = options.now ?? (() => new Date());
  const createId = options.randomUUID ?? randomUUID;

  return {
    async create(
      ownerUserId: string,
      input: ValidatedCreateSubmissionInput,
    ): Promise<SubmissionResult<SubmissionReceipt>> {
      return store.transaction(async (tx) => {
        const account = await tx.lockAccount(ownerUserId);
        if (!account) return failure("forbidden", "Your profile account was not found.");
        if (account.status !== "active") {
          return failure("account_deleting", "This account is being deleted.");
        }

        const existing = await tx.findSubmissionByRequest(
          ownerUserId,
          input.requestId,
        );
        if (existing) return { ok: true, value: receipt(existing) };

        const currentTime = now();
        let upload: UploadIntentRecord | null = null;
        let fingerprint: string;
        if (input.source === "upload") {
          upload = await tx.findOwnedUpload(ownerUserId, input.uploadId);
          if (!upload) return failure("forbidden", "That upload is unavailable.");
          if (upload.expiresAt <= currentTime) {
            return failure(
              "upload_expired",
              "That upload has expired.",
              upload.expiresAt.toISOString(),
            );
          }
          if (
            upload.kind !== input.kind ||
            upload.state !== "completed" ||
            upload.attachedSubmissionId ||
            !upload.digest
          ) {
            return failure("conflict", "That upload is not ready to submit.");
          }
          fingerprint = `file:${upload.digest}`;
        } else {
          fingerprint = input.fingerprint;
        }

        const quota = await tx.readQuota(ownerUserId, currentTime);
        if (quota.submittedLast24Hours >= SUBMISSION_LIMIT) {
          return failure(
            "daily_limit",
            "You have submitted five items in the last 24 hours.",
            quota.nextDailySlotAt ?? undefined,
          );
        }
        const ownReservation = upload ? 1 : 0;
        if (quota.inReview + quota.activeUploads - ownReservation >= SUBMISSION_LIMIT) {
          return failure(
            "review_limit",
            "Five items are already reserved or in review.",
          );
        }

        if (await tx.findActiveDuplicate(ownerUserId, fingerprint)) {
          return failure("duplicate", "You already submitted this source.");
        }

        const submissionId = createId();
        const created = await tx.insertSubmission({
          id: submissionId,
          ownerUserId,
          creatorId: account.creatorId,
          requestId: input.requestId,
          kind: input.kind,
          sourceUrl: input.source === "link" ? input.originalUrl : null,
          uploadId: input.source === "upload" ? input.uploadId : null,
          sourceFingerprint: fingerprint,
        });
        if (upload) {
          const attached = await tx.attachUpload(ownerUserId, upload.id, submissionId);
          if (!attached) return failure("conflict", "That upload is already attached.");
        }
        await tx.insertQuotaEvent({
          id: createId(),
          ownerUserId,
          submissionId,
          createdAt: currentTime,
          expiresAt: new Date(currentTime.getTime() + 24 * 60 * 60 * 1000),
        });
        return { ok: true, value: receipt(created) };
      });
    },

    async quota(ownerUserId: string): Promise<QuotaSnapshot> {
      return store.transaction((tx) => tx.readQuota(ownerUserId, now()));
    },

    async reserveUpload(ownerUserId: string, input: {
      id: string; requestId: string; kind: "design" | "logo"; stagingKey: string;
      contentType: string; sizeBytes: number; expiresAt: Date;
    }): Promise<SubmissionResult<UploadIntentRecord>> {
      return store.transaction(async (tx) => {
        const account = await tx.lockAccount(ownerUserId);
        if (!account) return failure("forbidden", "Your profile account was not found.");
        if (account.status !== "active") return failure("account_deleting", "This account is being deleted.");
        const existing = await tx.findUploadByRequest(ownerUserId, input.requestId);
        const currentTime = now();
        if (existing) {
          if (existing.expiresAt <= currentTime) {
            return failure(
              "upload_expired",
              "That upload has expired.",
              existing.expiresAt.toISOString(),
            );
          }
          if (existing.state === "discarded") {
            return failure("conflict", "That upload was discarded.");
          }
          return { ok: true, value: existing };
        }
        const snapshot = await tx.readQuota(ownerUserId, currentTime);
        if (snapshot.submittedLast24Hours >= SUBMISSION_LIMIT) {
          return failure("daily_limit", "You have submitted five items in the last 24 hours.", snapshot.nextDailySlotAt ?? undefined);
        }
        if (snapshot.inReview + snapshot.activeUploads >= SUBMISSION_LIMIT) {
          return failure("review_limit", "Five items are already reserved or in review.");
        }
        return { ok: true, value: await tx.insertUpload({ ...input, ownerUserId }) };
      });
    },

    async findUpload(ownerUserId: string, uploadId: string) {
      return store.transaction((tx) => tx.findOwnedUpload(ownerUserId, uploadId));
    },

    async recordCompletedUpload(ownerUserId: string, uploadId: string, metadata: {
      objectKey: string; derivativeKeys?: string[]; contentType: string; sizeBytes: number; digest: string;
    }): Promise<SubmissionResult<void>> {
      return store.transaction(async (tx) => {
        const account = await tx.lockAccount(ownerUserId);
        if (!account) return failure("forbidden", "That upload is unavailable.");
        if (account.status !== "active") return failure("account_deleting", "This account is being deleted.");
        const upload = await tx.findOwnedUpload(ownerUserId, uploadId);
        if (!upload) return failure("forbidden", "That upload is unavailable.");
        if (upload.state === "completed") return { ok: true, value: undefined };
        if (upload.expiresAt <= now()) return failure("upload_expired", "That upload has expired.", upload.expiresAt.toISOString());
        if (upload.state !== "pending" || upload.attachedSubmissionId) return failure("conflict", "That upload cannot be completed.");
        const updated = await tx.completeUpload(ownerUserId, uploadId, { ...metadata, derivativeKeys: metadata.derivativeKeys ?? [] });
        return updated ? { ok: true, value: undefined } : failure("conflict", "That upload changed while it was completing.");
      });
    },

    async discardUpload(ownerUserId: string, uploadId: string): Promise<SubmissionResult<UploadIntentRecord>> {
      return store.transaction(async (tx) => {
        const account = await tx.lockAccount(ownerUserId);
        if (!account) return failure("forbidden", "That upload is unavailable.");
        if (account.status !== "active") return failure("account_deleting", "This account is being deleted.");
        const upload = await tx.findOwnedUpload(ownerUserId, uploadId);
        if (!upload) return failure("forbidden", "That upload is unavailable.");
        if (upload.attachedSubmissionId) return failure("conflict", "An attached upload cannot be discarded.");
        if (upload.state !== "discarded" && !(await tx.discardUpload(ownerUserId, uploadId))) {
          return failure("conflict", "That upload could not be discarded.");
        }
        return { ok: true, value: upload };
      });
    },
  };
}

function mapSubmission(row: typeof submissions.$inferSelect): SubmissionRecord {
  return {
    id: row.id, ownerUserId: row.ownerUserId, creatorId: row.creatorId,
    requestId: row.requestId, kind: row.kind as SubmissionKind,
    sourceUrl: row.sourceUrl, uploadId: row.uploadId,
    sourceFingerprint: row.sourceFingerprint, status: row.status as SubmissionStatus,
    publishedHref: row.publishedHref,
  };
}

function mapUpload(row: typeof submissionUploads.$inferSelect): UploadIntentRecord {
  return {
    id: row.id, ownerUserId: row.ownerUserId, requestId: row.requestId,
    kind: row.kind as "design" | "logo", state: row.state as UploadIntentRecord["state"],
    stagingKey: row.stagingKey, objectKey: row.objectKey, derivativeKeys: row.derivativeKeys,
    contentType: row.contentType, sizeBytes: row.sizeBytes,
    verifiedContentType: row.verifiedContentType, verifiedSizeBytes: row.verifiedSizeBytes,
    digest: row.digest, expiresAt: row.expiresAt, attachedSubmissionId: row.attachedSubmissionId,
  };
}

function createDrizzleSubmissionTransaction(tx: WriteTx): SubmissionTransaction {
  return {
    async lockAccount(ownerUserId) {
      const [account] = await tx.select({ status: profileAccounts.status }).from(profileAccounts)
        .where(eq(profileAccounts.userId, ownerUserId)).for("update");
      if (!account) return null;
      const [creator] = await tx.select({ id: creators.id }).from(creators)
        .where(eq(creators.ownerUserId, ownerUserId)).limit(1);
      if (!creator) return null;
      return { status: account.status as "active" | "deleting", creatorId: creator.id };
    },
    async findSubmissionByRequest(ownerUserId, requestId) {
      const [row] = await tx.select().from(submissions).where(and(eq(submissions.ownerUserId, ownerUserId), eq(submissions.requestId, requestId))).limit(1);
      return row ? mapSubmission(row) : null;
    },
    async readQuota(ownerUserId, currentTime) {
      const [[daily], [review], [active], [next]] = await Promise.all([
        tx.select({ value: count() }).from(submissionQuotaEvents).where(and(eq(submissionQuotaEvents.ownerUserId, ownerUserId), gt(submissionQuotaEvents.expiresAt, currentTime))),
        tx.select({ value: count() }).from(submissions).where(and(eq(submissions.ownerUserId, ownerUserId), eq(submissions.status, "in_review"))),
        tx.select({ value: count() }).from(submissionUploads).where(and(eq(submissionUploads.ownerUserId, ownerUserId), inArray(submissionUploads.state, ["pending", "completed"]), isNull(submissionUploads.attachedSubmissionId), gt(submissionUploads.expiresAt, currentTime))),
        tx.select({ value: min(submissionQuotaEvents.expiresAt) }).from(submissionQuotaEvents).where(and(eq(submissionQuotaEvents.ownerUserId, ownerUserId), gt(submissionQuotaEvents.expiresAt, currentTime))),
      ]);
      return {
        submittedLast24Hours: daily?.value ?? 0, inReview: review?.value ?? 0,
        activeUploads: active?.value ?? 0,
        nextDailySlotAt: next?.value ? next.value.toISOString() : null,
      };
    },
    async findOwnedUpload(ownerUserId, uploadId) {
      const [row] = await tx.select().from(submissionUploads).where(and(eq(submissionUploads.ownerUserId, ownerUserId), eq(submissionUploads.id, uploadId))).limit(1);
      return row ? mapUpload(row) : null;
    },
    async findUploadByRequest(ownerUserId, requestId) {
      const [row] = await tx.select().from(submissionUploads).where(and(eq(submissionUploads.ownerUserId, ownerUserId), eq(submissionUploads.requestId, requestId))).limit(1);
      return row ? mapUpload(row) : null;
    },
    async findActiveDuplicate(ownerUserId, fingerprint) {
      const [row] = await tx.select().from(submissions).where(and(eq(submissions.ownerUserId, ownerUserId), eq(submissions.sourceFingerprint, fingerprint), inArray(submissions.status, ["in_review", "accepted"]))).limit(1);
      return row ? mapSubmission(row) : null;
    },
    async insertSubmission(input) {
      const [row] = await tx.insert(submissions).values(input).returning();
      if (!row) throw new Error("The submission could not be created.");
      return mapSubmission(row);
    },
    async insertQuotaEvent(input) { await tx.insert(submissionQuotaEvents).values(input); },
    async attachUpload(ownerUserId, uploadId, submissionId) {
      const [row] = await tx.update(submissionUploads).set({ attachedSubmissionId: submissionId, attachedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(submissionUploads.ownerUserId, ownerUserId), eq(submissionUploads.id, uploadId), eq(submissionUploads.state, "completed"), isNull(submissionUploads.attachedSubmissionId))).returning({ id: submissionUploads.id });
      return Boolean(row);
    },
    async insertUpload(input) {
      const [row] = await tx.insert(submissionUploads).values(input).returning();
      if (!row) throw new Error("The upload reservation could not be created.");
      return mapUpload(row);
    },
    async completeUpload(ownerUserId, uploadId, metadata) {
      const [row] = await tx.update(submissionUploads).set({
        state: "completed", objectKey: metadata.objectKey, derivativeKeys: metadata.derivativeKeys,
        verifiedContentType: metadata.contentType, verifiedSizeBytes: metadata.sizeBytes,
        digest: metadata.digest, completedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(submissionUploads.ownerUserId, ownerUserId), eq(submissionUploads.id, uploadId), eq(submissionUploads.state, "pending"), isNull(submissionUploads.attachedSubmissionId))).returning({ id: submissionUploads.id });
      return Boolean(row);
    },
    async discardUpload(ownerUserId, uploadId) {
      const [row] = await tx.update(submissionUploads).set({ state: "discarded", discardedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(submissionUploads.ownerUserId, ownerUserId), eq(submissionUploads.id, uploadId), inArray(submissionUploads.state, ["pending", "completed"]), isNull(submissionUploads.attachedSubmissionId))).returning({ id: submissionUploads.id });
      return Boolean(row);
    },
  };
}

const productionRepository = createSubmissionRepository({
  transaction: (work) => withWriteTransaction((tx) => work(createDrizzleSubmissionTransaction(tx))),
});

export function createSubmissionForOwner(ownerUserId: string, input: ValidatedCreateSubmissionInput) {
  return productionRepository.create(ownerUserId, input);
}
export function readOwnSubmissionQuota(ownerUserId: string) { return productionRepository.quota(ownerUserId); }
export function reserveOwnUpload(ownerUserId: string, input: Parameters<typeof productionRepository.reserveUpload>[1]) { return productionRepository.reserveUpload(ownerUserId, input); }
export function findOwnUpload(ownerUserId: string, uploadId: string) { return productionRepository.findUpload(ownerUserId, uploadId); }
export function recordCompletedUpload(ownerUserId: string, uploadId: string, metadata: Parameters<typeof productionRepository.recordCompletedUpload>[2]) { return productionRepository.recordCompletedUpload(ownerUserId, uploadId, metadata); }
export function discardUploadReservation(ownerUserId: string, uploadId: string) { return productionRepository.discardUpload(ownerUserId, uploadId); }

export function canReadSubmissionMedia(ownerUserId: string, viewerUserId: string | null, isAdmin: boolean) {
  return Boolean(viewerUserId && (isAdmin || viewerUserId === ownerUserId));
}

export async function findAuthorizedSubmissionMedia(submissionId: string, viewerUserId: string, isAdmin: boolean) {
  const database = getDatabase();
  if (!database) return null;
  const [row] = await database.select({
    ownerUserId: submissions.ownerUserId,
    objectKey: submissionUploads.objectKey,
    contentType: submissionUploads.verifiedContentType,
  }).from(submissions).innerJoin(submissionUploads, eq(submissions.uploadId, submissionUploads.id))
    .where(eq(submissions.id, submissionId)).limit(1);
  if (!row || !canReadSubmissionMedia(row.ownerUserId, viewerUserId, isAdmin) || !row.objectKey) return null;
  return { objectKey: row.objectKey, contentType: row.contentType };
}
