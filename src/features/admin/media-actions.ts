"use server";

import { z } from "zod";

import { requireAdmin } from "@/auth/require-admin";
import {
  createR2PresignedUpload,
  deleteR2StorageKeys,
  getR2PublicUrl,
  R2StorageConfigurationError,
  verifyR2Upload,
  isStorageKeyForKind,
} from "@/storage/r2";

import {
  ACCEPTED_MEDIA_MIME_TYPES,
  getMediaUploadLimit,
  isAcceptedUploadForKind,
  MAX_VIDEO_UPLOAD_BYTES,
  type MediaUploadKind,
  type MediaUploadCompletionResult,
  type MediaUploadSignatureResult,
  defaultAltText,
} from "./media-upload";

const uploadRequestSchema = z.object({
  kind: z.enum(["post-media", "creator-avatar"] satisfies MediaUploadKind[]),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(ACCEPTED_MEDIA_MIME_TYPES),
  size: z.number().int().positive().max(MAX_VIDEO_UPLOAD_BYTES),
});

export async function createMediaUploadSignatureAction(
  input: unknown,
): Promise<MediaUploadSignatureResult> {
  await requireAdmin();

  const parsed = uploadRequestSchema.safeParse(input);
  if (
    !parsed.success ||
    !isAcceptedUploadForKind(parsed.data.kind, parsed.data.contentType) ||
    parsed.data.size > getMediaUploadLimit(parsed.data.contentType)
  ) {
    return {
      ok: false,
      message:
        parsed.success && parsed.data.kind === "creator-avatar"
          ? "Creator avatars must be images up to 10 MB."
          : "Images and GIFs can be up to 10 MB; MP4 and WebM videos up to 50 MB.",
    };
  }

  try {
    return {
      ok: true,
      ...(await createR2PresignedUpload({
        kind: parsed.data.kind,
        contentType: parsed.data.contentType,
      })),
    };
  } catch (error) {
    if (error instanceof R2StorageConfigurationError) {
      return { ok: false, message: error.message };
    }

    console.error("Media upload signing failed", error);
    return { ok: false, message: "The upload could not be prepared. Try again." };
  }
}

const completionSchema = uploadRequestSchema.extend({
  storageKey: z.string().trim().min(1).max(1024),
  width: z.number().int().positive().max(12000),
  height: z.number().int().positive().max(12000),
});

export async function completeMediaUploadAction(
  input: unknown,
): Promise<MediaUploadCompletionResult> {
  await requireAdmin();
  const parsed = completionSchema.safeParse(input);
  if (
    !parsed.success ||
    !isAcceptedUploadForKind(parsed.data.kind, parsed.data.contentType) ||
    parsed.data.size > getMediaUploadLimit(parsed.data.contentType)
  ) {
    return { ok: false, message: "The uploaded file details are invalid." };
  }

  try {
    await verifyR2Upload(parsed.data);
    return {
      ok: true,
      media: {
        type: parsed.data.contentType.startsWith("video/") ? "video" : "image",
        url: getR2PublicUrl(parsed.data.storageKey),
        storageProvider: "r2",
        storageKey: parsed.data.storageKey,
        mimeType: parsed.data.contentType,
        sourceMimeType: parsed.data.contentType,
        sizeBytes: parsed.data.size,
        variants: [],
        alt: defaultAltText(parsed.data.fileName),
        width: parsed.data.width,
        height: parsed.data.height,
      },
    };
  } catch (error) {
    console.error("Media upload verification failed", error);
    return { ok: false, message: "The upload could not be verified. Try again." };
  }
}

const discardSchema = z.object({
  kind: z.enum(["post-media", "creator-avatar"] satisfies MediaUploadKind[]),
  storageKeys: z.array(z.string().trim().min(1).max(1024)).min(1).max(5),
});

export async function discardMediaUploadsAction(input: unknown) {
  await requireAdmin();
  const parsed = discardSchema.safeParse(input);
  if (
    !parsed.success ||
    parsed.data.storageKeys.some(
      (storageKey) => !isStorageKeyForKind(storageKey, parsed.data.kind),
    )
  ) {
    return;
  }

  await deleteR2StorageKeys(parsed.data.storageKeys);
}

export async function getMediaConverterConfigurationAction() {
  await requireAdmin();
  const baseUrl = getR2PublicUrl("system/ffmpeg/0.12.10");
  return {
    coreUrl: `${baseUrl}/ffmpeg-core.js`,
    wasmUrl: `${baseUrl}/ffmpeg-core.wasm`,
  };
}
