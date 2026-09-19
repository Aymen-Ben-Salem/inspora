export type SubmissionKind = "design" | "logo" | "website" | "app-icon";
export type SubmissionStatus = "in_review" | "accepted" | "rejected";

export type PublishedWorkRef = {
  kind: "design" | "logo" | "website";
  id: string;
  href: string;
};

export type CreateSubmissionInput =
  | { requestId: string; kind: SubmissionKind; source: "link"; url: string }
  | {
      requestId: string;
      kind: "design" | "logo";
      source: "upload";
      uploadId: string;
    };

export type SubmissionFailure =
  | "unauthenticated"
  | "forbidden"
  | "invalid_input"
  | "duplicate"
  | "daily_limit"
  | "review_limit"
  | "upload_expired"
  | "conflict"
  | "account_deleting"
  | "unavailable";

export type SubmissionResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: SubmissionFailure;
      message: string;
      retryAt?: string;
    };

export type SubmissionReceipt = {
  id: string;
  status: SubmissionStatus;
  ownerHref: string;
};

export type QuotaSnapshot = {
  submittedLast24Hours: number;
  inReview: number;
  activeUploads: number;
  nextDailySlotAt: string | null;
};

export type CleanupJobInput = {
  kind: "delete_private_upload" | "delete_public_orphan" | "delete_account";
  targetId: string;
  idempotencyKey: string;
  notBefore: string;
};

export type BeginUploadInput = {
  requestId: string;
  kind: "design" | "logo";
  contentType: string;
  sizeBytes: number;
};

export type PrivateUploadTicket = {
  uploadId: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export type ValidatedCreateSubmissionInput =
  | {
      requestId: string;
      kind: SubmissionKind;
      source: "link";
      originalUrl: string;
      canonicalUrl: string;
      fingerprint: string;
    }
  | {
      requestId: string;
      kind: "design" | "logo";
      source: "upload";
      uploadId: string;
    };
