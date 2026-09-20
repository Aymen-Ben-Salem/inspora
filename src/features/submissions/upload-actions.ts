"use server";

import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { ensureOwnedCreator } from "@/features/creators/repository";

import {
  createPrivateStagingKey,
  deletePrivateUpload,
  freezePrivateUpload,
  PrivateSubmissionUploadValidationError,
  signPrivateUpload,
} from "@/storage/private-submissions";
import { getMediaUploadLimit, isAcceptedSubmissionUpload } from "../media/upload-policy";
import { discardUploadReservation, findOwnUpload, recordCompletedUpload, reserveOwnUpload } from "./repository";
import type { BeginUploadInput, PrivateUploadTicket, SubmissionResult } from "./types";

const beginSchema = z.object({
  requestId: z.uuid(), kind: z.enum(["design", "logo"]),
  contentType: z.string().trim().min(1).max(100), sizeBytes: z.number().int().positive(),
});
const uploadIdSchema = z.uuid();
const UPLOAD_RESERVATION_MILLISECONDS = 24 * 60 * 60 * 1000;

function unauthenticated<T>(): SubmissionResult<T> {
  return { ok: false, code: "unauthenticated", message: "Sign in to upload a submission." };
}

export async function beginOwnUpload(input: BeginUploadInput): Promise<SubmissionResult<PrivateUploadTicket>> {
  const { userId } = await auth();
  if (!userId) return unauthenticated();
  const parsed = beginSchema.safeParse(input);
  if (!parsed.success || !isAcceptedSubmissionUpload(parsed.data.kind, parsed.data.contentType) || parsed.data.sizeBytes > getMediaUploadLimit(parsed.data.contentType)) {
    return {
      ok: false, code: "invalid_input",
      message: parsed.success && parsed.data.kind === "logo"
        ? "Logo uploads must be static images up to 10 MB."
        : "Design uploads must be supported images up to 10 MB or MP4/WebM video up to 50 MB.",
    };
  }
  const uploadId = randomUUID();
  const stagingKey = createPrivateStagingKey({ ownerUserId: userId, uploadId, contentType: parsed.data.contentType });
  try {
    await ensureOwnedCreator(userId);
    const reserved = await reserveOwnUpload(userId, {
      id: uploadId, requestId: parsed.data.requestId, kind: parsed.data.kind, stagingKey,
      contentType: parsed.data.contentType, sizeBytes: parsed.data.sizeBytes,
      expiresAt: new Date(Date.now() + UPLOAD_RESERVATION_MILLISECONDS),
    });
    if (!reserved.ok) return reserved;
    const signed = await signPrivateUpload({
      ownerUserId: userId, uploadId: reserved.value.id,
      stagingKey: reserved.value.stagingKey,
      contentType: reserved.value.contentType, sizeBytes: reserved.value.sizeBytes,
    });
    return { ok: true, value: {
      uploadId: reserved.value.id, ...signed, expiresAt: reserved.value.expiresAt.toISOString(),
    } };
  } catch (error) {
    console.error("Private submission upload signing failed", error);
    return { ok: false, code: "unavailable", message: "The upload could not be prepared. Try again." };
  }
}

export async function completeOwnUpload(uploadId: string): Promise<SubmissionResult<{ uploadId: string }>> {
  const { userId } = await auth();
  if (!userId) return unauthenticated();
  if (!uploadIdSchema.safeParse(uploadId).success) return { ok: false, code: "invalid_input", message: "The upload ID is invalid." };
  try {
    const upload = await findOwnUpload(userId, uploadId);
    if (!upload) return { ok: false, code: "forbidden", message: "That upload is unavailable." };
    if (upload.state === "completed") return { ok: true, value: { uploadId } };
    if (upload.expiresAt <= new Date()) return { ok: false, code: "upload_expired", message: "That upload has expired.", retryAt: upload.expiresAt.toISOString() };
    const frozen = await freezePrivateUpload({
      ownerUserId: userId, uploadId, stagingKey: upload.stagingKey,
      kind: upload.kind,
      contentType: upload.contentType, sizeBytes: upload.sizeBytes,
    });
    const recorded = await recordCompletedUpload(userId, uploadId, { ...frozen, derivativeKeys: [] });
    return recorded.ok ? { ok: true, value: { uploadId } } : recorded;
  } catch (error) {
    if (error instanceof PrivateSubmissionUploadValidationError) {
      return { ok: false, code: "invalid_input", message: "The upload could not be verified." };
    }
    console.error("Private submission upload verification failed", error);
    return { ok: false, code: "unavailable", message: "The upload could not be verified. Try again." };
  }
}

export async function discardOwnUpload(uploadId: string): Promise<SubmissionResult<null>> {
  const { userId } = await auth();
  if (!userId) return unauthenticated();
  if (!uploadIdSchema.safeParse(uploadId).success) return { ok: false, code: "invalid_input", message: "The upload ID is invalid." };
  try {
    const upload = await findOwnUpload(userId, uploadId);
    if (!upload) return { ok: false, code: "forbidden", message: "That upload is unavailable." };
    const discarded = await discardUploadReservation(userId, uploadId);
    if (!discarded.ok) return discarded;
    for (const key of [upload.stagingKey, upload.objectKey, ...upload.derivativeKeys]) {
      if (key) await deletePrivateUpload(key);
    }
    return { ok: true, value: null };
  } catch (error) {
    console.error("Private submission upload discard failed", error);
    return { ok: false, code: "unavailable", message: "The upload could not be discarded. Try again." };
  }
}
