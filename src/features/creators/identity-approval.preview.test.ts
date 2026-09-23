import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ deleteAssets: vi.fn(), rollbackNext: false }));
vi.mock("@/storage/r2", async (importOriginal) => ({ ...await importOriginal<typeof import("@/storage/r2")>(), deleteR2MediaAssets: external.deleteAssets }));
vi.mock("@/db/write-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/write-client")>();
  return { ...actual, withWriteTransaction: <T>(work: (tx: import("@/db/write-client").WriteTx) => Promise<T>) => {
    const rollback = external.rollbackNext;
    external.rollbackNext = false;
    return actual.withWriteTransaction(async (tx) => {
      const result = await work(tx);
      if (rollback) throw new Error("Forced failure before commit");
      return result;
    });
  } };
});
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ userId: "approval-fixture-admin" })) }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { adminAuditLogs, creatorClaims, creators, creatorUsernameAliases, profileAccounts, posts, logos, websites, submissions, savedPosts } from "@/db/schema";
import { revalidateTag, revalidatePath } from "next/cache";
import { withWriteTransaction } from "@/db/write-client";
import { reviewCreatorOwnershipClaim, resolvePublicCreatorProfile, updateOwnedCreatorProfile } from "./identity";
import { reviewCreatorClaimAction } from "../admin/creator-actions";

const enabled = process.env.RUN_CREATOR_CLAIM_INTEGRATION === "1" &&
  ["development", "preview"].includes(process.env.DATA_ENVIRONMENT ?? "");

describe.skipIf(!enabled)("claim approval in isolated guarded nonproduction rows", () => {
  const creatorIds: string[] = [];
  const userIds: string[] = [];
  const claimIds: string[] = [];
  const workIds: string[] = [];

  async function fixture() {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const userId = `approval-${suffix}`;
    const targetId = randomUUID();
    const provisionalId = randomUUID();
    const claimId = randomUUID();
    const providerId = `provider-${suffix}`;
    creatorIds.push(targetId, provisionalId);
    userIds.push(userId);
    claimIds.push(claimId);
    await withWriteTransaction(async (tx) => {
      await tx.insert(profileAccounts).values({ userId });
      await tx.insert(creators).values([
        { id: targetId, name: "Target name", username: `target_${suffix}`, url: "https://target.example", avatarUrl: "/target.svg", recordOrigin: "editorial" },
        { id: provisionalId, name: "Owner name", username: `owner_${suffix}`, url: "https://owner.example", avatarUrl: "/owner.svg", recordOrigin: "user", ownerUserId: userId },
      ]);
      await tx.insert(creatorUsernameAliases).values([
        { creatorId: targetId, username: `target_${suffix}`, isCurrent: true },
        { creatorId: targetId, username: `target_old_${suffix}`, isCurrent: false },
        { creatorId: provisionalId, username: `owner_${suffix}`, isCurrent: true },
        { creatorId: provisionalId, username: `owner_old_${suffix}`, isCurrent: false },
      ]);
      await tx.insert(creatorClaims).values({ id: claimId, requesterUserId: userId, targetCreatorId: targetId, verifiedXProviderId: providerId, verifiedXUsername: `x${suffix}` });
    });
    return { userId, targetId, provisionalId, claimId, providerId, suffix };
  }

  async function state(f: Awaited<ReturnType<typeof fixture>>) {
    return withWriteTransaction(async (tx) => ({
      creators: await tx.select().from(creators).where(inArray(creators.id, [f.targetId, f.provisionalId])).orderBy(creators.id),
      aliases: await tx.select().from(creatorUsernameAliases).where(inArray(creatorUsernameAliases.creatorId, [f.targetId, f.provisionalId])).orderBy(creatorUsernameAliases.id),
      claims: await tx.select().from(creatorClaims).where(eq(creatorClaims.id, f.claimId)),
      audits: await tx.select().from(adminAuditLogs).where(eq(adminAuditLogs.resourceId, f.claimId)),
    }));
  }

  beforeEach(() => { vi.clearAllMocks(); external.rollbackNext = false; external.deleteAssets.mockResolvedValue(undefined); });
  afterAll(async () => {
    await withWriteTransaction(async (tx) => {
      if (workIds.length) {
        await tx.delete(submissions).where(inArray(submissions.id, workIds));
        await tx.delete(posts).where(inArray(posts.id, workIds));
        await tx.delete(logos).where(inArray(logos.id, workIds));
        await tx.delete(websites).where(inArray(websites.id, workIds));
      }
      if (claimIds.length) {
        await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.resourceId, claimIds));
        await tx.delete(creatorClaims).where(inArray(creatorClaims.id, claimIds));
      }
      if (creatorIds.length) await tx.delete(creators).where(inArray(creators.id, creatorIds));
      if (userIds.length) await tx.delete(profileAccounts).where(inArray(profileAccounts.userId, userIds));
    });
  });

  it("refuses a provisional creator with a different verified provider without partial approval", async () => {
    const f = await fixture();
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ xProviderId: `different-${f.suffix}` }).where(eq(creators.id, f.provisionalId)); });
    const before = await state(f);
    expect(await reviewCreatorOwnershipClaim(f.claimId, "approve")).toEqual({ status: "conflict" });
    expect(await state(f)).toEqual(before);
  }, 60000);
  it("preserves an avatar-only owner edit and returns only the displaced target for external cleanup", async () => {
    const f = await fixture();
    await withWriteTransaction(async (tx) => {
      await tx.update(creators).set({ avatarUrl: "https://media.example/target.webp", avatarStorageProvider: "r2", avatarStorageKey: "creators/target.webp", editedFields: ["name"] }).where(eq(creators.id, f.targetId));
      await tx.update(creators).set({ avatarUrl: "https://media.example/owner.webp", avatarStorageProvider: "r2", avatarStorageKey: "creators/owner.webp", editedFields: ["avatarUrl"] }).where(eq(creators.id, f.provisionalId));
    });
    const outcome = await reviewCreatorOwnershipClaim(f.claimId, "approve");
    expect(outcome).toEqual({ status: "claimed", creatorId: f.targetId,
      displacedAvatarAssets: [{ storageProvider: "r2", storageKey: "creators/target.webp", type: "image" }] });
    expect((await state(f)).creators[0]).toMatchObject({ name: "Target name", username: `target_${f.suffix}`, url: "https://target.example", recordOrigin: "editorial", avatarUrl: "https://media.example/owner.webp", avatarStorageProvider: "r2", avatarStorageKey: "creators/owner.webp", editedFields: ["name", "avatarUrl"] });
    expect(external.deleteAssets).not.toHaveBeenCalled();
    expect(revalidateTag).toHaveBeenCalledWith("public-creator-profiles", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledTimes(4);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/creators");
    expect(await reviewCreatorOwnershipClaim(f.claimId, "approve")).toEqual({ status: "claimed", creatorId: f.targetId });
  }, 60000);

  it("runs review action cleanup after commit and preserves success when storage fails", async () => {
    const f = await fixture();
    await withWriteTransaction(async (tx) => {
      await tx.update(creators).set({ avatarStorageProvider: "r2", avatarStorageKey: "creators/displaced.webp" }).where(eq(creators.id, f.provisionalId));
    });
    let committedAtCleanup: Awaited<ReturnType<typeof state>> | undefined;
    external.deleteAssets.mockImplementationOnce(async () => {
      committedAtCleanup = await state(f);
      throw new Error("Storage unavailable");
    });
    const form = new FormData();
    form.set("claimId", f.claimId);
    form.set("decision", "approve");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(reviewCreatorClaimAction(form)).resolves.toBeUndefined();
      expect(external.deleteAssets).toHaveBeenCalledWith([{ storageProvider: "r2", storageKey: "creators/displaced.webp", type: "image" }]);
      expect(committedAtCleanup?.claims[0]?.status).toBe("approved");
      expect(committedAtCleanup?.creators).toHaveLength(1);
      expect(errorLog).toHaveBeenCalledWith("Managed media cleanup failed", expect.any(Error));
    } finally { errorLog.mockRestore(); }
  }, 60000);

  it("preserves owner addresses and all state when a legacy target has no canonical username", async () => {
    const f = await fixture();
    const ids = await workFixture(f);
    await withWriteTransaction(async (tx) => {
      await tx.delete(creatorUsernameAliases).where(eq(creatorUsernameAliases.creatorId, f.targetId));
      await tx.update(creators).set({ username: null }).where(eq(creators.id, f.targetId));
    });
    const before = await state(f);
    const referencesBefore = await workState(ids, f.userId);
    expect(await reviewCreatorOwnershipClaim(f.claimId, "approve")).toEqual({ status: "conflict" });
    expect(await state(f)).toEqual(before);
    expect(await workState(ids, f.userId)).toEqual(referencesBefore);
    for (const username of [`owner_${f.suffix}`, `owner_old_${f.suffix}`]) {
      expect(await resolvePublicCreatorProfile(username)).toMatchObject({ profile: { id: f.provisionalId }, canonicalUsername: `owner_${f.suffix}` });
    }
    expect(external.deleteAssets).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  }, 60000);

  async function workFixture(f: Awaited<ReturnType<typeof fixture>>) {
    const ids = { design: randomUUID(), logo: randomUUID(), website: randomUUID(), submission: randomUUID() };
    workIds.push(...Object.values(ids));
    await withWriteTransaction(async (tx) => {
      const common = { creatorId: f.provisionalId, title: "Approval fixture", description: "Fixture", sourceUrl: "https://example.com", publishedAt: new Date("2026-01-01T00:00:00Z") };
      await tx.insert(posts).values({ ...common, id: ids.design, slug: `approval-${f.suffix}`, category: "Web", status: "published" });
      await tx.insert(logos).values({ ...common, id: ids.logo, slug: `approval-${f.suffix}`, industry: "Design", shape: "Round", status: "draft" });
      await tx.insert(websites).values({ ...common, id: ids.website, slug: `approval-${f.suffix}`, tagline: "Fixture", status: "archived", archivedAt: new Date("2026-02-01T00:00:00Z") });
      await tx.insert(submissions).values({ id: ids.submission, creatorId: f.provisionalId, ownerUserId: f.userId, requestId: randomUUID(), kind: "design", sourceUrl: "https://example.com", sourceFingerprint: f.suffix, status: "accepted", reviewedBy: "fixture-admin", reviewedAt: new Date(), publishedKind: "design", publishedId: ids.design, publishedHref: `/posts/approval-${f.suffix}` });
      await tx.insert(savedPosts).values([{ userId: f.userId, postId: ids.design }, { userId: f.userId, logoId: ids.logo }, { userId: f.userId, websiteId: ids.website }]);
    });
    return ids;
  }

  async function workState(ids: Awaited<ReturnType<typeof workFixture>>, userId: string) {
    return withWriteTransaction(async (tx) => ({
      design: (await tx.select().from(posts).where(eq(posts.id, ids.design)))[0]!,
      logo: (await tx.select().from(logos).where(eq(logos.id, ids.logo)))[0]!,
      website: (await tx.select().from(websites).where(eq(websites.id, ids.website)))[0]!,
      submission: (await tx.select().from(submissions).where(eq(submissions.id, ids.submission)))[0]!,
      saved: await tx.select().from(savedPosts).where(eq(savedPosts.userId, userId)).orderBy(savedPosts.id),
    }));
  }

  it.each([
    { markers: [], name: "Target name", username: "target", url: "https://target.example" },
    { markers: ["name"], name: "Owner name", username: "target", url: "https://target.example" },
    { markers: ["username"], name: "Target name", username: "owner", url: "https://target.example" },
    { markers: ["websiteUrl"], name: "Target name", username: "target", url: null },
    { markers: ["name", "username", "websiteUrl", "avatarUrl"], name: "Owner name", username: "owner", url: null },
  ])("preserves explicit owner choices and both alias histories for $markers", async ({ markers, name, username, url }) => {
    const f = await fixture();
    await withWriteTransaction(async (tx) => {
      await tx.update(creators).set({ editedFields: markers, url: null, xProviderId: f.providerId }).where(eq(creators.id, f.provisionalId));
      await tx.update(creators).set({ editedFields: ["websiteUrl"] }).where(eq(creators.id, f.targetId));
    });
    expect(await reviewCreatorOwnershipClaim(f.claimId, "approve", " Reason ")).toEqual({ status: "claimed", creatorId: f.targetId });
    const saved = await state(f);
    expect(saved.creators).toHaveLength(1);
    expect(saved.creators[0]).toMatchObject({ id: f.targetId, name, username: `${username}_${f.suffix}`, url, ownerUserId: f.userId, xProviderId: f.providerId, recordOrigin: "editorial" });
    expect(saved.creators[0]!.editedFields.sort()).toEqual([...new Set(["websiteUrl", ...markers])].sort());
    expect(saved.aliases).toHaveLength(4);
    expect(saved.aliases.filter((alias) => alias.isCurrent)).toMatchObject([{ username: `${username}_${f.suffix}`, creatorId: f.targetId }]);
    for (const address of [`target_${f.suffix}`, `target_old_${f.suffix}`, `owner_${f.suffix}`, `owner_old_${f.suffix}`]) {
      expect(await resolvePublicCreatorProfile(address)).toMatchObject({ profile: { id: f.targetId }, canonicalUsername: `${username}_${f.suffix}`, isAlias: address !== `${username}_${f.suffix}` });
    }
    expect(saved.claims[0]).toMatchObject({ status: "approved", reviewReason: "Reason", reviewedBy: "approval-fixture-admin" });
    expect(saved.audits).toHaveLength(1);
    expect(saved.audits[0]).toMatchObject({ action: "creator_claim.approved", actorId: "approval-fixture-admin", details: { targetCreatorId: f.targetId, requesterUserId: f.userId } });
  }, 60000);

  it("moves all four reference kinds once while preserving publication, saved membership and submission workflow", async () => {
    const f = await fixture();
    const ids = await workFixture(f);
    const before = await workState(ids, f.userId);
    expect(await Promise.all([reviewCreatorOwnershipClaim(f.claimId, "approve"), reviewCreatorOwnershipClaim(f.claimId, "approve")])).toEqual([{ status: "claimed", creatorId: f.targetId }, { status: "claimed", creatorId: f.targetId }]);
    const after = await workState(ids, f.userId);
    for (const kind of ["design", "logo", "website", "submission"] as const) {
      expect(after[kind]).toEqual({ ...before[kind], creatorId: f.targetId, updatedAt: expect.any(Date) });
    }
    expect(after.saved).toEqual(before.saved);
    const saved = await state(f);
    expect(saved.audits).toHaveLength(1);
    expect(saved.creators).toHaveLength(1);
    vi.clearAllMocks();
    expect(await reviewCreatorOwnershipClaim(f.claimId, "approve")).toEqual({ status: "claimed", creatorId: f.targetId });
    expect(await reviewCreatorOwnershipClaim(f.claimId, "reject", "Too late")).toEqual({ status: "claimed", creatorId: f.targetId });
    expect(await state(f)).toEqual(saved);
    expect(await workState(ids, f.userId)).toEqual(after);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(external.deleteAssets).not.toHaveBeenCalled();
  }, 60000);

  it("rolls back aliases, all references, ownership, deletion and audit without cleanup or invalidation", async () => {
    const f = await fixture();
    const ids = await workFixture(f);
    await withWriteTransaction(async (tx) => { await tx.update(creators).set({ avatarStorageProvider: "r2", avatarStorageKey: "creators/displaced.webp" }).where(eq(creators.id, f.provisionalId)); });
    const before = await state(f);
    const worksBefore = await workState(ids, f.userId);
    external.rollbackNext = true;
    await expect(reviewCreatorOwnershipClaim(f.claimId, "approve")).rejects.toThrow("Forced failure before commit");
    expect(await state(f)).toEqual(before);
    expect(await workState(ids, f.userId)).toEqual(worksBefore);
    expect(external.deleteAssets).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  }, 60000);

  it("keeps a same-creator approval alive with its aliases, owner edits and avatar", async () => {
    const f = await fixture();
    await withWriteTransaction(async (tx) => {
      await tx.update(creatorClaims).set({ targetCreatorId: f.provisionalId }).where(eq(creatorClaims.id, f.claimId));
      await tx.update(creators).set({ editedFields: ["name"], avatarStorageProvider: "r2", avatarStorageKey: "creators/same.webp" }).where(eq(creators.id, f.provisionalId));
    });
    const before = await state(f);
    expect(await reviewCreatorOwnershipClaim(f.claimId, "approve")).toEqual({ status: "claimed", creatorId: f.provisionalId });
    const saved = await state(f);
    expect(saved.creators).toHaveLength(2);
    expect(saved.creators.find((row) => row.id === f.provisionalId)).toEqual({ ...before.creators.find((row) => row.id === f.provisionalId), xProviderId: f.providerId, xProfileUrl: `https://x.com/x${f.suffix}`, updatedAt: expect.any(Date) });
    expect(saved.aliases).toEqual(before.aliases);
    expect(saved.audits).toHaveLength(1);
    expect(external.deleteAssets).not.toHaveBeenCalled();
  }, 60000);

  it.each([false, true])("excludes a retained managed avatar even when shared by both creators (shared=%s)", async (shared) => {
    const f = await fixture();
    await withWriteTransaction(async (tx) => {
      await tx.update(creators).set({ avatarStorageProvider: "r2", avatarStorageKey: "creators/retained.webp" }).where(eq(creators.id, f.targetId));
      await tx.update(creators).set({ avatarStorageProvider: "r2", avatarStorageKey: shared ? "creators/retained.webp" : "creators/displaced.webp" }).where(eq(creators.id, f.provisionalId));
    });
    expect(await reviewCreatorOwnershipClaim(f.claimId, "approve")).toEqual({ status: "claimed", creatorId: f.targetId,
      ...(shared ? {} : { displacedAvatarAssets: [{ storageProvider: "r2", storageKey: "creators/displaced.webp", type: "image" }] }) });
    expect(external.deleteAssets).not.toHaveBeenCalled();
  }, 60000);

  it.each(["inactive", "missing-owner", "target-owner", "target-provider", "other-provider"])("refuses %s state without partial changes", async (conflict) => {
    const f = await fixture();
    await withWriteTransaction(async (tx) => {
      if (conflict === "inactive") await tx.update(profileAccounts).set({ status: "deleting" }).where(eq(profileAccounts.userId, f.userId));
      if (conflict === "missing-owner") await tx.update(creators).set({ ownerUserId: null }).where(eq(creators.id, f.provisionalId));
      if (conflict === "target-owner") await tx.update(creators).set({ ownerUserId: "other-" + f.suffix }).where(eq(creators.id, f.targetId));
      if (conflict === "target-provider") await tx.update(creators).set({ xProviderId: "other-" + f.suffix }).where(eq(creators.id, f.targetId));
      if (conflict === "other-provider") {
        const id = randomUUID(); creatorIds.push(id);
        await tx.insert(creators).values({ id, name: "Other identity", avatarUrl: "/other.svg", xProviderId: f.providerId });
      }
    });
    const before = await state(f);
    expect(await reviewCreatorOwnershipClaim(f.claimId, "approve")).toEqual({ status: "conflict" });
    expect(await state(f)).toEqual(before);
    expect(external.deleteAssets).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  }, 60000);

  it("serializes owner profile edits with approval without losing the explicit edit", async () => {
    const f = await fixture();
    const [approval, edit] = await Promise.all([
      reviewCreatorOwnershipClaim(f.claimId, "approve"),
      updateOwnedCreatorProfile({ userId: f.userId }, { name: "Concurrent owner edit", username: `chosen_${f.suffix}`, websiteUrl: "" }),
    ]);
    expect(approval).toEqual({ status: "claimed", creatorId: f.targetId });
    expect(edit).toMatchObject({ name: "Concurrent owner edit" });
    const saved = await state(f);
    expect(saved.creators).toHaveLength(1);
    expect(saved.creators[0]).toMatchObject({ id: f.targetId, name: "Concurrent owner edit", username: `chosen_${f.suffix}`, url: null });
    expect(saved.aliases.filter((row) => row.isCurrent)).toMatchObject([{ username: `chosen_${f.suffix}` }]);
    expect(saved.audits).toHaveLength(1);
  }, 60000);

  it("serializes account deactivation with approval to a valid merge or a controlled conflict", async () => {
    const f = await fixture();
    const before = await state(f);
    const [approval] = await Promise.all([
      reviewCreatorOwnershipClaim(f.claimId, "approve"),
      withWriteTransaction(async (tx) => {
        await tx.select().from(profileAccounts).where(eq(profileAccounts.userId, f.userId)).for("update");
        await tx.update(profileAccounts).set({ status: "deleting" }).where(eq(profileAccounts.userId, f.userId));
      }),
    ]);
    const saved = await state(f);
    if (approval.status === "conflict") expect(saved).toEqual(before);
    else {
      expect(approval).toEqual({ status: "claimed", creatorId: f.targetId });
      expect(saved.creators).toHaveLength(1);
      expect(saved.audits).toHaveLength(1);
    }
  }, 60000);

  it("returns one committed approval and a controlled conflict for competing provider associations", async () => {
    const first = await fixture();
    const second = await fixture();
    await withWriteTransaction(async (tx) => { await tx.update(creatorClaims).set({ verifiedXProviderId: first.providerId }).where(eq(creatorClaims.id, second.claimId)); });
    const outcomes = await Promise.all([reviewCreatorOwnershipClaim(first.claimId, "approve"), reviewCreatorOwnershipClaim(second.claimId, "approve")]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["claimed", "conflict"]);
    for (const [index, f] of [first, second].entries()) {
      const saved = await state(f);
      expect(saved.creators).toHaveLength(outcomes[index]!.status === "claimed" ? 1 : 2);
      expect(saved.audits).toHaveLength(outcomes[index]!.status === "claimed" ? 1 : 0);
      expect(saved.claims[0]?.status).toBe(outcomes[index]!.status === "claimed" ? "approved" : "pending");
    }
  }, 60000);

  it("establishes the chosen canonical reservation when a legacy target lacks its current alias", async () => {
    const f = await fixture();
    await withWriteTransaction(async (tx) => { await tx.delete(creatorUsernameAliases).where(eq(creatorUsernameAliases.username, `target_${f.suffix}`)); });
    expect(await reviewCreatorOwnershipClaim(f.claimId, "approve")).toEqual({ status: "claimed", creatorId: f.targetId });
    const saved = await state(f);
    expect(saved.aliases.filter((row) => row.isCurrent)).toMatchObject([{ username: `target_${f.suffix}`, creatorId: f.targetId }]);
    expect(await resolvePublicCreatorProfile(`owner_old_${f.suffix}`)).toMatchObject({ canonicalUsername: `target_${f.suffix}`, isAlias: true });
  }, 60000);

  it("returns a controlled conflict for a missing claim without side effects", async () => {
    expect(await reviewCreatorOwnershipClaim(randomUUID(), "approve")).toEqual({ status: "conflict" });
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(external.deleteAssets).not.toHaveBeenCalled();
  }, 60000);
});
