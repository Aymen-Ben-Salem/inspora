"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "../../auth/require-admin";
import {
  acceptAndPublishSubmission,
  getSubmissionReviewById,
  rejectSubmissionForReview,
} from "../submissions/review-service";
import type { ReviewPublicationInput } from "./publishing";
import { revalidateReviewTransition } from "./publishing";
import { formatValidationError, parseAdminPostForm } from "./post-validation";
import { parseAdminLogoForm } from "./logo-validation";
import { parseAdminWebsiteForm } from "./website-validation";
import type { AdminActionState } from "./types";
import { canonicalizeSubmissionReviewForm } from "./submission-review-form";
import { EditorialReviewError, prepareEditorialReview } from "./editorial-review";
import type { EditorialKind } from "./editorial-contract";

const submissionIdSchema = z.uuid();

function actionFailure(error: unknown): AdminActionState {
  if (error instanceof EditorialReviewError) return { status: "error", message: error.message };
  if (error instanceof z.ZodError) {
    return { status: "error", message: formatValidationError(error) };
  }
  console.error("Submission review action failed", error);
  return { status: "error", message: "The review could not be saved. Try again." };
}

function parsePublication(
  kind: "design" | "logo" | "website" | "app-icon",
  formData: FormData,
): ReviewPublicationInput {
  if (kind === "design") {
    return { kind, content: parseAdminPostForm(formData) };
  }
  if (kind === "website") {
    return { kind, content: parseAdminWebsiteForm(formData) };
  }
  return { kind, content: parseAdminLogoForm(formData) };
}

export async function acceptAndPublishAction(
  submissionId: string,
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { userId } = await requireAdmin();
  let id: string;
  try {
    id = submissionIdSchema.parse(submissionId);
    const submission = await getSubmissionReviewById(id);
    if (!submission) {
      return { status: "error", message: "That submission is no longer available." };
    }
    const publication = parsePublication(
      submission.kind,
      canonicalizeSubmissionReviewForm(formData, submission),
    );
    const editorialKind: EditorialKind = publication.kind === "design" ? "design"
      : publication.kind === "website" ? "website" : publication.kind === "app-icon" ? "icon" : "logo";
    // The browser swaps the private submission file for a managed upload on acceptance.
    const editorial = await prepareEditorialReview(editorialKind, publication.content, userId,
      { submittedMediaHref: submission.mediaHref ?? undefined, submittedMediaType: submission.mediaType ?? undefined });
    const result = await acceptAndPublishSubmission(id, { ...publication, editorial }, userId);
    if (!result.ok) return { status: "error", message: result.message };
    revalidateReviewTransition(id, result.value);
  } catch (error) {
    return actionFailure(error);
  }
  redirect(`/admin/submissions?accepted=${id}` as Route);
}

export async function rejectSubmissionAction(
  submissionId: string,
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const { userId } = await requireAdmin();
  let id: string;
  try {
    id = submissionIdSchema.parse(submissionId);
    const reason = z.string().trim().min(1).max(2000).parse(formData.get("reason"));
    const result = await rejectSubmissionForReview(id, reason, userId);
    if (!result.ok) return { status: "error", message: result.message };
    revalidateReviewTransition(id);
  } catch (error) {
    return actionFailure(error);
  }
  redirect(`/admin/submissions?rejected=${id}` as Route);
}
