import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ getUser: vi.fn(), after: vi.fn(), rollbackAfter: 0 }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser: external.getUser } }) }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: external.after }));

import { adminAuditLogs, creatorClaims, creators, profileAccounts } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { ensureCreatorForOwner, getAdminCreatorClaims, requestCreatorOwnershipClaimFromVerifiedX, reviewCreatorOwnershipClaim } from "./identity";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/auth/require-admin";

vi.mock("@/auth/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ userId: "claim-fixture-admin" })) }));
vi.mock("@/db/write-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/write-client")>();
  return { ...actual, withWriteTransaction: <T>(work: (tx: import("@/db/write-client").WriteTx) => Promise<T>) => {
    const rollback = external.rollbackAfter > 0 && --external.rollbackAfter === 0;
    return actual.withWriteTransaction(async (tx) => {
      const result = await work(tx);
      if (rollback) throw new Error("Forced failure before commit");
      return result;
    });
  } };
});

const enabled = process.env.RUN_CREATOR_CLAIM_INTEGRATION === "1" &&
  ["development", "preview"].includes(process.env.DATA_ENVIRONMENT ?? "");

describe.skipIf(!enabled)("ownership claim requests in isolated nonproduction rows", () => {
  const ownerUserIds: string[] = [];
  const targetIds: string[] = [];
  type Evidence = { provider: string; providerUserId: string; username: string | null; verification: { status: string } | null };
  const evidence = new Map<string, Evidence[]>();
  function owner() {
    const principal = { userId: `claim-${randomUUID()}` };
    ownerUserIds.push(principal.userId);
    return principal;
  }
  async function fixture(targetCount = 0) {
    const principal = owner();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const providerAccountId = `provider-${suffix}`;
    const username = `x${suffix}`;
    const profileUrl = `https://x.com/${username}`;
    evidence.set(principal.userId, [{ provider: "oauth_x", providerUserId: providerAccountId, username, verification: { status: "verified" } }]);
    const owned = await ensureCreatorForOwner(principal);
    const targets = Array.from({ length: targetCount }, () => randomUUID());
    targetIds.push(...targets);
    if (targets.length) await withWriteTransaction(async (tx) => {
      await tx.insert(creators).values(targets.map((id) => ({ id, name: "Claim target fixture", avatarUrl: "/brand/default-avatar.svg", xProfileUrl: profileUrl, recordOrigin: "user" })));
    });
    external.after.mockClear();
    return { principal, owned, targets, providerAccountId, username, profileUrl };
  }
  async function state(userId: string) {
    return withWriteTransaction(async (tx) => {
      const claims = await tx.select().from(creatorClaims).where(eq(creatorClaims.requesterUserId, userId));
      const owned = await tx.select().from(creators).where(eq(creators.ownerUserId, userId));
      const audits = claims.length ? await tx.select().from(adminAuditLogs).where(inArray(adminAuditLogs.resourceId, claims.map((row) => row.id))) : [];
      return { claims, owned, audits };
    });
  }
  async function flushInvalidation() {
    for (const [callback] of external.after.mock.calls) await callback();
    external.after.mockClear();
  }
  beforeEach(() => {
    vi.clearAllMocks();
    external.rollbackAfter = 0;
    external.getUser.mockImplementation(async (userId: string) => ({ fullName: "Claim fixture", username: "claim_fixture", imageUrl: "", externalAccounts: evidence.get(userId) ?? [] }));
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "claim-fixture-admin" });
  });
  afterAll(async () => {
    await withWriteTransaction(async (tx) => {
      if (ownerUserIds.length) {
        const claims = await tx.select({ id: creatorClaims.id }).from(creatorClaims).where(inArray(creatorClaims.requesterUserId, ownerUserIds));
        if (claims.length) await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.resourceId, claims.map((row) => row.id)));
        await tx.delete(creatorClaims).where(inArray(creatorClaims.requesterUserId, ownerUserIds));
        if (targetIds.length) await tx.delete(creators).where(inArray(creators.id, targetIds));
        await tx.delete(creators).where(inArray(creators.ownerUserId, ownerUserIds));
        await tx.delete(profileAccounts).where(inArray(profileAccounts.userId, ownerUserIds));
      }
    });
  });
  it("missing evidence returns no_match after establishing the owned creator", async () => {
    const principal = { userId: `claim-${randomUUID()}` };
    ownerUserIds.push(principal.userId);
    expect(await requestCreatorOwnershipClaimFromVerifiedX(principal)).toEqual({ status: "no_match" });
    const profile = await ensureCreatorForOwner(principal);
    await withWriteTransaction(async (tx) => {
      const rows = await tx.select().from(creators).where(eq(creators.ownerUserId, principal.userId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: profile.id, xProviderId: null });
    });
  }, 60000);


  it.each([
    { provider: "oauth_google" },
    { verification: { status: "unverified" } },
    { verification: null },
    { providerUserId: "   " },
    { username: null },
    { username: "https://x.com/proof" },
    { username: "too_long_for_x_username" },
  ])("refuses invalid provider evidence %j without association", async (invalid) => {
    const f = await fixture(1);
    evidence.set(f.principal.userId, [{ ...evidence.get(f.principal.userId)![0]!, ...invalid }]);
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "no_match" });
    const saved = await state(f.principal.userId);
    expect(saved.claims).toEqual([]);
    expect(saved.owned[0]).toMatchObject({ xProviderId: null, xProfileUrl: null });
    expect(external.after).not.toHaveBeenCalled();
  }, 60000);

  it("associates a verified identity with no other target and safely reconnects without repeated writes", async () => {
    const f = await fixture();
    // The owner's own URL is excluded from discovery.
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ xProfileUrl: f.profileUrl }).where(eq(creators.id, f.owned.id)); });
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "no_match" });
    const saved = await state(f.principal.userId);
    expect(saved.owned[0]).toMatchObject({ xProviderId: f.providerAccountId, xProfileUrl: f.profileUrl });
    expect(saved.claims).toEqual([]);
    expect(revalidateTag).not.toHaveBeenCalled();
    await flushInvalidation();
    expect(revalidateTag).toHaveBeenCalledWith("public-creator-profiles", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledTimes(4);
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "already_owned", creatorId: f.owned.id });
    expect(await state(f.principal.userId)).toEqual(saved);
    expect(external.after).not.toHaveBeenCalled();
  }, 60000);

  it("uses established provider identity ahead of ambiguous URL discovery and refreshes a changed X username", async () => {
    const f = await fixture(2);
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ xProviderId: f.providerAccountId, xProfileUrl: "https://x.com/old_name" }).where(eq(creators.id, f.owned.id)); });
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "already_owned", creatorId: f.owned.id });
    expect((await state(f.principal.userId)).owned[0]).toMatchObject({ xProfileUrl: f.profileUrl });
    expect(external.after).toHaveBeenCalledTimes(1);
  }, 60000);

  it("refuses ambiguous URLs without granting ownership or changing the owned creator", async () => {
    const f = await fixture(2);
    const before = await state(f.principal.userId);
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "conflict" });
    expect(await state(f.principal.userId)).toEqual(before);
    expect(external.after).not.toHaveBeenCalled();
  }, 60000);

  it.each(["owned-provider", "target-owner", "target-provider", "established-unowned", "established-other-owner"])("refuses %s conflicts", async (conflict) => {
    const f = await fixture(1);
    await withWriteTransaction(async (tx) => {
      if (conflict === "owned-provider") await tx.update(creators).set({ xProviderId: `other-${randomUUID()}` }).where(eq(creators.id, f.owned.id));
      else await tx.update(creators).set({
        ownerUserId: conflict.includes("owner") ? `another-${randomUUID()}` : null,
        xProviderId: conflict === "target-provider" ? `other-${randomUUID()}` : conflict.startsWith("established") ? f.providerAccountId : null,
        xProfileUrl: conflict.startsWith("established") ? "https://x.com/unrelated" : f.profileUrl,
      }).where(eq(creators.id, f.targets[0]!));
    });
    const before = await state(f.principal.userId);
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "conflict" });
    expect(await state(f.principal.userId)).toEqual(before);
    expect(external.after).not.toHaveBeenCalled();
  }, 60000);

  it.each(["user", "mirrored", "editorial", "preview", "development"])("requests a %s-origin target without transferring ownership and replays pending", async (recordOrigin) => {
    const f = await fixture(1);
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ recordOrigin }).where(eq(creators.id, f.targets[0]!)); });
    const results = await Promise.all([requestCreatorOwnershipClaimFromVerifiedX(f.principal), requestCreatorOwnershipClaimFromVerifiedX(f.principal)]);
    expect(results[0]).toMatchObject({ status: "pending" });
    expect(results[1]).toEqual(results[0]);
    const saved = await state(f.principal.userId);
    expect(saved.claims).toHaveLength(1);
    expect(saved.claims[0]).toMatchObject({ targetCreatorId: f.targets[0], status: "pending", verifiedXProviderId: f.providerAccountId });
    expect(saved.owned[0]).toMatchObject({ id: f.owned.id, ownerUserId: f.principal.userId, xProviderId: null });
    await withWriteTransaction(async (tx) => {
      const [target] = await tx.select().from(creators).where(eq(creators.id, f.targets[0]!));
      expect(target).toMatchObject({ ownerUserId: null, xProviderId: null });
    });
    expect(saved.audits).toEqual([]);
    expect(external.after).toHaveBeenCalledTimes(1);
    external.after.mockClear();
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual(results[0]);
    expect(await state(f.principal.userId)).toEqual(saved);
    expect(external.after).not.toHaveBeenCalled();
  }, 60000);

  it.each(["approve", "reject"] as const)("replays %s through both request and review without repeated audit or identity effects", async (decision) => {
    const f = await fixture(1);
    await withWriteTransaction(async (tx) => {
      await tx.update(creators).set({ username: f.username }).where(eq(creators.id, f.targets[0]!));
    });
    const request = await requestCreatorOwnershipClaimFromVerifiedX(f.principal);
    if (request.status !== "pending") throw new Error("Expected pending");
    const reviewed = await reviewCreatorOwnershipClaim(request.claimId, decision, " Original reason ");
    expect(reviewed).toEqual(decision === "approve" ? { status: "claimed", creatorId: f.targets[0] } : { status: "rejected" });
    const saved = await state(f.principal.userId);
    expect(saved.audits).toHaveLength(1);
    external.after.mockClear();
    // Recorded outcome wins even after discovery evidence changes.
    evidence.get(f.principal.userId)![0]!.username = "changed_name";
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual(reviewed);
    expect(await reviewCreatorOwnershipClaim(request.claimId, "reject", "Different reason")).toEqual(reviewed);
    expect(await reviewCreatorOwnershipClaim(request.claimId, "approve")).toEqual(reviewed);
    expect(await state(f.principal.userId)).toEqual(saved);
    expect(external.after).not.toHaveBeenCalled();
  }, 60000);

  it("serializes concurrent rejection to one trimmed recorded review and one audit even for an inactive account", async () => {
    const f = await fixture(1);
    const request = await requestCreatorOwnershipClaimFromVerifiedX(f.principal);
    if (request.status !== "pending") throw new Error("Expected pending");
    await withWriteTransaction(async (tx) => { await tx.update(profileAccounts).set({ status: "deleting" }).where(eq(profileAccounts.userId, f.principal.userId)); });
    external.after.mockClear();
    expect(await Promise.all([reviewCreatorOwnershipClaim(request.claimId, "reject", " Reason "), reviewCreatorOwnershipClaim(request.claimId, "reject", " Reason ")])).toEqual([{ status: "rejected" }, { status: "rejected" }]);
    const saved = await state(f.principal.userId);
    expect(saved.claims[0]).toMatchObject({ status: "rejected", reviewReason: "Reason", reviewedBy: "claim-fixture-admin" });
    expect(saved.audits).toHaveLength(1);
    expect(saved.audits[0]).toMatchObject({ action: "creator_claim.rejected", details: { reason: "Reason", targetCreatorId: f.targets[0] } });
    expect(saved.owned[0]).toMatchObject({ id: f.owned.id, xProviderId: null });
    expect(external.after).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/creators");
  }, 60000);

  it("rolls back a failed request and rejection without success invalidation", async () => {
    const f = await fixture(1);
    const before = await state(f.principal.userId);
    external.rollbackAfter = 2; // ensure then request
    await expect(requestCreatorOwnershipClaimFromVerifiedX(f.principal)).rejects.toThrow("Forced failure before commit");
    expect(await state(f.principal.userId)).toEqual(before);
    expect(external.after).not.toHaveBeenCalled();
    const request = await requestCreatorOwnershipClaimFromVerifiedX(f.principal);
    if (request.status !== "pending") throw new Error("Expected pending");
    const pending = await state(f.principal.userId);
    external.after.mockClear();
    external.rollbackAfter = 1;
    await expect(reviewCreatorOwnershipClaim(request.claimId, "reject", "Reason")).rejects.toThrow("Forced failure before commit");
    expect(await state(f.principal.userId)).toEqual(pending);
    expect(external.after).not.toHaveBeenCalled();
  }, 60000);

  it("preserves restricted admin claim projections and requires admin authority", async () => {
    const f = await fixture(1);
    const request = await requestCreatorOwnershipClaimFromVerifiedX(f.principal);
    if (request.status !== "pending") throw new Error("Expected pending");
    const claim = (await getAdminCreatorClaims()).find((row) => row.id === request.claimId);
    expect(claim).toMatchObject({ id: request.claimId, status: "pending", verifiedXUsername: f.username });
    expect(claim).not.toHaveProperty("verifiedXProviderId");
    expect(claim).not.toHaveProperty("reviewedBy");
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(reviewCreatorOwnershipClaim(request.claimId, "reject", "Reason")).rejects.toThrow("NEXT_REDIRECT");
    expect((await state(f.principal.userId)).claims[0]?.status).toBe("pending");
  }, 60000);


  it("rechecks account status after provider retrieval and refuses an inactive requester", async () => {
    const f = await fixture(1);
    const user = { fullName: "Fixture", username: "fixture", imageUrl: "", externalAccounts: evidence.get(f.principal.userId) };
    external.getUser.mockResolvedValueOnce(user).mockImplementationOnce(async () => {
      await withWriteTransaction(async (tx) => { await tx.update(profileAccounts).set({ status: "deleting" }).where(eq(profileAccounts.userId, f.principal.userId)); });
      return user;
    });
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "conflict" });
    expect((await state(f.principal.userId)).claims).toEqual([]);
    expect(external.after).not.toHaveBeenCalled();
    await expect(requestCreatorOwnershipClaimFromVerifiedX(f.principal)).rejects.toThrow("This account is not active.");
  }, 60000);

  it("turns competing provider associations into a controlled conflict without partial writes", async () => {
    const first = await fixture();
    const second = await fixture();
    evidence.set(second.principal.userId, evidence.get(first.principal.userId)!);
    const outcomes = await Promise.all([
      requestCreatorOwnershipClaimFromVerifiedX(first.principal),
      requestCreatorOwnershipClaimFromVerifiedX(second.principal),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["conflict", "no_match"]);
    const states = await Promise.all([state(first.principal.userId), state(second.principal.userId)]);
    expect(states.flatMap((saved) => saved.claims)).toEqual([]);
    expect(states.flatMap((saved) => saved.owned).filter((row) => row.xProviderId === first.providerAccountId)).toHaveLength(1);
    expect(external.after).toHaveBeenCalledTimes(1);
  }, 60000);

  it.each(["x", "twitter"])("accepts verified %s accounts with a current normalized username", async (provider) => {
    const f = await fixture();
    evidence.set(f.principal.userId, [
      { ...evidence.get(f.principal.userId)![0]!, username: "invalid URL" },
      { provider, providerUserId: f.providerAccountId, username: `@${f.username.toUpperCase()}`, verification: { status: "verified" } },
    ]);
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "no_match" });
    expect((await state(f.principal.userId)).owned[0]).toMatchObject({ xProfileUrl: f.profileUrl, xProviderId: f.providerAccountId });
  }, 60000);
});
