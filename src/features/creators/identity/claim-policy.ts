import "server-only";
import type { ClaimResult } from "../types";

export function decideCreatorOwnershipClaimEligibility(input: {
  requesterUserId: string;
  currentOwnerUserId: string | null;
  currentXProviderAccountId: string | null;
  verifiedXProviderAccountId: string;
}): "pending" | "already_owned" | "conflict" {
  if (
    input.currentOwnerUserId === input.requesterUserId &&
    input.currentXProviderAccountId === input.verifiedXProviderAccountId
  ) {
    return "already_owned";
  }
  if (
    (input.currentOwnerUserId &&
      input.currentOwnerUserId !== input.requesterUserId) ||
    (input.currentXProviderAccountId &&
      input.currentXProviderAccountId !== input.verifiedXProviderAccountId)
  ) {
    return "conflict";
  }
  return "pending";
}

export function resultFromRecordedCreatorOwnershipClaim(claim: {
  id: string;
  status: string;
  targetCreatorId: string;
}): ClaimResult | null {
  if (claim.status === "pending") {
    return { status: "pending", claimId: claim.id };
  }
  if (claim.status === "approved") {
    return { status: "claimed", creatorId: claim.targetCreatorId };
  }
  if (claim.status === "rejected") return { status: "rejected" };
  return null;
}
