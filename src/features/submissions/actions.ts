"use server";

import { auth } from "@clerk/nextjs/server";
import { ensureOwnedCreator } from "@/features/creators/repository";
import { createSubmissionForOwner, readOwnSubmissionQuota } from "./repository";
import type { CreateSubmissionInput, QuotaSnapshot, SubmissionReceipt, SubmissionResult } from "./types";
import { validateCreateSubmissionInput } from "./validation";
import { withdrawSubmissionForOwner } from "./cleanup";
import { z } from "zod";

export async function createOwnSubmission(input: CreateSubmissionInput): Promise<SubmissionResult<SubmissionReceipt>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, code: "unauthenticated", message: "Sign in to submit your work." };
  const validated = validateCreateSubmissionInput(input);
  if (!validated.ok) return validated;
  try {
    await ensureOwnedCreator(userId);
    return await createSubmissionForOwner(userId, validated.value);
  } catch (error) {
    console.error("Submission creation failed", error);
    return { ok: false, code: "unavailable", message: "The submission could not be saved. Retry with the same request." };
  }
}

export async function getOwnSubmissionQuota(): Promise<QuotaSnapshot> {
  const { userId } = await auth();
  if (!userId) return { submittedLast24Hours: 0, inReview: 0, activeUploads: 0, nextDailySlotAt: null };
  return readOwnSubmissionQuota(userId);
}

export async function withdrawOwnSubmission(id: string): Promise<SubmissionResult<null>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, code: "unauthenticated", message: "Sign in to withdraw your submission." };
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, code: "invalid_input", message: "That submission is unavailable." };
  }
  try {
    return await withdrawSubmissionForOwner(userId, id);
  } catch (error) {
    console.error("Submission withdrawal failed", error);
    return { ok: false, code: "unavailable", message: "The submission could not be withdrawn. Try again." };
  }
}
