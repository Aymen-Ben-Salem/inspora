import type { SubmissionKind } from "../submissions/types";

export function canonicalizeSubmissionReviewForm(
  formData: FormData,
  submission: {
    kind: SubmissionKind;
    creatorId: string;
    creatorName: string;
  },
) {
  const canonical = new FormData();
  for (const [key, value] of formData.entries()) canonical.append(key, value);

  canonical.set("creatorId", submission.creatorId);
  canonical.set("creatorName", submission.creatorName);
  canonical.set("creatorHandle", "");
  canonical.set("creatorUsername", "");
  canonical.set("creatorUrl", "");
  canonical.set("creatorXProfileUrl", "");
  canonical.set("creatorAvatarUrl", "/brand/default-avatar.svg");
  canonical.set("creatorAvatarStorageProvider", "");
  canonical.set("creatorAvatarStorageKey", "");
  canonical.set("creatorRecordOrigin", "");
  canonical.set("status", "published");
  if (submission.kind === "logo" || submission.kind === "app-icon") {
    canonical.set("kind", submission.kind === "app-icon" ? "icon" : "logo");
  }

  return canonical;
}
