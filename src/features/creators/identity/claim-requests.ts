import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { requireDatabase } from "@/db/client";
import { adminAuditLogs, creatorClaims, creators, profileAccounts } from "@/db/schema";
import { withWriteTransaction, type WriteTx } from "@/db/write-client";
import { isCreatorVisibleInEnvironment } from "@/features/admin/creator-environment-policy";
import { creatorClaimRequestSchema, type CreatorClaimRequest } from "../claim-validation";
import type { ClaimResult, OwnCreatorClaim } from "../types";
import { normalizeXProfileUrl } from "../validation";
import { ensureCreatorForOwner, type CreatorOwnerPrincipal } from "./index";
import { verifiedXIdentityForUser } from "./external-identity";
import { findXCreatorCandidates } from "./x-profile";

export class CreatorClaimError extends Error {}

export async function lockClaimAccount(tx: WriteTx, userId: string) {
  if (!userId?.trim()) throw new CreatorClaimError("Sign in to manage a creator claim.");
  const [account] = await tx.select().from(profileAccounts).where(eq(profileAccounts.userId, userId)).for("update");
  if (!account || account.status !== "active") throw new CreatorClaimError("This account is not active.");
}

export function visibleClaimTarget(target: typeof creators.$inferSelect | undefined) {
  return Boolean(target && !target.trashedAt && isCreatorVisibleInEnvironment(target.handle, process.env.DATA_ENVIRONMENT));
}

export function normalizedClaimXUrl(value: string | null) {
  try { return value ? normalizeXProfileUrl(value) : null; } catch { return null; }
}

export async function requestCreatorClaim(principal: CreatorOwnerPrincipal, raw: CreatorClaimRequest): Promise<ClaimResult> {
  const input = creatorClaimRequestSchema.parse(raw);
  if (input.method === "x") {
    const { claimCreatorWithX } = await import("./instant-claim");
    return claimCreatorWithX(principal, input.targetCreatorId, input.profile);
  }
  const owned = await ensureCreatorForOwner(principal);
  return withWriteTransaction(async (tx) => {
    await lockClaimAccount(tx, principal.userId);
    const [pending] = await tx.select().from(creatorClaims).where(and(eq(creatorClaims.requesterUserId, principal.userId), eq(creatorClaims.status, "pending"))).for("update");
    if (pending) {
      if (pending.targetCreatorId === input.targetCreatorId && pending.method === input.method) return { status: "pending", claimId: pending.id };
      throw new CreatorClaimError("You already have a pending request. Withdraw it from Your claims before submitting another.");
    }
    const locked = await tx.select().from(creators).where(inArray(creators.id, [...new Set([owned.id, input.targetCreatorId])].sort())).orderBy(asc(creators.id)).for("update");
    const source = locked.find((row) => row.id === owned.id);
    const target = locked.find((row) => row.id === input.targetCreatorId);
    if (!target || !visibleClaimTarget(target) || !source || source.trashedAt || source.ownerUserId !== principal.userId) throw new CreatorClaimError("This creator is unavailable. Reload the profile and try again.");
    if (target.ownerUserId === principal.userId) return { status: "already_owned", creatorId: target.id };
    const [recent] = await tx.select({ total: count() }).from(creatorClaims).where(and(eq(creatorClaims.requesterUserId, principal.userId), gte(creatorClaims.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))));
    if (recent.total >= 5) throw new CreatorClaimError("You have submitted five requests in the last 24 hours. Please try again later.");
    const [claim] = await tx.insert(creatorClaims).values({
      requesterUserId: principal.userId, targetCreatorId: target.id, method: input.method,
      verifiedXProviderId: null, verifiedXUsername: null,
      evidenceUrl: input.evidenceUrl,
      evidenceNote: input.evidenceNote,
    }).returning({ id: creatorClaims.id });
    return { status: "pending", claimId: claim.id };
  });
}

export async function changeOwnClaim(principal: CreatorOwnerPrincipal, claimId: string, operation: "withdraw" | "dismiss") {
  return withWriteTransaction(async (tx) => {
    await lockClaimAccount(tx, principal.userId);
    const [claim] = await tx.select().from(creatorClaims).where(and(eq(creatorClaims.id, claimId), eq(creatorClaims.requesterUserId, principal.userId))).for("update");
    if (!claim) throw new CreatorClaimError("That request is unavailable.");
    if (operation === "withdraw") {
      if (claim.status === "withdrawn") return;
      if (claim.status !== "pending") throw new CreatorClaimError("This request has already been reviewed. Reload to see the decision.");
      await tx.update(creatorClaims).set({ status: "withdrawn", attentionReason: null, updatedAt: new Date() }).where(eq(creatorClaims.id, claim.id));
    } else {
      if (claim.status === "pending") throw new CreatorClaimError("Pending requests remain visible until reviewed or withdrawn.");
      await tx.update(creatorClaims).set({ dismissedAt: new Date() }).where(eq(creatorClaims.id, claim.id));
    }
  });
}

export async function getOwnCreatorClaims(userId: string, options: { page?: number; notifications?: boolean } = {}) {
  const page = Math.max(1, Math.min(10000, options.page ?? 1));
  const size = options.notifications ? 5 : 20;
  const rows = await requireDatabase().select({ claim: creatorClaims, targetName: creators.name, targetUsername: creators.username }).from(creatorClaims)
    .innerJoin(creators, eq(creators.id, creatorClaims.targetCreatorId))
    .where(and(eq(creatorClaims.requesterUserId, userId), options.notifications ? or(eq(creatorClaims.status, "pending"), isNull(creatorClaims.dismissedAt)) : undefined))
    .orderBy(sql`case when ${creatorClaims.status} = 'pending' then 0 else 1 end`, desc(creatorClaims.createdAt), desc(creatorClaims.id)).limit(size + 1).offset(options.notifications ? 0 : (page - 1) * size);
  return { hasNext: rows.length > size, page, items: rows.slice(0, size).map(({ claim, targetName, targetUsername }): OwnCreatorClaim => ({
    id: claim.id, targetCreatorId: claim.targetCreatorId, targetName, targetUsername,
    method: claim.method as OwnCreatorClaim["method"], status: claim.status as OwnCreatorClaim["status"],
    attentionReason: claim.attentionReason, reviewReason: claim.reviewReason, createdAt: claim.createdAt.toISOString(), dismissedAt: claim.dismissedAt?.toISOString() ?? null,
  })) };
}

// Connecting X never submits a claim. A different provider account requires an explicit owner action.
export async function synchronizeOwnedXIdentity(principal: CreatorOwnerPrincipal, confirmChange = false) {
  const owned = await ensureCreatorForOwner(principal);
  const identity = await verifiedXIdentityForUser(principal.userId);
  if (!identity) return { status: "disconnected" as const, message: "Connect X to verify an X identity. Your creator ownership stays with your account." };
  const candidates = await findXCreatorCandidates(identity, owned.id);
  if (candidates.length) return { status: "conflict" as const, message: "This X account is already attributed to a creator. Confirm that profile or report an incorrect attribution.", claimPath: "/profile/claim-match" };
  return withWriteTransaction(async (tx) => {
    await lockClaimAccount(tx, principal.userId);
    const [creator] = await tx.select().from(creators).where(eq(creators.id, owned.id)).for("update");
    if (!creator || creator.ownerUserId !== principal.userId) throw new CreatorClaimError("Your creator profile changed. Reload and try again.");
    if (creator.xProviderId && creator.xProviderId !== identity.providerAccountId && !confirmChange) return { status: "confirm" as const, message: "Your connected X account has changed. Confirm the new X identity to update your profile link." };
    const [other] = await tx.select({ id: creators.id }).from(creators).where(and(or(eq(creators.xProviderId, identity.providerAccountId), eq(creators.xProfileAccountId, identity.providerAccountId)), sql`${creators.id} <> ${creator.id}`)).limit(1);
    if (other) return { status: "conflict" as const, message: "This X identity is associated with another creator. Open that creator profile to claim it or report an ownership problem." };
    if (creator.xProviderId !== identity.providerAccountId || creator.xProfileUrl !== identity.profileUrl) {
      await tx.update(creators).set({ xProviderId: identity.providerAccountId, xProfileAccountId: identity.providerAccountId, xProfileUrl: identity.profileUrl, updatedAt: new Date() }).where(eq(creators.id, creator.id));
      await tx.insert(adminAuditLogs).values({ actorId: principal.userId, action: "creator.x_identity_updated", resourceType: "creator", resourceId: creator.id,
        details: { previousProviderId: creator.xProviderId, providerId: identity.providerAccountId } });
    }
    return { status: "synced" as const, message: "Your profile uses your verified X account: @" + identity.username + "." };
  });
}
