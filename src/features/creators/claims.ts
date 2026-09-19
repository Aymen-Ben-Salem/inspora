import "server-only";

import { randomUUID } from "node:crypto";

import { clerkClient } from "@clerk/nextjs/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  adminAuditLogs,
  creatorClaims,
  creators,
  creatorUsernameAliases,
  logos,
  posts,
  profileAccounts,
  submissions,
  websites,
} from "../../db/schema";
import { withWriteTransaction } from "../../db/write-client";
import { requireAdmin } from "../../auth/require-admin";

import { ensureOwnedCreator } from "./repository";
import type { ClaimResult } from "./types";
import { normalizeXUsername } from "./validation";

const CREATOR_REFERENCE_KINDS = [
  "posts",
  "logos",
  "websites",
  "submissions",
] as const;

export function creatorReferenceKinds() {
  return [...CREATOR_REFERENCE_KINDS];
}

export type ExternalAccountEvidence = {
  provider: string;
  providerUserId: string;
  username: string | null;
  verificationStatus: string | null;
};

export type VerifiedXIdentity = {
  providerId: string;
  username: string;
  profileUrl: string;
};

export function verifiedXIdentityFromAccounts(
  accounts: ExternalAccountEvidence[],
): VerifiedXIdentity | null {
  const account = accounts.find(
    (candidate) =>
      ["oauth_x", "x", "twitter"].includes(candidate.provider.toLowerCase()) &&
      candidate.verificationStatus === "verified" &&
      Boolean(candidate.providerUserId.trim()) &&
      Boolean(candidate.username),
  );
  if (!account?.username) return null;

  try {
    const username = normalizeXUsername(account.username);
    return {
      providerId: account.providerUserId,
      username,
      profileUrl: `https://x.com/${username}`,
    };
  } catch {
    return null;
  }
}

export function claimDecision(input: {
  requesterUserId: string;
  currentOwnerUserId: string | null;
  currentProviderId: string | null;
  verifiedProviderId: string;
}): "pending" | "already_owned" | "conflict" {
  if (
    input.currentOwnerUserId === input.requesterUserId &&
    input.currentProviderId === input.verifiedProviderId
  ) {
    return "already_owned";
  }
  if (
    (input.currentOwnerUserId &&
      input.currentOwnerUserId !== input.requesterUserId) ||
    (input.currentProviderId &&
      input.currentProviderId !== input.verifiedProviderId)
  ) {
    return "conflict";
  }
  return "pending";
}

export function existingClaimRequestResult(claim: {
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

async function verifiedXIdentityForUser(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return verifiedXIdentityFromAccounts(
    user.externalAccounts.map((account) => ({
      provider: account.provider,
      providerUserId: account.providerUserId,
      username: account.username,
      verificationStatus: account.verification?.status ?? null,
    })),
  );
}

export async function requestCreatorClaimFromVerifiedX(
  userId: string,
): Promise<ClaimResult> {
  const [ownedProfile, identity] = await Promise.all([
    ensureOwnedCreator(userId),
    verifiedXIdentityForUser(userId),
  ]);
  if (!identity) return { status: "no_match" };

  return withWriteTransaction(async (tx) => {
    const [account] = await tx
      .select({ status: profileAccounts.status })
      .from(profileAccounts)
      .where(eq(profileAccounts.userId, userId))
      .for("update");
    if (!account || account.status !== "active") return { status: "conflict" };

    const [owned] = await tx
      .select()
      .from(creators)
      .where(eq(creators.id, ownedProfile.id))
      .for("update");
    if (!owned || owned.ownerUserId !== userId) return { status: "conflict" };

    const previousClaims = await tx
      .select()
      .from(creatorClaims)
      .where(
        and(
          eq(creatorClaims.requesterUserId, userId),
          eq(creatorClaims.verifiedXProviderId, identity.providerId),
        ),
      )
      .orderBy(asc(creatorClaims.createdAt));
    const previous = previousClaims.at(-1);
    if (previous) {
      const existingResult = existingClaimRequestResult(previous);
      if (existingResult) return existingResult;
    }

    const [established] = await tx
      .select()
      .from(creators)
      .where(eq(creators.xProviderId, identity.providerId))
      .limit(1);
    if (established) {
      if (established.ownerUserId !== userId) return { status: "conflict" };
      await tx
        .update(creators)
        .set({ xProfileUrl: identity.profileUrl, updatedAt: new Date() })
        .where(eq(creators.id, established.id));
      return { status: "already_owned", creatorId: established.id };
    }

    const matches = await tx
      .select()
      .from(creators)
      .where(sql`lower(${creators.xProfileUrl}) = ${identity.profileUrl}`)
      .orderBy(asc(creators.id))
      .for("update");
    const editorialMatches = matches.filter((creator) => creator.id !== owned.id);
    if (editorialMatches.length > 1) return { status: "conflict" };

    const target = editorialMatches[0];
    if (!target) {
      await tx
        .update(creators)
        .set({
          xProfileUrl: identity.profileUrl,
          xProviderId: identity.providerId,
          updatedAt: new Date(),
        })
        .where(eq(creators.id, owned.id));
      return { status: "no_match" };
    }

    const decision = claimDecision({
      requesterUserId: userId,
      currentOwnerUserId: target.ownerUserId,
      currentProviderId: target.xProviderId,
      verifiedProviderId: identity.providerId,
    });
    if (decision === "conflict") return { status: "conflict" };
    if (decision === "already_owned") {
      return { status: "already_owned", creatorId: target.id };
    }

    await tx
      .update(creators)
      .set({ xProfileUrl: identity.profileUrl, updatedAt: new Date() })
      .where(eq(creators.id, owned.id));
    const id = randomUUID();
    await tx.insert(creatorClaims).values({
      id,
      requesterUserId: userId,
      targetCreatorId: target.id,
      verifiedXProviderId: identity.providerId,
      verifiedXUsername: identity.username,
    });
    return { status: "pending", claimId: id };
  });
}

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

export async function reviewCreatorClaim(
  claimId: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<ClaimResult> {
  const { userId: actorId } = await requireAdmin();
  const reviewReason = reason?.trim() || null;
  if (decision === "reject" && !reviewReason) {
    throw new Error("Add a reason before rejecting this claim.");
  }

  return withWriteTransaction(async (tx) => {
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
    if (decision === "reject") {
      await tx
        .update(creatorClaims)
        .set({
          status: "rejected",
          reviewedBy: actorId,
          reviewReason,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(creatorClaims.id, claim.id));
      await tx.insert(adminAuditLogs).values({
        actorId,
        action: "creator_claim.rejected",
        resourceType: "creator_claim",
        resourceId: claim.id,
        details: { targetCreatorId: claim.targetCreatorId, reason: reviewReason },
      });
      return { status: "rejected" };
    }

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

    const ownershipDecision = claimDecision({
      requesterUserId: claim.requesterUserId,
      currentOwnerUserId: target.ownerUserId,
      currentProviderId: target.xProviderId,
      verifiedProviderId: claim.verifiedXProviderId,
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
        .set({ ownerUserId: null, xProviderId: null, updatedAt: now })
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
    return { status: "claimed", creatorId: target.id };
  });
}
