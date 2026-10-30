"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { Route } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { AdminAuthConfigurationError } from "@/auth/require-admin";
import { PUBLISHED_LOGOS_CACHE_TAG } from "@/data/logos-repository";
import { PUBLISHED_POSTS_CACHE_TAG } from "@/data/posts-repository";
import { PUBLISHED_WEBSITES_CACHE_TAG } from "@/data/websites-repository";
import {
  AdminCreatorMutationError,
  reviewCreatorOwnershipClaim,
  createAdminCreator,
  deleteAdminCreator,
  trashAdminCreator,
  restoreAdminCreator,
  updateAdminCreator,
} from "@/features/creators/identity";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";
import { parseAdminCreatorForm } from "@/features/creators/validation";
import { creatorClaimReviewSchema } from "@/features/creators/claim-validation";
import { CreatorClaimError } from "@/features/creators/identity/claim-requests";
import type { ClaimActionState } from "@/features/creators/types";
import { deleteManagedMediaAssetsSafely } from "@/storage/media-storage";

import { formatValidationError } from "./post-validation";
import type { AdminActionState, AdminCreatorAttribution } from "./types";

const idSchema = z.uuid();

function revalidateCreatorPaths() {
  updateTag(PUBLISHED_POSTS_CACHE_TAG);
  updateTag(PUBLISHED_LOGOS_CACHE_TAG);
  updateTag(PUBLISHED_WEBSITES_CACHE_TAG);
  updateTag(PUBLIC_CREATOR_PROFILES_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/creators");
  revalidatePath("/admin/posts");
  revalidatePath("/admin/logos");
  revalidatePath("/admin/websites");
  revalidatePath("/admin/submissions");
  revalidatePath("/admin/submissions/[id]", "page");
}

function creatorErrorState(error: unknown): AdminActionState {
  unstable_rethrow(error);
  if (error instanceof AdminAuthConfigurationError) throw error;
  if (error instanceof z.ZodError) {
    return { status: "error", message: formatValidationError(error) };
  }
  if (error instanceof AdminCreatorMutationError) {
    return { status: "error", message: error.message };
  }
  if (error instanceof Error) {
    const expected = [
      "already",
      "available",
      "claimed",
      "Creator not found",
      "Mirrored",
      "Reassign",
      "claim history",
      "reserved",
      "transferred",
      "username",
    ];
    if (expected.some((fragment) => error.message.includes(fragment))) {
      return { status: "error", message: error.message };
    }
  }
  console.error("Admin creator mutation failed", error);
  return { status: "error", message: "The creator could not be saved. Try again." };
}

export async function saveCreatorAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const input = parseAdminCreatorForm(formData);
    if (input.id) {
      const updated = await updateAdminCreator(input.id, input);
      await deleteManagedMediaAssetsSafely(updated.removedManagedMedia);
    } else {
      await createAdminCreator(input);
    }
  } catch (error) {
    return creatorErrorState(error);
  }
  revalidateCreatorPaths();
  redirect("/admin/creators?saved=true" as Route);
}

export async function deleteCreatorAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const id = idSchema.parse(formData.get("creatorId"));
    const deleted = await deleteAdminCreator(id);
    await deleteManagedMediaAssetsSafely(deleted.removedManagedMedia);
  } catch (error) {
    return creatorErrorState(error);
  }
  revalidateCreatorPaths();
  redirect("/admin/creators?deleted=true" as Route);
}

export async function trashCreatorAction(_previousState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  try { await trashAdminCreator(idSchema.parse(formData.get("creatorId"))); }
  catch (error) { return creatorErrorState(error); }
  revalidateCreatorPaths();
  redirect("/admin/creators?trashed=true" as Route);
}

export async function restoreCreatorAction(_previousState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  try { await restoreAdminCreator(idSchema.parse(formData.get("creatorId"))); }
  catch (error) { return creatorErrorState(error); }
  revalidateCreatorPaths();
  redirect("/admin/creators?view=trash&restored=true" as Route);
}

export async function saveCreatorProfileAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState & { creator?: AdminCreatorAttribution }> {
  let creator: AdminCreatorAttribution;
  try {
    const input = parseAdminCreatorForm(formData);
    if (!input.id) return { status: "error", message: "Select an existing creator to edit." };
    const updated = await updateAdminCreator(input.id, input);
    creator = updated.creator;
    await deleteManagedMediaAssetsSafely(updated.removedManagedMedia);
  } catch (error) {
    return creatorErrorState(error);
  }
  revalidateCreatorPaths();
  return { status: "idle", creator };
}

export async function reviewCreatorClaimAction(formData: FormData): Promise<ClaimActionState> {
  try {
    const input = creatorClaimReviewSchema.parse({ claimId: formData.get("claimId"), decision: formData.get("decision"), version: formData.get("version"), reason: String(formData.get("reason") ?? ""), evidenceConfirmed: formData.get("evidenceConfirmed") === "on" });
    if (input.decision === "approve" && !input.evidenceConfirmed) return { status: "error", message: "Confirm that you verified the ownership evidence and reviewed the merge." };
    const outcome = await reviewCreatorOwnershipClaim(input.claimId, input.decision, input.reason, input.version);
    if (outcome.status === "conflict") return { status: "error", message: outcome.message ?? "Ownership changed or this request cannot be approved. Reload the review and check both profiles." };
    await deleteManagedMediaAssetsSafely(outcome.displacedAvatarAssets ?? []);
    return { status: "success", message: outcome.status === "claimed" ? "Claim approved. The profiles and credited work have been merged." : outcome.status === "resolved" ? "Ownership report resolved. The creator can read your response in Your claims." : "Claim rejected. The creator can read your reason and submit corrected evidence." };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof z.ZodError) return { status: "error", message: error.issues[0]?.message ?? "Check the review details." };
    if (error instanceof CreatorClaimError) return { status: "error", message: error.message };
    console.error("Creator claim review failed", error);
    return { status: "error", message: "The review could not be completed. Check the X connection and try again." };
  }
}
