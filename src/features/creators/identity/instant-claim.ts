import "server-only";
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { requireDatabase } from "@/db/client";
import { creatorClaims, creators } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { deleteManagedMediaAssetsSafely } from "@/storage/media-storage";
import type { ClaimResult } from "../types";
import { ensureCreatorForOwner, type CreatorOwnerPrincipal } from "./index";
import { verifiedXIdentityForUser } from "./external-identity";
import { CreatorClaimError, lockClaimAccount, visibleClaimTarget } from "./claim-requests";
import { approveCreatorOwnershipClaim } from "./claim-approval";
import { refreshCommittedClaim } from "./claims";
import { findXCreatorCandidates, resolveCreatorXAccount, sameXProfileSnapshot } from "./x-profile";

export async function claimCreatorWithX(principal: CreatorOwnerPrincipal, targetCreatorId: string): Promise<ClaimResult> {
  if (!principal.userId?.trim()) throw new CreatorClaimError("Sign in with X to claim this profile.");
  const identity = await verifiedXIdentityForUser(principal.userId);
  if (!identity) throw new CreatorClaimError("Connect and verify your X account before claiming this profile.");
  const snapshot = await requireDatabase().query.creators.findFirst({ where: eq(creators.id, targetCreatorId) });
  if (!snapshot || !visibleClaimTarget(snapshot)) throw new CreatorClaimError("This creator is unavailable.");
  if (snapshot.ownerUserId === principal.userId) return { status: "already_owned", creatorId: snapshot.id };
  if (snapshot.ownerUserId) throw new CreatorClaimError("This profile already has an owner. Report the ownership problem instead.");
  const accountId = await resolveCreatorXAccount(snapshot);
  if (!accountId || accountId !== identity.providerAccountId) throw new CreatorClaimError("Your X account does not match this creator. You can report an incorrect attribution.");

  const owned = await ensureCreatorForOwner(principal);
  const candidates = await findXCreatorCandidates(identity, owned.id);
  if (candidates.some(candidate => candidate.id !== snapshot.id)) throw new CreatorClaimError("This X account is attributed to multiple creator profiles. Please report the duplicate attribution.");
  try {
    const outcome = await withWriteTransaction(async tx => {
      await lockClaimAccount(tx, principal.userId);
      // Serialize confirmation with reports/withdrawals using the same account-first lock order.
      const pending = await tx.select().from(creatorClaims).where(and(eq(creatorClaims.requesterUserId, principal.userId), eq(creatorClaims.status, "pending"))).for("update");
      if (pending.some(row => row.method === "ownership_report" || row.targetCreatorId !== targetCreatorId)) {
        throw new CreatorClaimError("Withdraw your pending request or report in Your claims before claiming this profile.");
      }
      const locked = await tx.select().from(creators).where(inArray(creators.id, [owned.id, targetCreatorId].sort())).orderBy(asc(creators.id)).for("update");
      const target = locked.find(row => row.id === targetCreatorId);
      if (target?.ownerUserId === principal.userId) return { result: { status: "already_owned", creatorId: target.id } as ClaimResult, identityChanged: false, displacedAvatarAssets: [] };
      if (!target || target.ownerUserId || !visibleClaimTarget(target) || !sameXProfileSnapshot(snapshot, target)) {
        throw new CreatorClaimError("This profile changed while verifying X. Reload and try again.");
      }
      const [recent] = await tx.select({ total: count() }).from(creatorClaims).where(and(eq(creatorClaims.requesterUserId, principal.userId), gte(creatorClaims.createdAt, new Date(Date.now() - 86400000))));
      if (recent.total >= 5) throw new CreatorClaimError("You have submitted five requests in the last 24 hours. Please try again later.");
      // Old pending requests are retained as history; this confirmation uses fresh identity evidence.
      if (pending.length) await tx.update(creatorClaims).set({ status: "withdrawn", updatedAt: new Date() }).where(inArray(creatorClaims.id, pending.map(row => row.id)));
      const [claim] = await tx.insert(creatorClaims).values({ requesterUserId: principal.userId, targetCreatorId, method: "x", verifiedXProviderId: identity.providerAccountId, verifiedXUsername: identity.username }).returning({ id: creatorClaims.id });
      const result = await approveCreatorOwnershipClaim(claim.id, principal.userId, "Claimed by confirming a matching authenticated X account.", { identity, automatic: true, verifiedTargetAccountId: accountId }, tx);
      if (result.result.status !== "claimed") throw new CreatorClaimError(result.result.status === "conflict" ? result.result.message ?? "This profile could not be claimed. Please report the ownership problem." : "This profile could not be claimed.");
      return result;
    });
    refreshCommittedClaim(outcome.identityChanged);
    await deleteManagedMediaAssetsSafely(outcome.displacedAvatarAssets);
    return outcome.result;
  } catch (error) {
    let cause: unknown = error;
    while (cause && typeof cause === "object") {
      const dbError = cause as { code?: string; cause?: unknown };
      if (["23505", "40001", "40P01"].includes(dbError.code ?? "")) throw new CreatorClaimError("This X account or creator changed during your claim. Reload and try again.");
      cause = dbError.cause;
    }
    throw error;
  }
}
