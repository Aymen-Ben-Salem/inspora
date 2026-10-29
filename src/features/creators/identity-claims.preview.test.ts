import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ getUser: vi.fn(), rollbackAfter: 0 }));
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
import { getClaimReviewDetails } from "./identity/claim-review";

const enabled = process.env.RUN_CREATOR_CLAIM_INTEGRATION === "1" && process.env.DATA_ENVIRONMENT === "preview";
describe.skipIf(!enabled)("explicit creator claims in isolated Preview rows", () => {
  type Evidence = { provider: string; providerUserId: string; username: string; verification: { status: string } };
  const evidence = new Map<string, Evidence[]>();
  const users: string[] = [];
  const ids: string[] = [];
  async function fixture() {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const principal = { userId: "claim-flow-" + suffix };
    users.push(principal.userId);
    const provider = "provider-" + suffix;
    const username = "x" + suffix;
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
    const result = await requestCreatorClaim(f.principal, f.input);
    if (result.status !== "pending") throw new Error("Expected pending");
    return result.claimId;
  }
  beforeEach(() => {
    vi.clearAllMocks(); external.rollbackAfter = 0;
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

  it("never submits a claim from discovery or an edit-profile visit", async () => {
    const f = await fixture();
    expect(await requestCreatorOwnershipClaimFromVerifiedX(f.principal)).toEqual({ status: "no_match" });
    expect((await rows(f)).claims).toEqual([]);
  }, 60000);

  it("requires a deliberate confirmation and verified provider evidence", async () => {
    const f = await fixture();
    await expect(requestCreatorClaim(f.principal, { ...f.input, confirmed: false } as never)).rejects.toThrow();
    evidence.set(f.principal.userId, []);
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("Connect and verify");
    expect((await rows(f)).claims).toEqual([]);
  }, 60000);

  it("selects the requested profile even when multiple profiles share an X URL", async () => {
    const f = await fixture();
    const second = randomUUID(); ids.push(second);
    await withWriteTransaction(async (tx) => { await tx.insert(creators).values({ id: second, name: "Other matching creator", avatarUrl: "/avatar.svg", xProfileUrl: "https://x.com/" + f.username }); });
    const id = await request(f);
    expect((await rows(f)).claims).toMatchObject([{ id, targetCreatorId: f.targetId, status: "pending" }]);
    expect((await rows(f)).creators.find((row) => row.id === f.targetId)?.ownerUserId).toBeNull();
  }, 60000);

  it("allows an explicit later claim after X was already associated with the owner's profile", async () => {
    const f = await fixture();
    expect(await synchronizeOwnedXIdentity(f.principal)).toMatchObject({ status: "synced" });
    const id = await request(f);
    expect(await reviewCreatorOwnershipClaim(id, "approve")).toEqual({ status: "claimed", creatorId: f.targetId });
    expect((await rows(f)).creators).toMatchObject([{ id: f.targetId, ownerUserId: f.principal.userId, xProviderId: f.provider }]);
  }, 60000);

  it("deduplicates concurrent submissions and prevents another pending target", async () => {
    const f = await fixture();
    const result = await Promise.all([requestCreatorClaim(f.principal, f.input), requestCreatorClaim(f.principal, f.input)]);
    expect(result[0]).toEqual(result[1]); expect((await rows(f)).claims).toHaveLength(1);
    await expect(requestCreatorClaim(f.principal, { ...f.input, targetCreatorId: randomUUID() })).rejects.toThrow("pending request");
  }, 60000);

  it("withdraws only the owner's pending claim and preserves history when resubmitted", async () => {
    const f = await fixture(); const other = await fixture(); const id = await request(f);
    await expect(changeOwnClaim(other.principal, id, "withdraw")).rejects.toThrow("unavailable");
    await changeOwnClaim(f.principal, id, "withdraw");
    const next = await request(f); expect(next).not.toBe(id);
    expect((await rows(f)).claims.map((row) => row.status).sort()).toEqual(["pending", "withdrawn"]);
  }, 60000);

  it("makes rejection reasons visible and allows corrected evidence", async () => {
    const f = await fixture(); const id = await request(f);
    expect(await reviewCreatorOwnershipClaim(id, "reject", "Please provide the original portfolio.")).toEqual({ status: "rejected" });
    expect((await getOwnCreatorClaims(f.principal.userId, { notifications: true })).items[0]).toMatchObject({ id, reviewReason: "Please provide the original portfolio.", status: "rejected" });
    await changeOwnClaim(f.principal, id, "dismiss");
    expect((await getOwnCreatorClaims(f.principal.userId, { notifications: true })).items).toEqual([]);
    expect((await getOwnCreatorClaims(f.principal.userId)).items).toHaveLength(1);
    expect(await request(f)).not.toBe(id);
  }, 60000);

  it("blocks approval after X disconnect and exposes the required recovery", async () => {
    const f = await fixture(); const id = await request(f); evidence.set(f.principal.userId, []);
    expect(await reviewCreatorOwnershipClaim(id, "approve")).toMatchObject({ status: "conflict", message: expect.stringContaining("Reconnect") });
    expect((await getOwnCreatorClaims(f.principal.userId)).items[0]).toMatchObject({ status: "pending", attentionReason: expect.stringContaining("Reconnect") });
    expect((await rows(f)).creators).toHaveLength(2);
  }, 60000);

  it("rechecks the stable provider ID and saves a current X username on approval", async () => {
    const f = await fixture(); const id = await request(f);
    evidence.get(f.principal.userId)![0].username = "renamed_x";
    expect(await reviewCreatorOwnershipClaim(id, "approve")).toMatchObject({ status: "claimed" });
    expect((await rows(f)).creators[0]).toMatchObject({ xProviderId: f.provider, xProfileUrl: "https://x.com/renamed_x" });
  }, 60000);

  it("requires confirmation for a different connected X identity and retains ownership when disconnected", async () => {
    const f = await fixture(); await synchronizeOwnedXIdentity(f.principal);
    evidence.get(f.principal.userId)![0].providerUserId += "-new";
    evidence.get(f.principal.userId)![0].username = "new_x";
    expect(await synchronizeOwnedXIdentity(f.principal)).toMatchObject({ status: "confirm" });
    expect((await rows(f)).creators.find((row) => row.id === f.source.id)?.xProviderId).toBe(f.provider);
    expect(await synchronizeOwnedXIdentity(f.principal, true)).toMatchObject({ status: "synced" });
    evidence.set(f.principal.userId, []);
    expect(await synchronizeOwnedXIdentity(f.principal)).toMatchObject({ status: "disconnected" });
    expect((await rows(f)).creators.find((row) => row.id === f.source.id)).toMatchObject({ ownerUserId: f.principal.userId, xProviderId: f.provider + "-new" });
  }, 60000);

  it("refuses stale merge previews and changed target X evidence", async () => {
    const f = await fixture(); const id = await request(f); const preview = await getClaimReviewDetails(id);
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ name: "Changed creator" }).where(eq(creators.id, f.targetId)); });
    expect(await reviewCreatorOwnershipClaim(id, "approve", "", preview!.version)).toMatchObject({ status: "conflict", message: expect.stringContaining("Reload") });
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ xProfileUrl: "https://x.com/another" }).where(eq(creators.id, f.targetId)); });
    expect(await reviewCreatorOwnershipClaim(id, "approve")).toMatchObject({ status: "conflict", message: expect.stringContaining("link changed") });
  }, 60000);

  it("accepts manual evidence without granting a verified X identity", async () => {
    const f = await fixture(); evidence.set(f.principal.userId, []);
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ xProfileUrl: null }).where(eq(creators.id, f.targetId)); });
    const result = await requestCreatorClaim(f.principal, { targetCreatorId: f.targetId, method: "manual", confirmed: true, evidenceUrl: "https://portfolio.example/creator", evidenceNote: "My portfolio contains the original credited design." });
    if (result.status !== "pending") throw new Error("Expected pending");
    expect(await reviewCreatorOwnershipClaim(result.claimId, "approve", "Too short")).toMatchObject({ status: "conflict" });
    expect(await reviewCreatorOwnershipClaim(result.claimId, "approve", "Verified the original portfolio and the creator's established contact.")).toMatchObject({ status: "claimed" });
    expect((await rows(f)).creators[0]).toMatchObject({ ownerUserId: f.principal.userId, xProviderId: null });
  }, 60000);

  it("records ownership reports without allowing them to transfer an owned creator", async () => {
    const f = await fixture(); const other = await fixture();
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ ownerUserId: "separate-owner-" + other.principal.userId }).where(eq(creators.id, f.targetId)); });
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("already has an owner");
    const result = await requestCreatorClaim(f.principal, { targetCreatorId: f.targetId, method: "ownership_report", confirmed: true, evidenceUrl: "https://portfolio.example", evidenceNote: "The profile appears to be managed by the wrong account." });
    if (result.status !== "pending") throw new Error("Expected pending");
    expect(await reviewCreatorOwnershipClaim(result.claimId, "approve")).toMatchObject({ status: "conflict" });
    expect(await reviewCreatorOwnershipClaim(result.claimId, "resolve", "We investigated and contacted the established owner.")).toEqual({ status: "resolved" });
    expect((await rows(f)).creators.find((row) => row.id === f.targetId)?.ownerUserId).not.toBe(f.principal.userId);
  }, 60000);

  it("keeps profile links synchronized after a claim was approved", async () => {
    const f = await fixture(); const id = await request(f); await reviewCreatorOwnershipClaim(id, "approve");
    evidence.get(f.principal.userId)![0].username = "updated_x";
    expect(await synchronizeOwnedXIdentity(f.principal)).toMatchObject({ status: "synced" });
    expect((await rows(f)).creators[0]?.xProfileUrl).toBe("https://x.com/updated_x");
  }, 60000);

  it("rejects hidden development targets and inactive requesters", async () => {
    const f = await fixture();
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ handle: "dev-hidden" }).where(eq(creators.id, f.targetId)); });
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("unavailable");
    await withWriteTransaction(async (tx) => { await tx.update(profileAccounts).set({ status: "deleting" }).where(eq(profileAccounts.userId, f.principal.userId)); });
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("not active");
  }, 60000);

  it("rolls back failed submissions without leaving a pending claim", async () => {
    const f = await fixture(); external.rollbackAfter = 2;
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("Forced rollback");
    expect((await rows(f)).claims).toEqual([]);
  }, 60000);

  it("limits repeated resubmissions while retaining every decision", async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++) { const id = await request(f); await changeOwnClaim(f.principal, id, "withdraw"); }
    await expect(requestCreatorClaim(f.principal, f.input)).rejects.toThrow("five requests");
    expect((await rows(f)).claims).toHaveLength(5);
  }, 60000);
});
