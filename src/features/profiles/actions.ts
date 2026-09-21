"use server";

import { auth, reverificationError } from "@clerk/nextjs/server";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { PUBLISHED_LOGOS_CACHE_TAG } from "@/data/logos-repository";
import { PUBLISHED_POSTS_CACHE_TAG } from "@/data/posts-repository";
import { PUBLISHED_WEBSITES_CACHE_TAG } from "@/data/websites-repository";
import { ensureOwnedCreator } from "@/features/creators/repository";
import {
  normalizeCreatorUsername,
  validateCreatorUsername,
} from "@/features/creators/validation";
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

import {
  ProfileMutationError,
  PUBLIC_CREATOR_PROFILES_CACHE_TAG,
  updateOwnedCreatorAvatar,
  updateOwnedCreatorProfile,
} from "./repository";
import type { ProfileEditInput, ProfileEditResult } from "./types";
import { requestAccountDeletion } from "./account-lifecycle";
import { profileAccounts } from "@/db/schema";
import { requireDatabase } from "@/db/client";
import { eq } from "drizzle-orm";

const profileEditSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters.").optional(),
  username: z.string().trim().optional(),
  websiteUrl: z.string().trim().nullable().optional(),
});

const avatarRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sourceContentType: z.enum(["image/jpeg", "image/png"]),
  contentType: z.literal("image/webp"),
  size: z.number().int().positive().max(MAX_IMAGE_UPLOAD_BYTES),
});

const avatarCompletionSchema = avatarRequestSchema.extend({
  storageKey: z.string().trim().min(1).max(1024),
});

function normalizeWebsiteUrl(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function refreshProfileCaches() {
  updateTag(PUBLIC_CREATOR_PROFILES_CACHE_TAG);
  updateTag(PUBLISHED_POSTS_CACHE_TAG);
  updateTag(PUBLISHED_LOGOS_CACHE_TAG);
  updateTag(PUBLISHED_WEBSITES_CACHE_TAG);
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
  const normalized: ProfileEditInput = { ...parsed.data };
  if (parsed.data.username !== undefined) {
    const username = normalizeCreatorUsername(parsed.data.username);
    const validation = validateCreatorUsername(username);
    if (!validation.ok) return { ok: false, field: "username", message: validation.message };
    normalized.username = username;
  }
  if (parsed.data.websiteUrl !== undefined) {
    const websiteUrl = normalizeWebsiteUrl(parsed.data.websiteUrl);
    if (parsed.data.websiteUrl && !websiteUrl) {
      return {
        ok: false,
        field: "websiteUrl",
        message: "Enter a valid http or https website URL.",
      };
    }
    normalized.websiteUrl = websiteUrl;
  }

  try {
    await ensureOwnedCreator(userId);
    await updateOwnedCreatorProfile(userId, normalized);
    refreshProfileCaches();
    return { ok: true };
  } catch (error) {
    if (error instanceof ProfileMutationError) {
      return { ok: false, field: error.field, message: error.message };
    }
    console.error("Profile update failed", error);
    return { ok: false, field: "form", message: "Your profile could not be saved. Try again." };
  }
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
    await ensureOwnedCreator(userId);
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
  try {
    await verifyR2Upload({
      kind: "creator-avatar",
      storageKey: parsed.data.storageKey,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
    });
    const updated = await updateOwnedCreatorAvatar(userId, {
      storageKey: parsed.data.storageKey,
      url: getR2PublicUrl(parsed.data.storageKey),
    });
    if (updated.previousAsset) {
      await deleteManagedMediaAssetsSafely([updated.previousAsset]);
    }
    refreshProfileCaches();
    return { ok: true as const, avatarUrl: updated.profile.avatarUrl };
  } catch (error) {
    console.error("Profile photo update failed", error);
    return { ok: false as const, message: "The photo could not be saved. Try again." };
  }
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
