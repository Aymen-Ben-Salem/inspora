import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const external = vi.hoisted(() => ({ allowed: true, failCommit: false, deleteClerk: vi.fn(), getClerk: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: async () => { if (!external.allowed) throw new Error("Admin required"); return { userId: "purge-test-admin" }; } }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => ({ users: { deleteUser: external.deleteClerk, getUser: external.getClerk } }) }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/db/write-client", async original => {
  const actual = await original<typeof import("@/db/write-client")>();
  return { ...actual, withWriteTransaction: <T>(work: (tx: import("@/db/write-client").WriteTx) => Promise<T>) => actual.withWriteTransaction(async tx => { const value = await work(tx); if (external.failCommit) throw new Error("Forced rollback"); return value; }) };
});
import { requireDatabase } from "@/db/client";
import { withWriteTransaction } from "@/db/write-client";
import { adminAuditLogs, cleanupJobs, creators, creatorUsernameAliases, creatorClaims, profileAccounts, posts, postMedia, logos, logoMedia, websites, savedPosts, submissions, submissionPublicationAttempts } from "@/db/schema";
import { storeCreatorAvatar, deleteR2StorageKeys, getR2MediaAsset } from "@/storage/r2";
import { attemptCleanupKey } from "@/features/submissions/cleanup";
import { permanentlyDeleteCreator } from "./identity/permanent-delete";
import { restoreAdminCreator, trashAdminCreator } from "./identity/admin";
import { ensureCreatorForOwner } from "./identity";

describe.skipIf(process.env.RUN_CREATOR_IDENTITY_INTEGRATION !== "1" || process.env.DATA_ENVIRONMENT !== "preview")("permanent deletion in isolated Preview fixtures", () => {
  const ids: string[] = [], owners: string[] = [], keys: string[] = [], jobKeys: string[] = [], submissionIds: string[] = [];
  const db = requireDatabase();
  async function seed(options: { owner?: string; work?: boolean; trashed?: boolean } = {}) {
    const id = randomUUID(); ids.push(id);
    const username = `purge_${id.replaceAll("-", "").slice(0, 12)}`;
    if (options.owner) owners.push(options.owner);
    const row = await withWriteTransaction(async tx => {
      if (options.owner) await tx.insert(profileAccounts).values({ userId: options.owner }).onConflictDoNothing();
      const [created] = await tx.insert(creators).values({ id, name: username, username, avatarUrl: "/brand/default-avatar.svg", ownerUserId: options.owner, recordOrigin: "mirrored", trashedAt: options.trashed === false ? null : new Date() }).returning();
      await tx.insert(creatorUsernameAliases).values({ creatorId: id, username, isCurrent: true });
      if (options.work) await tx.insert(posts).values({ creatorId: id, slug: username.replaceAll("_", "-"), title: username, description: "Purge fixture", category: "Web", sourceUrl: "https://example.com", status: "draft" });
      return created;
    });
    return { row, input: { confirmation: username, expectedUpdatedAt: row.updatedAt.toISOString(), expectedWorkCount: options.work ? 1 : 0 } };
  }
  beforeEach(() => { external.allowed = true; external.failCommit = false; external.deleteClerk.mockReset().mockResolvedValue(undefined); external.getClerk.mockReset(); });
  afterAll(async () => {
    external.failCommit = false;
    await withWriteTransaction(async tx => {
      if (submissionIds.length) { await tx.delete(submissionPublicationAttempts).where(inArray(submissionPublicationAttempts.submissionId, submissionIds)); await tx.delete(submissions).where(inArray(submissions.id, submissionIds)); }
      if (ids.length) {
        await tx.delete(creatorClaims).where(inArray(creatorClaims.targetCreatorId, ids));
        await tx.delete(posts).where(inArray(posts.creatorId, ids)); await tx.delete(logos).where(inArray(logos.creatorId, ids)); await tx.delete(websites).where(inArray(websites.creatorId, ids));
        await tx.delete(creators).where(inArray(creators.id, ids)); await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.resourceId, ids));
      }
      if (owners.length) await tx.delete(profileAccounts).where(inArray(profileAccounts.userId, owners));
      if (jobKeys.length) await tx.delete(cleanupJobs).where(inArray(cleanupJobs.idempotencyKey, jobKeys));
    });
    await deleteR2StorageKeys(keys);
  });

  it("rejects non-admin requests, active creators, wrong confirmation and the current admin account", async () => {
    const active = await seed({ trashed: false });
    external.allowed = false;
    await expect(permanentlyDeleteCreator(active.row.id, active.input)).rejects.toThrow("Admin required");
    external.allowed = true;
    await expect(permanentlyDeleteCreator(active.row.id, active.input)).rejects.toThrow("Move this creator to Trash");
    const hidden = await seed();
    await expect(permanentlyDeleteCreator(hidden.row.id, { ...hidden.input, confirmation: "wrong" })).rejects.toThrow("exactly");
    const own = await seed({ owner: "purge-test-admin" });
    await expect(permanentlyDeleteCreator(own.row.id, own.input)).rejects.toThrow("currently using");
    expect(external.deleteClerk).not.toHaveBeenCalled();
  }, 60000);

  it("rejects stale confirmations and work counts without starting account closure", async () => {
    const fixture = await seed({ work: true, owner: `purge-owner-${randomUUID()}` });
    await expect(permanentlyDeleteCreator(fixture.row.id, { ...fixture.input, expectedWorkCount: 0 })).rejects.toThrow("work changed");
    expect((await db.query.profileAccounts.findFirst({ where: eq(profileAccounts.userId, fixture.row.ownerUserId!) }))?.status).toBe("active");
    await restoreAdminCreator(fixture.row.id); await trashAdminCreator(fixture.row.id);
    await expect(permanentlyDeleteCreator(fixture.row.id, fixture.input)).rejects.toThrow("creator changed");
  }, 60000);

  it("rolls back creator, work and account changes together if commit fails", async () => {
    const fixture = await seed({ work: true, owner: `purge-owner-${randomUUID()}` });
    external.failCommit = true;
    try { await expect(permanentlyDeleteCreator(fixture.row.id, fixture.input)).rejects.toThrow("Forced rollback"); }
    finally { external.failCommit = false; }
    expect(await db.query.creators.findFirst({ where: eq(creators.id, fixture.row.id) })).toBeDefined();
    expect(await db.select().from(posts).where(eq(posts.creatorId, fixture.row.id))).toHaveLength(1);
    expect((await db.query.profileAccounts.findFirst({ where: eq(profileAccounts.userId, fixture.row.ownerUserId!) }))?.status).toBe("active");
    expect(await db.select().from(cleanupJobs).where(eq(cleanupJobs.idempotencyKey, `account:${fixture.row.ownerUserId}`))).toHaveLength(0);
  }, 60000);

  it("deletes work and identity, preserves shared media, and retries failed Clerk deletion without recreating the profile", async () => {
    const owner = `purge-owner-${randomUUID()}`;
    const fixture = await seed({ owner }); const sharedOwner = await seed();
    const photo = await sharp({ create: { width: 512, height: 512, channels: 3, background: "blue" } }).webp().toBuffer();
    const own = await storeCreatorAvatar(photo), shared = await storeCreatorAvatar(photo);
    keys.push(own.storageKey, shared.storageKey);
    const designId = randomUUID(), logoId = randomUUID(), iconId = randomUUID(), siteId = randomUUID(), intakeId = randomUUID(); submissionIds.push(intakeId);
    await withWriteTransaction(async tx => {
      await tx.update(creators).set({ avatarUrl: own.url, avatarStorageProvider: "r2", avatarStorageKey: own.storageKey }).where(eq(creators.id, fixture.row.id));
      // Legacy pasted URLs can reference the same file without storage metadata.
      await tx.update(creators).set({ avatarUrl: shared.url }).where(eq(creators.id, sharedOwner.row.id));
      await tx.insert(posts).values({ id: designId, creatorId: fixture.row.id, slug: fixture.row.username!.replaceAll("_", "-"), title: "Design", description: "Fixture", category: "Web", sourceUrl: "https://example.com", status: "published", publishedAt: new Date(0) });
      await tx.insert(postMedia).values({ postId: designId, type: "image", url: shared.url, alt: "Fixture", width: 512, height: 512, position: 0, storageProvider: "r2", storageKey: shared.storageKey });
      await tx.insert(logos).values([logoId, iconId].map((id, i) => ({ id, creatorId: fixture.row.id, slug: fixture.row.username!.replaceAll("_", "-") + i, title: "Identity", kind: i ? "icon" : "logo", description: "Fixture", industry: "Design", shape: "Symbol", sourceUrl: "https://example.com", status: "draft" })));
      await tx.insert(logoMedia).values({ logoId, url: shared.url, alt: "Fixture", width: 512, height: 512, storageProvider: "r2", storageKey: shared.storageKey });
      await tx.insert(websites).values({ id: siteId, creatorId: fixture.row.id, slug: fixture.row.username!.replaceAll("_", "-"), title: "Website", tagline: "Fixture", description: "Fixture", sourceUrl: "https://example.com", status: "draft" });
      await tx.insert(savedPosts).values({ userId: owner, postId: designId });
      await tx.insert(creatorClaims).values({ requesterUserId: owner, targetCreatorId: fixture.row.id, method: "x", verifiedXProviderId: "12345", verifiedXUsername: "fixture", status: "withdrawn" });
      await tx.insert(submissions).values({ id: intakeId, ownerUserId: owner, creatorId: fixture.row.id, requestId: randomUUID(), kind: "design", sourceUrl: "https://example.com/fixture", sourceFingerprint: randomUUID(), status: "accepted", reviewedAt: new Date(), reviewedBy: "purge-test-admin", publishedKind: "design", publishedId: designId, publishedHref: `/posts/${fixture.row.username}` });
      await tx.insert(submissionPublicationAttempts).values({ submissionId: intakeId, actorId: "purge-test-admin", assets: [{ storageProvider: "r2", storageKey: shared.storageKey, type: "image" }], status: "attached", publishedKind: "design", publishedId: designId, publishedHref: `/posts/${fixture.row.username}` });
    });
    const latest = (await db.query.creators.findFirst({ where: eq(creators.id, fixture.row.id) }))!;
    const result = await permanentlyDeleteCreator(fixture.row.id, { ...fixture.input, expectedUpdatedAt: latest.updatedAt.toISOString(), expectedWorkCount: 4 }); jobKeys.push(...result.cleanupKeys);
    expect(await db.query.creators.findFirst({ where: eq(creators.id, fixture.row.id) })).toBeUndefined();
    expect(await db.select().from(creatorUsernameAliases).where(eq(creatorUsernameAliases.creatorId, fixture.row.id))).toHaveLength(0);
    for (const table of [posts, logos, websites]) expect(await db.select().from(table).where(eq(table.creatorId, fixture.row.id))).toHaveLength(0);
    expect(await db.select().from(savedPosts).where(eq(savedPosts.postId, designId))).toHaveLength(0);
    expect(await db.select().from(submissions).where(eq(submissions.id, intakeId))).toHaveLength(0);
    await expect(ensureCreatorForOwner({ userId: owner })).rejects.toThrow("not active");
    expect(external.getClerk).not.toHaveBeenCalled();
    external.deleteClerk.mockRejectedValueOnce(new Error("Clerk unavailable"));
    expect(await attemptCleanupKey(`account:${owner}`)).toBe("pending");
    expect((await db.query.profileAccounts.findFirst({ where: eq(profileAccounts.userId, owner) }))?.status).toBe("deleting");
    expect(await attemptCleanupKey(`account:${owner}`)).toBe("completed");
    expect(external.deleteClerk).toHaveBeenCalledWith(owner);
    for (const key of result.cleanupKeys.filter(key => !key.startsWith("account:"))) expect(await attemptCleanupKey(key)).toBe("completed");
    expect(await db.query.profileAccounts.findFirst({ where: eq(profileAccounts.userId, owner) })).toBeUndefined();
    await expect(getR2MediaAsset(own.storageKey)).rejects.toThrow();
    expect((await getR2MediaAsset(shared.storageKey)).bytes.length).toBeGreaterThan(0);
    expect((await db.select().from(adminAuditLogs).where(eq(adminAuditLogs.resourceId, fixture.row.id))).map(row => row.action)).toEqual(["creator.permanently_deleted"]);
  }, 90000);

  it("serializes Restore against Delete forever so a deleted creator cannot reappear", async () => {
    const fixture = await seed();
    const results = await Promise.allSettled([permanentlyDeleteCreator(fixture.row.id, fixture.input), restoreAdminCreator(fixture.row.id)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const retained = await db.query.creators.findFirst({ where: eq(creators.id, fixture.row.id) });
    expect(retained?.trashedAt ?? null).toBeNull();
  }, 60000);
});
