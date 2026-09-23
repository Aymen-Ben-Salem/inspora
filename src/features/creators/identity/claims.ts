import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import type { ManagedMediaAsset } from "@/storage/types";
import { requireAdmin } from "@/auth/require-admin";
import { adminAuditLogs, creatorClaims, creators, profileAccounts } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { PUBLISHED_LOGOS_CACHE_TAG } from "@/data/logos-repository";
import { PUBLISHED_POSTS_CACHE_TAG } from "@/data/posts-repository";
import { PUBLISHED_WEBSITES_CACHE_TAG } from "@/data/websites-repository";
import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";
import type { ClaimResult } from "../types";
import { ensureCreatorForOwner, type CreatorOwnerPrincipal } from "./index";
import { verifiedXIdentityForUser } from "./external-identity";
import { decideCreatorOwnershipClaimEligibility, resultFromRecordedCreatorOwnershipClaim } from "./claim-policy";
import { approveCreatorOwnershipClaim } from "./claim-approval";

function isClaimWriteConflict(error: unknown): boolean {
  let cause: unknown = error;
  while (cause && typeof cause === "object") {
    const databaseError = cause as { code?: string; cause?: unknown };
    if (["23505", "40001", "40P01"].includes(databaseError.code ?? "")) return true;
    cause = databaseError.cause;
  }
  return false;
}
// Reviews must invalidate before the action returns so its response includes fresh UI.
function refreshCommittedClaim(identityChanged: boolean, reviewChanged = false) {
  if (!identityChanged && !reviewChanged) return;
  if (identityChanged) {
    for (const tag of [PUBLIC_CREATOR_PROFILES_CACHE_TAG, PUBLISHED_POSTS_CACHE_TAG,
      PUBLISHED_LOGOS_CACHE_TAG, PUBLISHED_WEBSITES_CACHE_TAG]) {
      revalidateTag(tag, { expire: 0 });
    }
    for (const path of ["/", "/profile", "/admin/posts", "/admin/logos", "/admin/websites"]) revalidatePath(path);
    revalidatePath("/creators/[username]", "page");
  }
  revalidatePath("/admin/creators");
}

export async function requestCreatorOwnershipClaimFromVerifiedX(
  principal: CreatorOwnerPrincipal,
): Promise<ClaimResult> {
  const ownedProfile = await ensureCreatorForOwner(principal);
  const userId = principal.userId;
  const identity = await verifiedXIdentityForUser(userId);
  if (!identity) return { status: "no_match" };

  let identityChanged = false;
  let claimCreated = false;
  let result: ClaimResult;
  try {
    result = await withWriteTransaction<ClaimResult>(async (tx) => {
      const [account] = await tx.select({ status: profileAccounts.status }).from(profileAccounts)
        .where(eq(profileAccounts.userId, userId)).for("update");
      if (!account || account.status !== "active") return { status: "conflict" };

      const previousClaims = await tx.select().from(creatorClaims).where(and(
        eq(creatorClaims.requesterUserId, userId),
        eq(creatorClaims.verifiedXProviderId, identity.providerAccountId),
      )).orderBy(asc(creatorClaims.createdAt)).for("update");
      const previous = previousClaims.at(-1);
      if (previous) {
        const replay = resultFromRecordedCreatorOwnershipClaim(previous);
        if (replay) return replay;
      }

      const providerMatch = () => tx.select().from(creators)
        .where(eq(creators.xProviderId, identity.providerAccountId)).limit(1);
      const urlMatches = () => tx.select().from(creators).where(and(
        ne(creators.id, ownedProfile.id),
        sql`lower(${creators.xProfileUrl}) = ${identity.profileUrl}`,
      )).orderBy(asc(creators.id));
      const [establishedSnapshot] = await providerMatch();
      const matchingSnapshots = establishedSnapshot ? [] : await urlMatches();
      const creatorIds = [...new Set([ownedProfile.id, ...matchingSnapshots.map((row) => row.id),
        ...(establishedSnapshot ? [establishedSnapshot.id] : [])])].sort();
      const lockedCreators = await tx.select().from(creators).where(inArray(creators.id, creatorIds))
        .orderBy(asc(creators.id)).for("update");
      const ownedCreator = lockedCreators.find((row) => row.id === ownedProfile.id);
      if (!ownedCreator || ownedCreator.ownerUserId !== userId ||
        (ownedCreator.xProviderId && ownedCreator.xProviderId !== identity.providerAccountId)) {
        return { status: "conflict" };
      }
      const [established] = await providerMatch();
      if (established?.id !== establishedSnapshot?.id) return { status: "conflict" };
      if (established) {
        if (established.id !== ownedCreator.id || established.ownerUserId !== userId) return { status: "conflict" };
        if (established.xProfileUrl !== identity.profileUrl) {
          await tx.update(creators).set({ xProfileUrl: identity.profileUrl, updatedAt: new Date() })
            .where(eq(creators.id, established.id));
          identityChanged = true;
        }
        return { status: "already_owned", creatorId: established.id };
      }

      const otherMatchingCreators = await urlMatches();
      // Discovery may have changed while locks were acquired; never lock extra IDs out of order.
      if (otherMatchingCreators.length > 1 || otherMatchingCreators.some((row) => !creatorIds.includes(row.id))) {
        return { status: "conflict" };
      }
      const claimTargetCreator = otherMatchingCreators[0];
      if (!claimTargetCreator) {
        await tx.update(creators).set({ xProfileUrl: identity.profileUrl,
          xProviderId: identity.providerAccountId, updatedAt: new Date() }).where(eq(creators.id, ownedCreator.id));
        identityChanged = true;
        return { status: "no_match" };
      }
      const decision = decideCreatorOwnershipClaimEligibility({ requesterUserId: userId,
        currentOwnerUserId: claimTargetCreator.ownerUserId,
        currentXProviderAccountId: claimTargetCreator.xProviderId,
        verifiedXProviderAccountId: identity.providerAccountId });
      if (decision === "conflict") return { status: "conflict" };
      if (decision === "already_owned") return { status: "already_owned", creatorId: claimTargetCreator.id };

      const provisionalCreator = ownedCreator;
      if (provisionalCreator.xProfileUrl !== identity.profileUrl) {
        await tx.update(creators).set({ xProfileUrl: identity.profileUrl, updatedAt: new Date() })
          .where(eq(creators.id, provisionalCreator.id));
        identityChanged = true;
      }
      const id = randomUUID();
      await tx.insert(creatorClaims).values({ id, requesterUserId: userId,
        targetCreatorId: claimTargetCreator.id, verifiedXProviderId: identity.providerAccountId,
        verifiedXUsername: identity.username });
      claimCreated = true;
      return { status: "pending", claimId: id };
    });
  } catch (error) {
    // Concurrent provider association and lost serialization races roll back fully.
    if (isClaimWriteConflict(error)) return { status: "conflict" };
    throw error;
  }
  // Requests also run during rendering; defer their committed changes until after it.
  if (identityChanged || claimCreated) {
    after(() => refreshCommittedClaim(identityChanged, claimCreated));
  }
  return result;
}

export async function reviewCreatorOwnershipClaim(
  claimId: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<ClaimResult & { displacedAvatarAssets?: ManagedMediaAsset[] }> {
  const { userId: actorId } = await requireAdmin();
  const reviewReason = reason?.trim() || null;
  if (decision === "reject" && !reviewReason) throw new Error("Add a reason before rejecting this claim.");
  if (decision !== "approve" && decision !== "reject") throw new Error("Choose a valid claim decision.");
  if (decision === "approve") {
    let outcome: Awaited<ReturnType<typeof approveCreatorOwnershipClaim>>;
    try {
      outcome = await approveCreatorOwnershipClaim(claimId, actorId, reviewReason);
    } catch (error) {
      // Translate races only after the transaction has rolled back.
      if (isClaimWriteConflict(error)) return { status: "conflict" };
      throw error;
    }
    refreshCommittedClaim(outcome.identityChanged);
    return outcome.displacedAvatarAssets.length
      ? { ...outcome.result, displacedAvatarAssets: outcome.displacedAvatarAssets }
      : outcome.result;
  }
  let reviewChanged = false;
  const result = await withWriteTransaction<ClaimResult>(async (tx) => {
    const [snapshot] = await tx.select().from(creatorClaims).where(eq(creatorClaims.id, claimId)).limit(1);
    if (!snapshot) return { status: "conflict" };
    // Rejection remains permitted for inactive accounts, but serializes with their lifecycle.
    await tx.select({ status: profileAccounts.status }).from(profileAccounts)
      .where(eq(profileAccounts.userId, snapshot.requesterUserId)).for("update");
    const [claim] = await tx.select().from(creatorClaims).where(eq(creatorClaims.id, claimId)).for("update");
    if (!claim) return { status: "conflict" };
    if (claim.status !== "pending") return resultFromRecordedCreatorOwnershipClaim(claim) ?? { status: "conflict" };
    const now = new Date();
    await tx.update(creatorClaims).set({ status: "rejected", reviewedBy: actorId,
      reviewReason, reviewedAt: now, updatedAt: now }).where(eq(creatorClaims.id, claim.id));
    await tx.insert(adminAuditLogs).values({ actorId, action: "creator_claim.rejected",
      resourceType: "creator_claim", resourceId: claim.id,
      details: { targetCreatorId: claim.targetCreatorId, reason: reviewReason } });
    reviewChanged = true;
    return { status: "rejected" };
  });
  refreshCommittedClaim(false, reviewChanged);
  return result;
}
