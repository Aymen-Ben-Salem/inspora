"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { dismissOwnProfileMessageForOwner } from "./messages-repository";
import type { SubmissionResult } from "../submissions/types";

export async function dismissOwnProfileMessage(
  messageId: string,
): Promise<SubmissionResult<null>> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, code: "unauthenticated", message: "Sign in to dismiss this message." };
  }
  if (!z.uuid().safeParse(messageId).success) {
    return { ok: false, code: "invalid_input", message: "That message is unavailable." };
  }
  try {
    return await dismissOwnProfileMessageForOwner(userId, messageId);
  } catch (error) {
    console.error("Profile message dismissal failed", error);
    return { ok: false, code: "unavailable", message: "The message could not be dismissed. Try again." };
  }
}
