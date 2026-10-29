import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ deleteAssets: vi.fn(), rollbackAfter: 0, identities: new Map<string, { providerAccountId: string; username: string; profileUrl: string }>() }));
vi.mock("./identity/external-identity", () => ({ verifiedXIdentityForUser: vi.fn(async (userId: string) => external.identities.get(userId) ?? null) }));
vi.mock("@/storage/r2", async (importOriginal) => ({ ...await importOriginal<typeof import("@/storage/r2")>(), deleteR2MediaAssets: external.deleteAssets }));
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
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { getUser: async () => ({ fullName: "Owner", username: "owner" }) } }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ userId: "approval-fixture-admin" })) }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { adminAuditLogs, creatorClaims, creators, creatorUsernameAliases, profileAccounts, posts, logos, websites, submissions, savedPosts } from "@/db/schema";
import { revalidateTag, revalidatePath } from "next/cache";
import { withWriteTransaction } from "@/db/write-client";
import { resolvePublicCreatorProfile, updateOwnedCreatorProfile } from "./identity";
import { requestCreatorClaim } from "./identity/claim-requests";

const enabled = process.env.RUN_CREATOR_CLAIM_INTEGRATION === "1" &&
  ["development", "preview"].includes(process.env.DATA_ENVIRONMENT ?? "");

describe.skipIf(!enabled)("claim approval in isolated guarded nonproduction rows", () => {
  const creatorIds: string[] = [];
  const userIds: string[] = [];
  const workIds: string[] = [];

  async function fixture() {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const userId = `approval-${suffix}`;
    const targetId = randomUUID();
    const provisionalId = randomUUID();
    const providerId = `provider-${suffix}`;
    external.identities.set(userId, { providerAccountId: providerId, username: `x${suffix}`, profileUrl: `https://x.com/x${suffix}` });
    creatorIds.push(targetId, provisionalId);
    userIds.push(userId);
    await withWriteTransaction(async (tx) => {
      await tx.insert(profileAccounts).values({ userId });
      await tx.insert(creators).values([
        { id: targetId, name: "Target name", username: `target_${suffix}`, xProfileUrl: `https://x.com/x${suffix}`, xProfileAccountId: providerId, url: "https://target.example", avatarUrl: "/target.svg", recordOrigin: "editorial" },
        { id: provisionalId, name: "Owner name", username: `owner_${suffix}`, url: "https://owner.example", avatarUrl: "/owner.svg", recordOrigin: "user", ownerUserId: userId },
      ]);
      await tx.insert(creatorUsernameAliases).values([
        { creatorId: targetId, username: `target_${suffix}`, isCurrent: true },
        { creatorId: targetId, username: `target_old_${suffix}`, isCurrent: false },
        { creatorId: provisionalId, username: `owner_${suffix}`, isCurrent: true },
        { creatorId: provisionalId, username: `owner_old_${suffix}`, isCurrent: false },
      ]);
    });
    return { userId, targetId, provisionalId, providerId, suffix };
  }

  async function state(f: Awaited<ReturnType<typeof fixture>>) {
    return withWriteTransaction(async (tx) => ({
      creators: await tx.select().from(creators).where(inArray(creators.id, [f.targetId, f.provisionalId])).orderBy(creators.id),
      aliases: await tx.select().from(creatorUsernameAliases).where(inArray(creatorUsernameAliases.creatorId, [f.targetId, f.provisionalId])).orderBy(creatorUsernameAliases.id),
      claims: await tx.select().from(creatorClaims).where(eq(creatorClaims.requesterUserId, f.userId)),
      audits: await tx.select().from(adminAuditLogs).where(eq(adminAuditLogs.actorId, f.userId)),
    }));
  }

  beforeEach(() => { vi.clearAllMocks(); external.rollbackAfter = 0; external.deleteAssets.mockResolvedValue(undefined); });
  afterAll(async () => {
    await withWriteTransaction(async (tx) => {
      if (workIds.length) {
        await tx.delete(submissions).where(inArray(submissions.id, workIds));
        await tx.delete(posts).where(inArray(posts.id, workIds));
        await tx.delete(logos).where(inArray(logos.id, workIds));
        await tx.delete(websites).where(inArray(websites.id, workIds));
      }
      if (userIds.length) {
        await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.actorId, userIds));
        await tx.delete(creatorClaims).where(inArray(creatorClaims.requesterUserId, userIds));
      }
      if (creatorIds.length) await tx.delete(creators).where(inArray(creators.id, creatorIds));
      if (userIds.length) await tx.delete(profileAccounts).where(inArray(profileAccounts.userId, userIds));
    });
  });

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
    expect(await claim(f)).toEqual({ status: "claimed", creatorId: f.targetId });
    const saved = await state(f);
    expect(saved.creators).toHaveLength(1);
    expect(saved.creators[0]).toMatchObject({ id: f.targetId, name, username: `${username}_${f.suffix}`, url, ownerUserId: f.userId, xProviderId: f.providerId, recordOrigin: "editorial" });
    expect(saved.creators[0]!.editedFields.sort()).toEqual([...new Set(["websiteUrl", ...markers])].sort());
    expect(saved.aliases).toHaveLength(4);
    expect(saved.aliases.filter((alias) => alias.isCurrent)).toMatchObject([{ username: `${username}_${f.suffix}`, creatorId: f.targetId }]);
    for (const address of [`target_${f.suffix}`, `target_old_${f.suffix}`, `owner_${f.suffix}`, `owner_old_${f.suffix}`]) {
      expect(await resolvePublicCreatorProfile(address)).toMatchObject({ profile: { id: f.targetId }, canonicalUsername: `${username}_${f.suffix}`, isAlias: address !== `${username}_${f.suffix}` });
    }
    expect(saved.claims[0]).toMatchObject({ status: "approved", reviewedBy: null });
    expect(saved.audits).toHaveLength(1);
    expect(saved.audits[0]).toMatchObject({ action: "creator_claim.claimed_with_x", actorId: f.userId, details: { targetCreatorId: f.targetId, requesterUserId: f.userId } });
  }, 60000);


  const claim = (f: Awaited<ReturnType<typeof fixture>>) => requestCreatorClaim({ userId: f.userId }, { targetCreatorId: f.targetId, method: "x", confirmed: true });

  it("moves all reference kinds and preserves saved membership under concurrent confirmation", async () => {
    const f = await fixture(); const ids = await workFixture(f); const before = await workState(ids, f.userId);
    const results = await Promise.all([claim(f), claim(f)]);
    expect(results.every(result => ["claimed", "already_owned"].includes(result.status))).toBe(true);
    const after = await workState(ids, f.userId);
    for (const kind of ["design", "logo", "website", "submission"] as const) {
      expect(after[kind]).toEqual({ ...before[kind], creatorId: f.targetId, updatedAt: expect.any(Date) });
    }
    expect(after.saved).toEqual(before.saved);
    const saved = await state(f);
    expect(saved.creators).toHaveLength(1); expect(saved.claims).toHaveLength(1); expect(saved.audits).toHaveLength(1);
    expect(await claim(f)).toEqual({ status: "already_owned", creatorId: f.targetId });
    expect(await state(f)).toEqual(saved);
  }, 60000);

  it("rolls back aliases, work references, ownership and audit together", async () => {
    const f = await fixture(); const ids = await workFixture(f);
    const before = await state(f); const worksBefore = await workState(ids, f.userId);
    external.rollbackAfter = 2;
    await expect(claim(f)).rejects.toThrow("Forced failure before commit");
    expect(await state(f)).toEqual(before);
    expect(await workState(ids, f.userId)).toEqual(worksBefore);
    expect(external.deleteAssets).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  }, 60000);

  it("retains an explicit owner avatar and cleans the displaced target only after commit", async () => {
    const f = await fixture();
    await withWriteTransaction(async tx => {
      await tx.update(creators).set({ avatarUrl: "https://media.example/target.webp", avatarStorageProvider: "r2", avatarStorageKey: "creators/target.webp" }).where(eq(creators.id, f.targetId));
      await tx.update(creators).set({ avatarUrl: "https://media.example/owner.webp", avatarStorageProvider: "r2", avatarStorageKey: "creators/owner.webp", editedFields: ["avatarUrl"] }).where(eq(creators.id, f.provisionalId));
    });
    let committed = false;
    external.deleteAssets.mockImplementationOnce(async () => {
      committed = (await state(f)).claims[0]?.status === "approved";
      throw new Error("Storage unavailable");
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await claim(f)).toMatchObject({ status: "claimed" });
      expect(committed).toBe(true);
      expect(external.deleteAssets).toHaveBeenCalledWith([{ storageProvider: "r2", storageKey: "creators/target.webp", type: "image" }]);
      expect((await state(f)).creators[0]).toMatchObject({ avatarUrl: "https://media.example/owner.webp", name: "Target name" });
      expect(revalidateTag).toHaveBeenCalledWith("public-creator-profiles", { expire: 0 });
    } finally { errorLog.mockRestore(); }
  }, 60000);

  it("rejects a provisional creator associated with a different X identity without partial changes", async () => {
    const f = await fixture();
    await withWriteTransaction(async tx => { await tx.update(creators).set({ xProviderId: "different-" + f.suffix }).where(eq(creators.id, f.provisionalId)); });
    const before = await state(f);
    await expect(claim(f)).rejects.toThrow("saved X identity");
    expect(await state(f)).toEqual(before);
  }, 60000);

  it("serializes owner edits with claiming without losing explicit choices", async () => {
    const f = await fixture();
    const [result] = await Promise.all([
      claim(f),
      updateOwnedCreatorProfile({ userId: f.userId }, { name: "Concurrent owner edit", username: "chosen_" + f.suffix, websiteUrl: "" }),
    ]);
    expect(result).toMatchObject({ status: "claimed" });
    const saved = await state(f);
    expect(saved.creators).toMatchObject([{ id: f.targetId, name: "Concurrent owner edit", username: "chosen_" + f.suffix, url: null }]);
    expect(saved.aliases.filter(row => row.isCurrent)).toMatchObject([{ username: "chosen_" + f.suffix }]);
  }, 60000);
});
