import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ getUser: vi.fn(), lookup: vi.fn(), rollbackAfter: 0 }));
vi.mock("./x-api", () => ({ lookupXProfile: external.lookup, XLookupError: class extends Error {} }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser: external.getUser } }) }));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ userId: "claims-workflow-admin" })) }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/db/write-client", async (original) => {
  const actual = await original<typeof import("@/db/write-client")>();
  return { ...actual, withWriteTransaction: <T>(work: (tx: import("@/db/write-client").WriteTx) => Promise<T>) => {
    const rollback = external.rollbackAfter > 0 && --external.rollbackAfter === 0;
    return actual.withWriteTransaction(async (tx) => {
      const result = await work(tx);
      if (rollback) throw new Error("Forced rollback");
      return result;
    });
  } };
});

import { adminAuditLogs, creatorClaims, creators, creatorUsernameAliases, profileAccounts } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { ensureCreatorForOwner, requestCreatorOwnershipClaimFromVerifiedX, reviewCreatorOwnershipClaim } from "./identity";
import { changeOwnClaim, getOwnCreatorClaims, requestCreatorClaim, synchronizeOwnedXIdentity } from "./identity/claim-requests";
import { findXCreatorCandidates } from "./identity/x-profile";


const enabled = process.env.RUN_CREATOR_CLAIM_INTEGRATION === "1" && process.env.DATA_ENVIRONMENT === "preview";
describe.skipIf(!enabled)("explicit creator claims in isolated Preview rows", () => {
  type Evidence = { provider: string; providerUserId: string; username: string; verification: { status: string } };
  const evidence = new Map<string, Evidence[]>();
  const resolved = new Map<string, string>();
  const users: string[] = [];
  const ids: string[] = [];
  async function fixture() {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const principal = { userId: "claim-flow-" + suffix };
    users.push(principal.userId);
    const provider = "provider-" + suffix;
    const username = "x" + suffix;
    resolved.set("https://x.com/" + username, provider);
    evidence.set(principal.userId, [{ provider: "oauth_x", providerUserId: provider, username, verification: { status: "verified" } }]);
    const source = await ensureCreatorForOwner(principal);
    const targetId = randomUUID();
    ids.push(source.id, targetId);
    await withWriteTransaction(async (tx) => {
      await tx.insert(creators).values({ id: targetId, name: "Existing creator", username: "target_" + suffix, avatarUrl: "/avatar.svg", xProfileUrl: "https://x.com/" + username, recordOrigin: "preview" });
      await tx.insert(creatorUsernameAliases).values({ creatorId: targetId, username: "target_" + suffix, isCurrent: true });
    });
    const input = { targetCreatorId: targetId, method: "x" as const, confirmed: true as const };
    return { principal, source, targetId, provider, username, input };
  }
  async function rows(f: Awaited<ReturnType<typeof fixture>>) {
    return withWriteTransaction(async (tx) => ({
      claims: await tx.select().from(creatorClaims).where(eq(creatorClaims.requesterUserId, f.principal.userId)),
      creators: await tx.select().from(creators).where(inArray(creators.id, [f.source.id, f.targetId])),
    }));
  }
  async function request(f: Awaited<ReturnType<typeof fixture>>) {
    const result = await requestCreatorClaim(f.principal, { ...f.input, method: "ownership_report", evidenceUrl: "https://portfolio.example", evidenceNote: "This profile has an incorrect X attribution. Please investigate." });
    if (result.status !== "pending") throw new Error("Expected pending");
    return result.claimId;
  }
  beforeEach(() => {
    vi.clearAllMocks(); external.rollbackAfter = 0;
    external.lookup.mockImplementation(async (url: string) => ({ id: resolved.get(url) ?? "unknown", username: url.split("/").pop() }));
    external.getUser.mockImplementation(async (userId: string) => ({
      fullName: "Claim owner", username: userId.replaceAll("-", "_").slice(0, 30), imageUrl: "",
      externalAccounts: evidence.get(userId) ?? [],
    }));
  });
  afterAll(async () => {
    if (!users.length) return;
    await withWriteTransaction(async (tx) => {
      const claims = await tx.select({ id: creatorClaims.id }).from(creatorClaims).where(inArray(creatorClaims.requesterUserId, users));
      await tx.delete(adminAuditLogs).where(or(inArray(adminAuditLogs.actorId, users), inArray(adminAuditLogs.resourceId, [...ids, ...claims.map((row) => row.id)])));
      await tx.delete(creatorClaims).where(inArray(creatorClaims.requesterUserId, users));
      await tx.delete(creators).where(inArray(creators.id, ids));
      await tx.delete(profileAccounts).where(inArray(profileAccounts.userId, users));
    });
  });


  it("requires explicit confirmation and freshly verified X evidence", async () => {
    const f = await fixture();
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "no_match" });
    await expect(requestCreatorClaim(f.principal, { ...f.input, confirmed: false } as never)).rejects.toThrow();
    evidence.set(f.principal.userId, []);
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("Connect and verify");
    expect((await rows(f)).claims).toEqual([]);
  }, 60000);

  it("claims immediately, pins the official ID, and records the requester without an admin reviewer", async () => {
    const f = await fixture();
    expect(await synchronizeOwnedXIdentity(f.principal)).toMatchObject({ status: "conflict", claimPath: "/profile/claim-match" });
    expect(await requestCreatorClaim(f.principal, f.input)).toEqual({ status: "claimed", creatorId: f.targetId });
    const saved = await rows(f);
    expect(saved.creators).toMatchObject([{ id: f.targetId, ownerUserId: f.principal.userId, xProviderId: f.provider, xProfileAccountId: f.provider }]);
    expect(saved.claims).toMatchObject([{ status: "approved", reviewedBy: null }]);
    expect(external.lookup).toHaveBeenCalledWith("https://x.com/" + f.username);
  }, 60000);

  it("rejects a mismatched official ID even when usernames match", async () => {
    const f = await fixture();
    resolved.set("https://x.com/" + f.username, "different-account");
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("does not match");
    expect((await rows(f)).claims).toEqual([]);
    expect((await rows(f)).creators).toHaveLength(2);
  }, 60000);

  it("uses a pinned account ID through username changes without resolving a reused handle", async () => {
    const f = await fixture();
    await withWriteTransaction(async tx => { await tx.update(creators).set({ xProfileAccountId: f.provider }).where(eq(creators.id, f.targetId)); });
    resolved.set("https://x.com/" + f.username, "handle-new-owner");
    evidence.get(f.principal.userId)![0].username = "renamed_x";
    expect(await requestCreatorClaim(f.principal, f.input)).toMatchObject({ status: "claimed" });
    expect(external.lookup).not.toHaveBeenCalled();
    expect((await rows(f)).creators[0]).toMatchObject({ xProfileAccountId: f.provider, xProfileUrl: "https://x.com/renamed_x" });
  }, 60000);

  it("rejects duplicate attributions including legacy creators without usernames", async () => {
    const f = await fixture();
    const second = randomUUID(); ids.push(second);
    await withWriteTransaction(async tx => { await tx.insert(creators).values({ id: second, name: "Duplicate", avatarUrl: "/avatar.svg", xProfileUrl: "https://x.com/" + f.username }); });
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("multiple creator profiles");
    expect((await rows(f)).claims).toEqual([]);
  }, 60000);

  it("does not mistake a reused X username for the creator's pinned identity", async () => {
    const f = await fixture();
    await withWriteTransaction(async tx => { await tx.update(creators).set({ xProfileAccountId: "original-owner-" + f.provider }).where(eq(creators.id, f.targetId)); });
    expect(await findXCreatorCandidates({ providerAccountId: f.provider, username: f.username, profileUrl: "https://x.com/" + f.username })).toEqual([]);
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("does not match");
  }, 60000);

  it("merges an already-associated provisional X identity", async () => {
    const f = await fixture();
    await withWriteTransaction(async tx => { await tx.update(creators).set({ xProviderId: f.provider, xProfileAccountId: f.provider }).where(eq(creators.id, f.source.id)); });
    expect(await requestCreatorClaim(f.principal, f.input)).toMatchObject({ status: "claimed" });
    expect((await rows(f)).creators).toMatchObject([{ id: f.targetId, xProfileAccountId: f.provider }]);
  }, 60000);

  it("makes concurrent confirmations idempotent with one committed claim", async () => {
    const f = await fixture();
    const results = await Promise.all([requestCreatorClaim(f.principal, f.input), requestCreatorClaim(f.principal, f.input)]);
    expect(results.every(result => ["claimed", "already_owned"].includes(result.status))).toBe(true);
    expect((await rows(f)).claims).toHaveLength(1);
    expect((await rows(f)).creators).toHaveLength(1);
  }, 60000);

  it("replaces a legacy pending request with fresh confirmation while retaining history", async () => {
    const f = await fixture();
    await withWriteTransaction(async tx => { await tx.insert(creatorClaims).values({ requesterUserId: f.principal.userId, targetCreatorId: f.targetId, method: "manual", evidenceUrl: "https://portfolio.example", evidenceNote: "Legacy evidence provided for the creator profile." }); });
    expect(await requestCreatorClaim(f.principal, f.input)).toMatchObject({ status: "claimed" });
    expect((await rows(f)).claims.map(row => row.status).sort()).toEqual(["approved", "withdrawn"]);
  }, 60000);

  it("allows reports without X, but rejects manual claims and admin ownership approval", async () => {
    const f = await fixture();
    evidence.set(f.principal.userId, []);
    await expect(requestCreatorClaim(f.principal, { ...f.input, method: "manual" } as never)).rejects.toThrow();
    const id = await request(f);
    await expect(reviewCreatorOwnershipClaim(id, "approve")).rejects.toThrow("cannot approve ownership");
    expect(await reviewCreatorOwnershipClaim(id, "resolve", "We corrected the attribution.")).toEqual({ status: "resolved" });
    expect((await rows(f)).creators).toHaveLength(2);
    expect((await getOwnCreatorClaims(f.principal.userId)).items[0]).toMatchObject({ status: "resolved" });
  }, 60000);

  it("never transfers an already owned target", async () => {
    const f = await fixture();
    await withWriteTransaction(async tx => { await tx.update(creators).set({ ownerUserId: "another-owner-" + f.principal.userId }).where(eq(creators.id, f.targetId)); });
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("already has an owner");
    const id = await request(f);
    expect(await reviewCreatorOwnershipClaim(id, "resolve", "Contacted the existing owner.")).toEqual({ status: "resolved" });
    expect((await rows(f)).creators.find(row => row.id === f.targetId)?.ownerUserId).not.toBe(f.principal.userId);
  }, 60000);

  it("protects report history and blocks a claim until a pending report is withdrawn", async () => {
    const f = await fixture(); const other = await fixture(); const id = await request(f);
    await expect(changeOwnClaim(other.principal, id, "withdraw")).rejects.toThrow("unavailable");
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("Withdraw");
    await changeOwnClaim(f.principal, id, "withdraw");
    await changeOwnClaim(f.principal, id, "dismiss");
    expect((await getOwnCreatorClaims(f.principal.userId, { notifications: true })).items).toEqual([]);
    expect(await requestCreatorClaim(f.principal, f.input)).toMatchObject({ status: "claimed" });
  }, 60000);

  it("rejects hidden targets and inactive requesters", async () => {
    const f = await fixture();
    await withWriteTransaction(async tx => { await tx.update(creators).set({ handle: "dev-hidden" }).where(eq(creators.id, f.targetId)); });
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("unavailable");
    await withWriteTransaction(async tx => {
      await tx.update(creators).set({ handle: null }).where(eq(creators.id, f.targetId));
      await tx.update(profileAccounts).set({ status: "deleting" }).where(eq(profileAccounts.userId, f.principal.userId));
    });
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("not active");
  }, 60000);

  it("rolls back a failed merge without leaving ownership or a claim", async () => {
    const f = await fixture(); external.rollbackAfter = 2;
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("Forced rollback");
    expect((await rows(f)).claims).toEqual([]);
    expect((await rows(f)).creators).toHaveLength(2);
  }, 60000);

  it("rate limits repeated reports", async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++) { const id = await request(f); await changeOwnClaim(f.principal, id, "withdraw"); }
    await expect(request(f)).rejects.toThrow("five requests");
    expect((await rows(f)).claims).toHaveLength(5);
  }, 60000);
});
