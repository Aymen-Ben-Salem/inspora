import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkConfigured } from "@/auth/config";
import { sponsorshipEnabled, sponsorshipWritesEnabled } from "./config";
import { accountCapabilities, sponsorAccountCanWrite } from "./capabilities";
import {
  bindSponsorIdentity,
  readIdentityCapabilities,
  readSponsorAccountForOwner,
} from "./repository";
import { hasSponsorIntent } from "./onboarding";
import type { AccountCapabilities, SponsorActor } from "./types";

export async function verifiedSponsorOwner(
  mode: "read" | "write" = "read",
): Promise<string | null> {
  if (!isClerkConfigured() || !sponsorshipEnabled()) return null;
  const { userId } = await auth();
  if (!userId) return null;
  const user = await (await clerkClient()).users.getUser(userId);
  if (user.primaryEmailAddress?.verification?.status !== "verified")
    return null;
  const identity = await readIdentityCapabilities(userId);
  const capabilities = accountCapabilities(identity);
  return capabilities.sponsor &&
    (mode === "read" || sponsorAccountCanWrite(identity.account))
    ? userId
    : null;
}
export async function readAccountCapabilities(
  userId: string,
): Promise<AccountCapabilities> {
  let state;
  try {
    state = await readIdentityCapabilities(userId);
  } catch (error) {
    let current: unknown = error;
    while (current instanceof Error) {
      if (
        "code" in current &&
        current.code === "42P01" &&
        !sponsorshipEnabled()
      )
        return { viewer: true, sponsor: false, sponsorReadonly: false };
      current = (current as { cause?: unknown }).cause;
    }
    throw error;
  }
  const intent = await hasSponsorIntent(userId);
  if (intent && !state.identity) {
    // Bind the signed intent before any creator bootstrap. Authentication is still
    // independently required; this cookie never grants upload/payment access.
    await bindSponsorIdentity(userId);
    state = { ...state, identity: "allowed" };
  }
  const capabilities = accountCapabilities(state);
  // Ordinary new-member bootstrap is retained unless sponsor intent/capability exists.
  return {
    ...capabilities,
    viewer:
      capabilities.viewer ||
      (!state.identity && !state.account && !intent && !state.profile),
  };
}
export async function requireSponsorActor(
  mode: "read" | "write",
): Promise<SponsorActor> {
  if (mode === "write" && !sponsorshipWritesEnabled())
    throw new Error("Sponsor changes are currently unavailable.");
  const userId = await verifiedSponsorOwner();
  if (!userId) throw new Error("Verify sponsor access.");
  const actor = await readSponsorAccountForOwner(userId);
  if (
    !actor ||
    ["revoked", "deleting"].includes(actor.state) ||
    (mode === "write" && !sponsorAccountCanWrite(actor.state))
  )
    throw new Error("Sponsor account access is unavailable.");
  return actor;
}
