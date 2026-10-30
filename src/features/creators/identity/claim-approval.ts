import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { adminAuditLogs, creatorClaims, creators, creatorUsernameAliases, logos, posts, profileAccounts, submissions, websites } from "@/db/schema";
import { withWriteTransaction, type WriteTx } from "@/db/write-client";
import { isMediaStorageProvider, type ManagedMediaAsset } from "@/storage/types";
import type { ClaimResult } from "../types";
import { setCurrentUsernameAlias } from "./username-aliases";
import { decideCreatorOwnershipClaimEligibility } from "./claim-policy";
import { claimReviewVersion, profileValuesForApprovedClaimMerge } from "./claim-review";
import { normalizedClaimXUrl, visibleClaimTarget } from "./claim-requests";
import type { verifiedXIdentityForUser } from "./external-identity";

// Internal merge transaction; claimCreatorWithX establishes fresh X evidence and locks the target.
export async function approveCreatorOwnershipClaim(
  claimId: string,
  actorId: string,
  reviewReason: string | null,
  options: { identity: Awaited<ReturnType<typeof verifiedXIdentityForUser>>; version?: string; automatic?: boolean; verifiedTargetAccountId?: string },
  transaction?: WriteTx,
) {
  let identityChanged = false;
  const displacedAvatarAssets: ManagedMediaAsset[] = [];
  const approve = async (tx: WriteTx): Promise<ClaimResult> => {
    const [claimSnapshot] = await tx
      .select()
      .from(creatorClaims)
      .where(eq(creatorClaims.id, claimId))
      .limit(1);
    if (!claimSnapshot) return { status: "conflict" };

    const [account] = await tx
      .select({ status: profileAccounts.status })
      .from(profileAccounts)
      .where(eq(profileAccounts.userId, claimSnapshot.requesterUserId))
      .for("update");
    const [claim] = await tx
      .select()
      .from(creatorClaims)
      .where(eq(creatorClaims.id, claimId))
      .for("update");
    if (!claim || claim.requesterUserId !== claimSnapshot.requesterUserId) return { status: "conflict" };
    if (claim.status === "approved") {
      return { status: "claimed", creatorId: claim.targetCreatorId };
    }
    if (claim.status !== "pending") return { status: "conflict", message: "This request is no longer pending. Reload to see its status." };

    const now = new Date();
    if (!account || account.status !== "active") return { status: "conflict" };
    const [provisional] = await tx
      .select()
      .from(creators)
      .where(eq(creators.ownerUserId, claim.requesterUserId))
      .limit(1);
    if (!provisional) return { status: "conflict" };

    const creatorIds = [...new Set([provisional.id, claim.targetCreatorId])].sort();
    const lockedCreators = await tx
      .select()
      .from(creators)
      .where(inArray(creators.id, creatorIds))
      .orderBy(asc(creators.id))
      .for("update");
    const lockedProvisional = lockedCreators.find((row) => row.id === provisional.id);
    const target = lockedCreators.find((row) => row.id === claim.targetCreatorId);
    if (!lockedProvisional || lockedProvisional.trashedAt || !target || lockedProvisional.ownerUserId !== claim.requesterUserId) {
      return { status: "conflict" };
    }
    if (!visibleClaimTarget(target)) return { status: "conflict", message: "This creator is unavailable in this environment." };

    if (options.version && options.version !== claimReviewVersion(claim, target, lockedProvisional)) return { status: "conflict", message: "This claim or a creator profile changed. Reload the merge preview before reviewing." };
    const attention = async (message: string): Promise<ClaimResult> => {
      await tx.update(creatorClaims).set({ attentionReason: message, dismissedAt: null, updatedAt: now }).where(eq(creatorClaims.id, claim.id));
      return { status: "conflict", message };
    };
    if (claim.method === "ownership_report") return { status: "conflict", message: "Ownership reports cannot transfer a creator. Record a resolution after investigating." };
    const identity = options.identity;
    if (options.automatic && (claim.method !== "x" || actorId !== claim.requesterUserId ||
      !identity || (target.xProfileAccountId ?? options.verifiedTargetAccountId) !== identity.providerAccountId)) {
      return { status: "conflict", message: "X could not verify this creator profile. Please retry or report the attribution." };
    }
    if (claim.method === "x" && (!identity || identity.providerAccountId !== claim.verifiedXProviderId)) return attention("Reconnect the X account used for this claim, or withdraw and submit a new request with current evidence.");
    if (!options.automatic && claim.method === "x" && !target.xProviderId && normalizedClaimXUrl(target.xProfileUrl) !== `https://x.com/${claim.verifiedXUsername}`) return attention("The creator's X link changed after this request. Withdraw and submit a new claim.");
    if (claim.method === "manual" && (!reviewReason || reviewReason.length < 20)) return { status: "conflict", message: "Describe the ownership evidence you verified in at least 20 characters." };
    if (claim.method === "manual" && target.xProviderId) return attention("This creator has a verified X identity. Use X verification to claim it.");
    if (lockedProvisional.xProviderId && (!identity || identity.providerAccountId !== lockedProvisional.xProviderId)) return attention("Your creator's saved X identity differs from your current connection. Reconnect it or update your X identity in Edit Profile, then ask for review again.");
    if (options.automatic && lockedProvisional.xProfileAccountId && lockedProvisional.xProfileAccountId !== identity?.providerAccountId) return attention("Your current creator has a different X association. Report the attribution problem before combining these profiles.");
    const providerId = claim.method === "x" ? identity!.providerAccountId : lockedProvisional.xProviderId;
    const xProfileUrl = providerId ? identity!.profileUrl : target.xProfileUrl;

    const ownershipDecision = decideCreatorOwnershipClaimEligibility({
      requesterUserId: claim.requesterUserId,
      currentOwnerUserId: target.ownerUserId,
      currentXProviderAccountId: target.xProviderId,
      verifiedXProviderAccountId: providerId,
    });
    if (ownershipDecision === "conflict") return { status: "conflict" };

    const [otherIdentity] = providerId ? await tx
      .select({ id: creators.id, ownerUserId: creators.ownerUserId })
      .from(creators)
      .where(
        and(
          eq(creators.xProviderId, providerId),
          sql`${creators.id} <> ${target.id}`,
        ),
      )
      .limit(1) : [];
    if (otherIdentity && otherIdentity.id !== lockedProvisional.id) {
      return { status: "conflict" };
    }

    if (lockedProvisional.id !== target.id) {
      const retained = profileValuesForApprovedClaimMerge(target, lockedProvisional);
      // Preserve existing addresses until a canonical username can survive the merge.
      if (!retained.username) return { status: "conflict" };
      for (const creator of [target, lockedProvisional]) {
        if (isMediaStorageProvider(creator.avatarStorageProvider) && creator.avatarStorageKey &&
          !(creator.avatarStorageProvider === retained.avatarStorageProvider && creator.avatarStorageKey === retained.avatarStorageKey) &&
          !displacedAvatarAssets.some((asset) => asset.storageProvider === creator.avatarStorageProvider && asset.storageKey === creator.avatarStorageKey)) {
          displacedAvatarAssets.push({ storageProvider: creator.avatarStorageProvider, storageKey: creator.avatarStorageKey, type: "image" });
        }
      }
      // Demote both current aliases before moving reservations to satisfy the
      // one-current-alias constraint throughout the transfer.
      await tx.update(creatorUsernameAliases).set({ isCurrent: false })
        .where(inArray(creatorUsernameAliases.creatorId, creatorIds));
      await tx.update(creatorUsernameAliases).set({ creatorId: target.id })
        .where(eq(creatorUsernameAliases.creatorId, lockedProvisional.id));
      await setCurrentUsernameAlias(tx, target.id, retained.username);
      await tx
        .update(posts)
        .set({ creatorId: target.id })
        .where(eq(posts.creatorId, lockedProvisional.id));
      await tx
        .update(logos)
        .set({ creatorId: target.id })
        .where(eq(logos.creatorId, lockedProvisional.id));
      await tx
        .update(websites)
        .set({ creatorId: target.id })
        .where(eq(websites.creatorId, lockedProvisional.id));
      await tx
        .update(submissions)
        .set({ creatorId: target.id, updatedAt: now })
        .where(eq(submissions.creatorId, lockedProvisional.id));
      await tx
        .update(creators)
        .set({
          ownerUserId: null,
          xProviderId: null,
          xProfileAccountId: null,
          username: null,
          updatedAt: now,
        })
        .where(eq(creators.id, lockedProvisional.id));
      await tx
        .update(creators)
        .set({
          ...retained,
          ownerUserId: claim.requesterUserId,
          xProviderId: providerId,
          xProfileAccountId: providerId,
          xProfileUrl,
          updatedAt: now,
        })
        .where(eq(creators.id, target.id));
      await tx.update(creatorClaims).set({ targetCreatorId: target.id }).where(eq(creatorClaims.targetCreatorId, lockedProvisional.id));
      await tx.delete(creators).where(eq(creators.id, lockedProvisional.id));
    } else {
      await tx
        .update(creators)
        .set({
          ownerUserId: claim.requesterUserId,
          xProviderId: providerId,
          xProfileAccountId: providerId,
          xProfileUrl,
          updatedAt: now,
        })
        .where(eq(creators.id, target.id));
    }

    await tx
      .update(creatorClaims)
      .set({
        status: "approved",
        reviewedBy: options.automatic ? null : actorId,
        reviewReason,
        attentionReason: null,
        dismissedAt: null,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(creatorClaims.id, claim.id));
    await tx.insert(adminAuditLogs).values({
      actorId,
      action: options.automatic ? "creator_claim.claimed_with_x" : "creator_claim.approved",
      resourceType: "creator_claim",
      resourceId: claim.id,
      details: {
        targetCreatorId: target.id,
        requesterUserId: claim.requesterUserId,
      },
    });
    identityChanged = true;
    return { status: "claimed", creatorId: target.id };
  };
  const result = transaction ? await approve(transaction) : await withWriteTransaction(approve);
  return { result, identityChanged, displacedAvatarAssets };
}
