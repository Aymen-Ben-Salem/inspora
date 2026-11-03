import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { SponsorContact } from "./types";

export async function verifiedCheckoutEmail(owner: string, contact?: SponsorContact) {
  const user = await (await clerkClient()).users.getUser(owner);
  const primary = user.primaryEmailAddress;
  if (!primary?.emailAddress || primary.verification?.status !== "verified")
    throw new Error("Verify your primary email before checkout.");
  if (contact && contact.email.trim().toLowerCase() !== primary.emailAddress.trim().toLowerCase())
    throw new Error("Use your verified account email for campaign access and receipts.");
  return primary.emailAddress;
}
