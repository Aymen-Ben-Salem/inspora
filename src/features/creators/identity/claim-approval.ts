import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { adminAuditLogs, creatorClaims, creators, creatorUsernameAliases, logos, posts, profileAccounts, submissions, websites } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import type { ClaimResult } from "../types";
import { decideCreatorOwnershipClaimEligibility } from "./claim-policy";

function retainedCreatorValues(
  target: typeof creators.$inferSelect,
  provisional: typeof creators.$inferSelect,
) {
  const edited = new Set(provisional.editedFields);
  return {
    name: edited.has("name") ? provisional.name : target.name,
    username: edited.has("username") ? provisional.username : target.username,
    url: edited.has("websiteUrl") ? provisional.url : target.url,
    avatarUrl: edited.has("avatarUrl") ? provisional.avatarUrl : target.avatarUrl,
    avatarStorageProvider: edited.has("avatarUrl")
      ? provisional.avatarStorageProvider
      : target.avatarStorageProvider,
    avatarStorageKey: edited.has("avatarUrl")
      ? provisional.avatarStorageKey
      : target.avatarStorageKey,
    editedFields: [...new Set([...target.editedFields, ...provisional.editedFields])],
  };
}

// Compatibility implementation retained until the approval slice.
export async function approveCreatorOwnershipClaim(
  claimId: string,
  actorId: string,
  reviewReason: string | null,
) {
  let identityChanged = false;
  const result = await withWriteTransaction<ClaimResult>(async (tx) => {
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
    if (!claim) return { status: "conflict" };
    if (claim.status === "approved") {
      return { status: "claimed", creatorId: claim.targetCreatorId };
    }
    if (claim.status === "rejected") return { status: "rejected" };

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
    if (!lockedProvisional || !target) return { status: "conflict" };

    const ownershipDecision = decideCreatorOwnershipClaimEligibility({
      requesterUserId: claim.requesterUserId,
      currentOwnerUserId: target.ownerUserId,
      currentXProviderAccountId: target.xProviderId,
      verifiedXProviderAccountId: claim.verifiedXProviderId,
    });
    if (ownershipDecision === "conflict") return { status: "conflict" };

    const [otherIdentity] = await tx
      .select({ id: creators.id, ownerUserId: creators.ownerUserId })
      .from(creators)
      .where(
        and(
          eq(creators.xProviderId, claim.verifiedXProviderId),
          sql`${creators.id} <> ${target.id}`,
        ),
      )
      .limit(1);
    if (otherIdentity && otherIdentity.ownerUserId !== claim.requesterUserId) {
      return { status: "conflict" };
    }

    if (lockedProvisional.id !== target.id) {
      const retained = retainedCreatorValues(target, lockedProvisional);
      const keepProvisionalUsername = lockedProvisional.editedFields.includes("username");

      await tx
        .update(creatorUsernameAliases)
        .set({ isCurrent: false })
        .where(
          and(
            eq(creatorUsernameAliases.creatorId, target.id),
            eq(creatorUsernameAliases.isCurrent, true),
          ),
        );
      await tx
        .update(creatorUsernameAliases)
        .set({
          creatorId: target.id,
          isCurrent: keepProvisionalUsername
            ? creatorUsernameAliases.isCurrent
            : false,
        })
        .where(eq(creatorUsernameAliases.creatorId, lockedProvisional.id));
      if (!keepProvisionalUsername) {
        await tx
          .update(creatorUsernameAliases)
          .set({ isCurrent: true })
          .where(
            and(
              eq(creatorUsernameAliases.creatorId, target.id),
              eq(creatorUsernameAliases.username, target.username ?? ""),
            ),
          );
      }

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
          username: keepProvisionalUsername ? null : lockedProvisional.username,
          updatedAt: now,
        })
        .where(eq(creators.id, lockedProvisional.id));
      await tx
        .update(creators)
        .set({
          ...retained,
          ownerUserId: claim.requesterUserId,
          xProviderId: claim.verifiedXProviderId,
          xProfileUrl: `https://x.com/${claim.verifiedXUsername}`,
          updatedAt: now,
        })
        .where(eq(creators.id, target.id));
      await tx.delete(creators).where(eq(creators.id, lockedProvisional.id));
    } else {
      await tx
        .update(creators)
        .set({
          ownerUserId: claim.requesterUserId,
          xProviderId: claim.verifiedXProviderId,
          xProfileUrl: `https://x.com/${claim.verifiedXUsername}`,
          updatedAt: now,
        })
        .where(eq(creators.id, target.id));
    }

    await tx
      .update(creatorClaims)
      .set({
        status: "approved",
        reviewedBy: actorId,
        reviewReason,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(creatorClaims.id, claim.id));
    await tx.insert(adminAuditLogs).values({
      actorId,
      action: "creator_claim.approved",
      resourceType: "creator_claim",
      resourceId: claim.id,
      details: {
        targetCreatorId: target.id,
        requesterUserId: claim.requesterUserId,
      },
    });
    identityChanged = true;
    return { status: "claimed", creatorId: target.id };
  });
  return { result, identityChanged };
}
