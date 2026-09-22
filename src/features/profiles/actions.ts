"use server";

import { auth, reverificationError } from "@clerk/nextjs/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { PUBLISHED_LOGOS_CACHE_TAG } from "@/data/logos-repository";
import { PUBLISHED_POSTS_CACHE_TAG } from "@/data/posts-repository";
import { PUBLISHED_WEBSITES_CACHE_TAG } from "@/data/websites-repository";
import { ensureCreatorForOwner, ProfileMutationError, updateOwnedCreatorAvatar, updateOwnedCreatorProfile } from "@/features/creators/identity";
import {
  getMediaUploadLimit,
  MAX_IMAGE_UPLOAD_BYTES,
  type MediaUploadSignatureResult,
} from "@/features/admin/media-upload";
import {
  createR2PresignedUpload,
  deleteR2StorageKeys,
  getR2PublicUrl,
  isStorageKeyForKind,
  R2StorageConfigurationError,
  verifyR2Upload,
} from "@/storage/r2";
import { deleteManagedMediaAssetsSafely } from "@/storage/media-storage";

import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "./cache";
import { profileEditSchema } from "./validation";
import type { ProfileEditInput, ProfileEditResult } from "./types";
import { requestAccountDeletion } from "./account-lifecycle";
import { profileAccounts } from "@/db/schema";
import { requireDatabase } from "@/db/client";
import { eq } from "drizzle-orm";

const avatarRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sourceContentType: z.enum(["image/jpeg", "image/png"]),
  contentType: z.literal("image/webp"),
  size: z.number().int().positive().max(MAX_IMAGE_UPLOAD_BYTES),
});

const avatarCompletionSchema = avatarRequestSchema.extend({
  storageKey: z.string().trim().min(1).max(1024),
});

function refreshProfileCaches() {
  revalidateTag(PUBLIC_CREATOR_PROFILES_CACHE_TAG, { expire: 0 });
  revalidateTag(PUBLISHED_POSTS_CACHE_TAG, { expire: 0 });
  revalidateTag(PUBLISHED_LOGOS_CACHE_TAG, { expire: 0 });
  revalidateTag(PUBLISHED_WEBSITES_CACHE_TAG, { expire: 0 });
  revalidatePath("/profile");
  revalidatePath("/creators/[username]", "page");
}

async function authenticatedUserId() {
  const { userId } = await auth();
  return userId;
}

export async function updateOwnProfile(
  input: ProfileEditInput,
): Promise<ProfileEditResult> {
  const userId = await authenticatedUserId();
  if (!userId) return { ok: false, field: "form", message: "Sign in to edit your profile." };

  const parsed = profileEditSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      field: field === "name" || field === "username" || field === "websiteUrl" ? field : "form",
      message: issue?.message ?? "Check your profile details.",
    };
  }
  try {
    await updateOwnedCreatorProfile({ userId }, parsed.data);
  } catch (error) {
    if (error instanceof ProfileMutationError) {
      return { ok: false, field: error.field, message: error.message };
    }
    console.error("Profile update failed", error);
    return { ok: false, field: "form", message: "Your profile could not be saved. Try again." };
  }
  refreshProfileCaches();
  return { ok: true };
}

export async function createOwnAvatarUploadSignature(
  input: unknown,
): Promise<MediaUploadSignatureResult> {
  const userId = await authenticatedUserId();
  if (!userId) return { ok: false, message: "Sign in to change your photo." };
  const parsed = avatarRequestSchema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.size > getMediaUploadLimit(parsed.data.contentType, "creator-avatar")
  ) {
    return { ok: false, message: "Choose one JPG or PNG image up to 10 MB." };
  }
  try {
    await ensureCreatorForOwner({ userId });
    return {
      ok: true,
      ...(await createR2PresignedUpload({
        kind: "creator-avatar",
        contentType: parsed.data.contentType,
      })),
    };
  } catch (error) {
    if (error instanceof R2StorageConfigurationError) return { ok: false, message: error.message };
    console.error("Profile photo signing failed", error);
    return { ok: false, message: "The photo upload could not be prepared." };
  }
}

export async function completeOwnAvatarUpload(input: unknown) {
  const userId = await authenticatedUserId();
  if (!userId) return { ok: false as const, message: "Sign in to change your photo." };
  const parsed = avatarCompletionSchema.safeParse(input);
  if (!parsed.success || !isStorageKeyForKind(parsed.data.storageKey, "creator-avatar")) {
    return { ok: false as const, message: "The uploaded photo details are invalid." };
  }
  let updated: Awaited<ReturnType<typeof updateOwnedCreatorAvatar>>;
  try {
    await verifyR2Upload({
      kind: "creator-avatar",
      storageKey: parsed.data.storageKey,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
    });
    updated = await updateOwnedCreatorAvatar({ userId }, {
      storageKey: parsed.data.storageKey,
      url: getR2PublicUrl(parsed.data.storageKey),
    });
  } catch (error) {
    if (error instanceof ProfileMutationError) return { ok: false as const, message: error.message };
    console.error("Profile photo update failed", error);
    return { ok: false as const, message: "The photo could not be saved. Try again." };
  }
  await deleteManagedMediaAssetsSafely(updated.displacedAvatarAssets);
  refreshProfileCaches();
  return { ok: true as const, avatarUrl: updated.profile.avatarUrl };
}

export async function discardOwnAvatarUpload(storageKey: string) {
  const userId = await authenticatedUserId();
  if (!userId || !isStorageKeyForKind(storageKey, "creator-avatar")) return;
  await deleteR2StorageKeys([storageKey]);
}

export async function requestOwnAccountDeletion() {
  const authentication = await auth();
  if (!authentication.userId) {
    return { ok: false as const, code: "unauthenticated" as const, message: "Sign in to delete your account." };
  }
  if (!authentication.has({ reverification: "strict" })) {
    return reverificationError("strict");
  }
  try {
    return await requestAccountDeletion(authentication.userId);
  } catch (error) {
    console.error("Account deletion request failed", error);
    return { ok: false as const, code: "unavailable" as const, message: "Account deletion could not be started. Try again." };
  }
}

export async function getOwnAccountDeletionStatus() {
  const { userId } = await auth();
  if (!userId) return { state: "signed_out" as const, error: null };
  const [account] = await requireDatabase().select({
    status: profileAccounts.status,
    deletionError: profileAccounts.deletionError,
  }).from(profileAccounts).where(eq(profileAccounts.userId, userId)).limit(1);
  if (!account || account.status === "active") return { state: "active" as const, error: null };
  return { state: "deleting" as const, error: account.deletionError };
}
