import "server-only";
import { and, eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/auth/require-admin";
import { adminAuditLogs, creatorClaims, creators, profileAccounts } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { PUBLISHED_LOGOS_CACHE_TAG } from "@/data/logos-repository";
import { PUBLISHED_POSTS_CACHE_TAG } from "@/data/posts-repository";
import { PUBLISHED_WEBSITES_CACHE_TAG } from "@/data/websites-repository";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";
import type { ManagedMediaAsset } from "@/storage/types";
import type { ClaimResult } from "../types";
import type { CreatorOwnerPrincipal } from "./index";
import { claimReviewVersion } from "./claim-review";
import { CreatorClaimError, requestCreatorClaim } from "./claim-requests";

export function refreshCommittedClaim(identityChanged = false) {
  if (identityChanged) {
    for (const tag of [PUBLIC_CREATOR_PROFILES_CACHE_TAG, PUBLISHED_POSTS_CACHE_TAG, PUBLISHED_LOGOS_CACHE_TAG, PUBLISHED_WEBSITES_CACHE_TAG]) revalidateTag(tag, { expire: 0 });
    for (const path of ["/", "/admin/posts", "/admin/logos", "/admin/websites", "/admin/submissions"]) revalidatePath(path);
    revalidatePath("/creators/[username]", "page");
  }
  for (const path of ["/profile", "/profile/claims", "/admin/creators"]) revalidatePath(path);
  revalidatePath("/admin/creators/claims/[id]", "page");
  revalidatePath("/creators/[username]/claim", "page");
}

// Discovery alone must never create an ownership request.
export async function requestCreatorOwnershipClaimFromVerifiedX(principal: CreatorOwnerPrincipal, targetCreatorId?: string): Promise<ClaimResult> {
  if (!principal.userId?.trim()) throw new CreatorClaimError("Sign in to manage a creator claim.");
  if (!targetCreatorId) return { status: "no_match" };
  return requestCreatorClaim(principal, { targetCreatorId, method: "x", confirmed: true });
}

export async function reviewCreatorOwnershipClaim(claimId: string, decision: "approve" | "reject" | "resolve", reason?: string, version?: string): Promise<ClaimResult & { displacedAvatarAssets?: ManagedMediaAsset[] }> {
  const { userId: actorId } = await requireAdmin();
  const reviewReason = reason?.trim() || null;
  if (decision !== "approve" && decision !== "reject" && decision !== "resolve") throw new CreatorClaimError("Choose a valid claim decision.");
  if (decision !== "approve" && !reviewReason) throw new CreatorClaimError("Add a reason before rejecting or resolving this request.");
  try {
    if (decision === "approve") {
      throw new CreatorClaimError("Creators now claim directly with their matching X account. Admins can resolve attribution reports but cannot approve ownership claims.");
    }
    const result = await withWriteTransaction<ClaimResult>(async (tx) => {
      const [snapshot] = await tx.select().from(creatorClaims).where(eq(creatorClaims.id, claimId)).limit(1);
      if (!snapshot) return { status: "conflict", message: "This request is unavailable." };
      await tx.select().from(profileAccounts).where(eq(profileAccounts.userId, snapshot.requesterUserId)).for("update");
      const [claim] = await tx.select().from(creatorClaims).where(eq(creatorClaims.id, claimId)).for("update");
      if (!claim || claim.status !== "pending") return { status: "conflict", message: "This request is no longer pending. Reload to see its status." };
      const [target] = await tx.select().from(creators).where(eq(creators.id, claim.targetCreatorId)).limit(1);
      const [source] = await tx.select().from(creators).where(eq(creators.ownerUserId, claim.requesterUserId)).limit(1);
      if (!target || (version && version !== claimReviewVersion(claim, target, source))) return { status: "conflict", message: "This request changed. Reload before reviewing." };
      if (decision === "resolve" && claim.method !== "ownership_report") return { status: "conflict", message: "Only ownership reports can be marked resolved." };
      const status = decision === "resolve" ? "resolved" : "rejected";
      await tx.update(creatorClaims).set({ status, reviewedBy: actorId, reviewReason, attentionReason: null, dismissedAt: null, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(creatorClaims.id, claim.id), eq(creatorClaims.status, "pending")));
      await tx.insert(adminAuditLogs).values({ actorId, action: "creator_claim." + status, resourceType: "creator_claim", resourceId: claim.id, details: { targetCreatorId: claim.targetCreatorId, reason: reviewReason } });
      return { status };
    });
    refreshCommittedClaim();
    return result;
  } catch (error) {
    let cause: unknown = error;
    while (cause && typeof cause === "object") {
      const item = cause as { code?: string; cause?: unknown };
      if (["23505", "40001", "40P01"].includes(item.code ?? "")) return { status: "conflict", message: "The creator changed during review. Reload and try again." };
      cause = item.cause;
    }
    throw error;
  }
}
