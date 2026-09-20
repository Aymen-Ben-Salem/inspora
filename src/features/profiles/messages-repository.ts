import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  profileMessages,
  submissions,
  submissionUploads,
} from "../../db/schema";
import { requireDatabase } from "../../db/client";
import type {
  SubmissionKind,
  SubmissionResult,
  SubmissionStatus,
} from "../submissions/types";

const REJECTION_RETENTION_MS = 48 * 60 * 60 * 1000;

export type OwnProfileSubmission = {
  id: string;
  kind: SubmissionKind;
  status: "in_review" | "rejected";
  source: "link" | "upload";
  sourceDomain: string | null;
  sourceUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  rejectionReason: string | null;
  rejectionExpiresAt: string | null;
};

export type OwnProfileMessage = {
  id: string;
  kind: "submission_accepted" | "claim_approved" | "claim_rejected";
  publishedHref: string | null;
  createdAt: string;
};

export type OwnProfileActivity = {
  submissions: OwnProfileSubmission[];
  messages: OwnProfileMessage[];
};

type ProfileSubmissionRow = {
  id: string;
  ownerUserId: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  sourceUrl: string | null;
  uploadId: string | null;
  mediaType: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
};

type ProfileMessageRow = {
  id: string;
  ownerUserId: string;
  kind: OwnProfileMessage["kind"];
  publishedHref: string | null;
  createdAt: Date;
  dismissedAt: Date | null;
};

function sourceDomain(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function projectOwnProfileActivity({
  messages,
  now,
  ownerUserId,
  submissions: rows,
}: {
  messages: ProfileMessageRow[];
  now: Date;
  ownerUserId: string;
  submissions: ProfileSubmissionRow[];
}): OwnProfileActivity {
  const ownSubmissions = rows
    .filter((row) => row.ownerUserId === ownerUserId)
    .filter((row) => {
      if (row.status === "in_review") return true;
      if (row.status !== "rejected" || !row.reviewedAt) return false;
      return row.reviewedAt.getTime() + REJECTION_RETENTION_MS > now.getTime();
    })
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map<OwnProfileSubmission>((row) => {
      const rejectionExpiresAt = row.reviewedAt
        ? new Date(row.reviewedAt.getTime() + REJECTION_RETENTION_MS).toISOString()
        : null;
      return {
        id: row.id,
        kind: row.kind,
        status: row.status as "in_review" | "rejected",
        source: row.uploadId ? "upload" : "link",
        sourceDomain: row.uploadId ? null : sourceDomain(row.sourceUrl),
        sourceUrl: row.uploadId ? null : row.sourceUrl,
        mediaType: row.mediaType,
        createdAt: row.createdAt.toISOString(),
        rejectionReason: row.rejectionReason,
        rejectionExpiresAt,
      };
    });

  const ownMessages = messages
    .filter((message) => message.ownerUserId === ownerUserId && !message.dismissedAt)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map<OwnProfileMessage>((message) => ({
      id: message.id,
      kind: message.kind,
      publishedHref: message.publishedHref,
      createdAt: message.createdAt.toISOString(),
    }));

  return { submissions: ownSubmissions, messages: ownMessages };
}

export async function getOwnProfileActivity(
  ownerUserId: string,
  now = new Date(),
): Promise<OwnProfileActivity> {
  const database = requireDatabase();
  const [submissionRows, messageRows] = await Promise.all([
    database
      .select({
        id: submissions.id,
        ownerUserId: submissions.ownerUserId,
        kind: submissions.kind,
        status: submissions.status,
        sourceUrl: submissions.sourceUrl,
        uploadId: submissions.uploadId,
        mediaType: submissionUploads.verifiedContentType,
        createdAt: submissions.createdAt,
        reviewedAt: submissions.reviewedAt,
        rejectionReason: submissions.rejectionReason,
      })
      .from(submissions)
      .leftJoin(submissionUploads, eq(submissionUploads.id, submissions.uploadId))
      .where(and(
        eq(submissions.ownerUserId, ownerUserId),
        inArray(submissions.status, ["in_review", "rejected"]),
      ))
      .orderBy(desc(submissions.createdAt)),
    database
      .select({
        id: profileMessages.id,
        ownerUserId: profileMessages.ownerUserId,
        kind: profileMessages.kind,
        publishedHref: profileMessages.publishedHref,
        createdAt: profileMessages.createdAt,
        dismissedAt: profileMessages.dismissedAt,
      })
      .from(profileMessages)
      .where(and(
        eq(profileMessages.ownerUserId, ownerUserId),
        isNull(profileMessages.dismissedAt),
      ))
      .orderBy(desc(profileMessages.createdAt)),
  ]);

  return projectOwnProfileActivity({
    ownerUserId,
    now,
    submissions: submissionRows as ProfileSubmissionRow[],
    messages: messageRows as ProfileMessageRow[],
  });
}

export type ProfileMessageDismissStore = {
  dismissOwnedMessage(ownerUserId: string, messageId: string): Promise<boolean>;
};

export async function dismissProfileMessageWithStore(
  store: ProfileMessageDismissStore,
  ownerUserId: string,
  messageId: string,
): Promise<SubmissionResult<null>> {
  const dismissed = await store.dismissOwnedMessage(ownerUserId, messageId);
  return dismissed
    ? { ok: true, value: null }
    : { ok: false, code: "forbidden", message: "That message is unavailable." };
}

const productionDismissStore: ProfileMessageDismissStore = {
  async dismissOwnedMessage(ownerUserId, messageId) {
    const rows = await requireDatabase()
      .update(profileMessages)
      .set({ dismissedAt: new Date() })
      .where(and(
        eq(profileMessages.id, messageId),
        eq(profileMessages.ownerUserId, ownerUserId),
        isNull(profileMessages.dismissedAt),
      ))
      .returning({ id: profileMessages.id });
    return rows.length === 1;
  },
};

export function dismissOwnProfileMessageForOwner(ownerUserId: string, messageId: string) {
  return dismissProfileMessageWithStore(productionDismissStore, ownerUserId, messageId);
}
