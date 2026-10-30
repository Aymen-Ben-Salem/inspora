import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ allowed: true }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: async () => {
  if (!auth.allowed) throw new Error("Admin access required");
  return { userId: "creator-trash-test-admin" };
} }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { requireDatabase } from "@/db/client";
import { withWriteTransaction } from "@/db/write-client";
import { adminAuditLogs, creatorUsernameAliases, creators, logos, logoMedia, posts, postMedia, savedPosts, websites, websiteMedia } from "@/db/schema";
import { getAdminCreatorDirectory, getAdminCreatorOptions, trashAdminCreator, restoreAdminCreator, saveAdminCreatorForAttribution } from "./identity/admin";
import { getCreatorSummary, resolvePublicCreatorProfile } from "./identity";
import { visibleClaimTarget } from "./identity/claim-requests";
import { readWorkPage, readWorkCounts, readWorkIdentities } from "@/data/public-work";
import { getPostBySlug } from "@/data/posts-repository";
import { getPublishedLogoAsset } from "@/data/logos-repository";
import { getPublishedWebsiteAsset } from "@/data/websites-repository";
import { savePostForUser } from "@/data/saved-posts-repository";

const enabled = process.env.RUN_CREATOR_IDENTITY_INTEGRATION === "1" && process.env.DATA_ENVIRONMENT === "preview";
describe.skipIf(!enabled)("reversible creator Trash in isolated Preview rows", () => {
  const id = randomUUID(), post = randomUUID(), draft = randomUUID(), logo = randomUUID(), website = randomUUID();
  const username = "trash_" + id.replaceAll("-", "").slice(0, 10), previous = username + "_old", owner = "trash-owner-" + id;
  const slug = username.replaceAll("_", "-");
  const creatorScope = { kind: "creator", creatorId: id } as const;
  const savedScope = { kind: "saved", userId: owner } as const;
  const image = "/brand/default-avatar.svg";
  let original: typeof creators.$inferSelect;

  beforeAll(async () => {
    await withWriteTransaction(async tx => {
      [original] = await tx.insert(creators).values({ id, name: username, username, avatarUrl: image, ownerUserId: owner, xProviderId: "trash-x-" + id, recordOrigin: "mirrored" }).returning();
      await tx.insert(creatorUsernameAliases).values([{ creatorId: id, username, isCurrent: true }, { creatorId: id, username: previous, isCurrent: false }]);
      await tx.insert(posts).values([post, draft].map((workId, i) => ({ id: workId, creatorId: id, slug: slug + (i ? "-draft" : "-design"), title: username, description: "Temporary Trash integration fixture", category: "Web", sourceUrl: "https://example.com", status: i ? "draft" : "published", publishedAt: i ? null : new Date(0), createdAt: new Date("2099-01-01") })));
      await tx.insert(postMedia).values({ postId: post, type: "image", url: image, alt: "Fixture", width: 400, height: 400, position: 0 });
      await tx.insert(logos).values({ id: logo, creatorId: id, slug: slug + "-icon", title: username, kind: "icon", description: "Fixture", industry: "Design", shape: "Symbol", sourceUrl: "https://example.com", status: "published", publishedAt: new Date(0) });
      await tx.insert(logoMedia).values({ logoId: logo, url: image, alt: "Fixture", width: 400, height: 400 });
      await tx.insert(websites).values({ id: website, creatorId: id, slug: slug + "-website", title: username, tagline: "Fixture", description: "Fixture", sourceUrl: "https://example.com", status: "published", publishedAt: new Date(0) });
      await tx.insert(websiteMedia).values([
        { websiteId: website, role: "recording", url: "/fixture.mp4", posterUrl: image, videoPreview: { url: "/preview.mp4", storageKey: "websites/fixture.mp4", width: 400, height: 400, bytes: 1000, format: "mp4" }, width: 400, height: 400 },
        { websiteId: website, role: "favicon", url: image, width: 32, height: 32 },
      ]);
      await tx.insert(savedPosts).values([{ userId: owner, postId: post }, { userId: owner, logoId: logo }, { userId: owner, websiteId: website }]);
    });
  });
  afterAll(async () => {
    auth.allowed = true;
    await withWriteTransaction(async tx => {
      await tx.delete(savedPosts).where(eq(savedPosts.userId, owner));
      await tx.delete(posts).where(inArray(posts.id, [post, draft]));
      await tx.delete(logos).where(eq(logos.id, logo));
      await tx.delete(websites).where(eq(websites.id, website));
      await tx.delete(adminAuditLogs).where(eq(adminAuditLogs.resourceId, id));
      await tx.delete(creators).where(eq(creators.id, id));
    });
  });

  it("requires admin authority for both Trash and Restore", async () => {
    auth.allowed = false;
    try {
      await expect(trashAdminCreator(id)).rejects.toThrow("Admin access required");
      await expect(restoreAdminCreator(id)).rejects.toThrow("Admin access required");
    } finally { auth.allowed = true; }
    expect((await requireDatabase().query.creators.findFirst({ where: eq(creators.id, id) }))?.trashedAt).toBeNull();
  });

  it("hides and restores an owned imported creator across profiles, feeds, direct work, bookmarks and claims without deleting data", async () => {
    const db = requireDatabase();
    expect(await resolvePublicCreatorProfile(username)).not.toBeNull();
    expect((await readWorkIdentities({ scope: creatorScope })).length).toBe(3);
    expect((await readWorkCounts({ scope: savedScope })).total).toBe(3);
    await trashAdminCreator(id);
    await trashAdminCreator(id); // Idempotent retries must not create duplicate lifecycle events.
    const hidden = (await db.query.creators.findFirst({ where: eq(creators.id, id) }))!;
    expect(hidden.trashedAt).toBeInstanceOf(Date);
    expect({ ...hidden, trashedAt: null, updatedAt: original.updatedAt }).toEqual(original);
    expect(visibleClaimTarget(hidden)).toBe(false);
    expect(await getCreatorSummary(id)).toBeNull();
    expect((await getAdminCreatorOptions()).some(c => c.id === id)).toBe(false);
    await expect(withWriteTransaction(tx => saveAdminCreatorForAttribution(tx, { userId: "creator-trash-test-admin" }, { id, name: username, avatarUrl: image }))).rejects.toThrow("Restore this creator from Trash");
    for (const route of [username, previous]) expect(await resolvePublicCreatorProfile(route)).toBeNull();
    expect((await getAdminCreatorDirectory({ query: username })).items).toHaveLength(0);
    expect((await getAdminCreatorDirectory({ query: username, trash: true })).items.map(c => c.id)).toEqual([id]);
    expect(await readWorkIdentities({ scope: creatorScope })).toEqual([]);
    expect((await readWorkPage({ scope: creatorScope, order: "publication-desc" })).items).toEqual([]);
    expect((await readWorkPage({ scope: savedScope, order: "saved-desc" })).items).toEqual([]);
    expect((await readWorkCounts({ scope: savedScope })).total).toBe(0);
    expect((await readWorkPage({ scope: { kind: "design-archive" }, order: "created-desc" })).items.some(w => w.id === post)).toBe(false);
    expect((await readWorkPage({ scope: { kind: "logo-archive" }, order: "created-desc" })).items.some(w => w.id === logo)).toBe(false);
    expect((await readWorkPage({ scope: { kind: "website-archive" }, order: "publication-desc" })).items.some(w => w.id === website)).toBe(false);
    expect(await getPostBySlug(slug + "-design")).toBeNull();
    expect(await getPublishedLogoAsset(logo)).toBeUndefined();
    expect(await getPublishedWebsiteAsset(website)).toBeNull();
    await expect(savePostForUser("another-viewer", post)).rejects.toThrow();
    expect(await db.select().from(savedPosts).where(eq(savedPosts.userId, owner))).toHaveLength(3);

    await restoreAdminCreator(id);
    await restoreAdminCreator(id);
    expect((await resolvePublicCreatorProfile(previous))?.canonicalUsername).toBe(username);
    expect((await readWorkIdentities({ scope: creatorScope })).length).toBe(3);
    expect((await readWorkCounts({ scope: savedScope })).total).toBe(3);
    expect((await readWorkPage({ scope: { kind: "design-archive" }, order: "created-desc" })).items.some(w => w.id === post)).toBe(true);
    expect((await readWorkPage({ scope: { kind: "logo-archive" }, order: "created-desc" })).items.some(w => w.id === logo)).toBe(true);
    expect((await readWorkPage({ scope: { kind: "website-archive" }, order: "publication-desc" })).items.some(w => w.id === website)).toBe(true);
    expect(await getPostBySlug(slug + "-design")).not.toBeNull();
    expect(await getPublishedLogoAsset(logo)).toBeDefined();
    expect(await getPublishedWebsiteAsset(website)).not.toBeNull();
    expect((await db.query.posts.findFirst({ where: eq(posts.id, draft) }))?.status).toBe("draft");
    expect((await db.query.creators.findFirst({ where: eq(creators.id, id) }))?.ownerUserId).toBe(owner);
    expect((await db.select().from(adminAuditLogs).where(eq(adminAuditLogs.resourceId, id))).map(e => e.action).sort()).toEqual(["creator.restored", "creator.trashed"]);
  }, 60000);
});
