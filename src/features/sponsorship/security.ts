import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/auth/config";
import {
  hasSponsorSecondFactor,
  type SponsorSecurityState,
} from "./security-state";

export async function readSponsorSecurity(): Promise<{
  state: SponsorSecurityState;
  userId: string | null;
}> {
  if (!isClerkConfigured()) return { state: "signed_out", userId: null };
  const { userId, sessionClaims } = await auth();
  if (!userId) return { state: "signed_out", userId: null };
  const user = await (await clerkClient()).users.getUser(userId);
  const state: SponsorSecurityState =
    user.primaryEmailAddress?.verification?.status !== "verified"
      ? "email_required"
      : !user.totpEnabled
        ? "setup_required"
        : !hasSponsorSecondFactor(sessionClaims?.fva)
          ? "verification_required"
          : "ready";
  return { state, userId };
}
