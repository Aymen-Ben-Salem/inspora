"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/auth/require-admin";
import { PUBLISHED_LOGOS_CACHE_TAG } from "@/data/logos-repository";
import { PUBLISHED_POSTS_CACHE_TAG } from "@/data/posts-repository";
import { PUBLISHED_WEBSITES_CACHE_TAG } from "@/data/websites-repository";
import { reviewCreatorClaim } from "@/features/creators/claims";
import {
  createAdminCreator,
  deleteAdminCreator,
  updateAdminCreator,
} from "@/features/creators/repository";
import { parseAdminCreatorForm } from "@/features/creators/validation";
import { deleteManagedMediaAssetsSafely } from "@/storage/media-storage";

import { formatValidationError } from "./post-validation";
import type { AdminActionState } from "./types";

const idSchema = z.uuid();

function revalidateCreatorPaths() {
  updateTag(PUBLISHED_POSTS_CACHE_TAG);
  updateTag(PUBLISHED_LOGOS_CACHE_TAG);
  updateTag(PUBLISHED_WEBSITES_CACHE_TAG);
  revalidatePath("/");
  revalidatePath("/admin/creators");
  revalidatePath("/admin/posts");
  revalidatePath("/admin/logos");
  revalidatePath("/admin/websites");
}

function creatorErrorState(error: unknown): AdminActionState {
  if (error instanceof z.ZodError) {
    return { status: "error", message: formatValidationError(error) };
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
  const { userId } = await requireAdmin();
  try {
    const input = parseAdminCreatorForm(formData);
    if (input.id) {
      const updated = await updateAdminCreator(input.id, input, userId);
      await deleteManagedMediaAssetsSafely(updated.removedManagedMedia);
    } else {
      await createAdminCreator(input, userId);
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
  const { userId } = await requireAdmin();
  try {
    const id = idSchema.parse(formData.get("creatorId"));
    const deleted = await deleteAdminCreator(id, userId);
    await deleteManagedMediaAssetsSafely(deleted.removedManagedMedia);
  } catch (error) {
    return creatorErrorState(error);
  }
  revalidateCreatorPaths();
  redirect("/admin/creators?deleted=true" as Route);
}

export async function reviewCreatorClaimAction(formData: FormData) {
  const claimId = idSchema.parse(formData.get("claimId"));
  const decision = z.enum(["approve", "reject"]).parse(formData.get("decision"));
  const reason = String(formData.get("reason") ?? "");
  await reviewCreatorClaim(claimId, decision, reason);
  revalidateCreatorPaths();
}
