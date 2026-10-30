import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

import { requireDatabase } from "@/db/client";
import { creators, creatorUsernameAliases, posts, profileAccounts } from "@/db/schema";
import { readPublicSitemap } from "./sitemap";

const enabled = process.env.RUN_SITEMAP_INTEGRATION === "1" && process.env.DATA_ENVIRONMENT === "preview";
describe.skipIf(!enabled)("live sitemap against isolated Preview rows", () => {
  const creatorIds = Array.from({ length: 4 }, () => randomUUID());
  const suffix = creatorIds[0].replaceAll("-", "").slice(0, 10);
  const username = `map_${suffix}`, devUsername = `devmap_${suffix}`, ownerUsername = `owner_${suffix}`;
  const postIds = Array.from({ length: 5 }, () => randomUUID());
  const prefix = `sitemap-${suffix}`;
  const owner = `sitemap-owner-${suffix}`;
  const urls = async () => (await readPublicSitemap()).map(entry => entry.url);
  const profile = (name: string) => `https://www.inspora.design/creators/${name}`;
  const design = (name: string) => `https://www.inspora.design/posts/${prefix}-${name}`;

  beforeAll(async () => {
    const db = requireDatabase();
    await db.insert(profileAccounts).values({ userId: owner, status: "active" });
    await db.insert(creators).values([
      { id: creatorIds[0], name: "Sitemap fixture", username, avatarUrl: "/brand/default-avatar.svg", recordOrigin: "preview" },
      { id: creatorIds[1], name: "Development fixture", username: devUsername, handle: " DEV-sitemap ", avatarUrl: "/brand/default-avatar.svg", recordOrigin: "preview" },
      { id: creatorIds[2], name: "Owned fixture", username: ownerUsername, ownerUserId: owner, avatarUrl: "/brand/default-avatar.svg", recordOrigin: "preview" },
      { id: creatorIds[3], name: "No current alias", username: `aliasless_${suffix}`, avatarUrl: "/brand/default-avatar.svg", recordOrigin: "preview" },
    ]);
    await db.insert(creatorUsernameAliases).values([
      { creatorId: creatorIds[0], username, isCurrent: true },
      { creatorId: creatorIds[0], username: `${username}_old`, isCurrent: false },
      { creatorId: creatorIds[1], username: devUsername, isCurrent: true },
      { creatorId: creatorIds[2], username: ownerUsername, isCurrent: true },
    ]);
    await db.insert(posts).values([
      { id: postIds[0], creatorId: creatorIds[0], slug: `${prefix}-published`, status: "published", publishedAt: new Date(Date.now() - 1000) },
      { id: postIds[1], creatorId: creatorIds[0], slug: `${prefix}-draft`, status: "draft", publishedAt: null },
      { id: postIds[2], creatorId: creatorIds[0], slug: `${prefix}-scheduled`, status: "published", publishedAt: new Date(Date.now() + 86400000) },
      { id: postIds[3], creatorId: creatorIds[0], slug: `${prefix}-archived`, status: "archived", publishedAt: new Date(Date.now() - 1000), archivedAt: new Date() },
      { id: postIds[4], creatorId: creatorIds[1], slug: `${prefix}-dev`, status: "published", publishedAt: new Date(Date.now() - 1000) },
    ].map(row => ({ ...row, title: "Sitemap test design", description: "Isolated sitemap fixture", category: "Web", sourceUrl: "https://example.com" })));
  }, 30000);

  afterAll(async () => {
    const db = requireDatabase();
    await db.delete(posts).where(inArray(posts.id, postIds));
    await db.delete(creators).where(inArray(creators.id, creatorIds));
    await db.delete(profileAccounts).where(eq(profileAccounts.userId, owner));
  }, 30000);

  it("includes current profiles and published work while excluding drafts, future work, aliases and dev fixtures", async () => {
    const result = await urls();
    expect(result).toContain(profile(username));
    expect(result).toContain(profile(ownerUsername));
    expect(result).toContain(design("published"));
    for (const name of ["draft", "scheduled", "archived", "dev"]) expect(result).not.toContain(design(name));
    for (const name of [devUsername, `${username}_old`, `aliasless_${suffix}`]) expect(result).not.toContain(profile(name));
  });

  it("tracks trash, restore, username changes and permanent deletion without generating another file", async () => {
    const db = requireDatabase();
    await db.update(creators).set({ trashedAt: new Date() }).where(eq(creators.id, creatorIds[0]));
    expect(await urls()).not.toContain(profile(username));
    expect(await urls()).not.toContain(design("published"));
    await db.update(creators).set({ trashedAt: null }).where(eq(creators.id, creatorIds[0]));
    expect(await urls()).toContain(design("published"));
    const renamed = `${username}_new`;
    await db.update(creatorUsernameAliases).set({ isCurrent: false }).where(eq(creatorUsernameAliases.creatorId, creatorIds[0]));
    await db.insert(creatorUsernameAliases).values({ creatorId: creatorIds[0], username: renamed, isCurrent: true });
    await db.update(creators).set({ username: renamed }).where(eq(creators.id, creatorIds[0]));
    const result = await urls();
    expect(result).toContain(profile(renamed));
    expect(result).not.toContain(profile(username));
    await db.delete(posts).where(eq(posts.creatorId, creatorIds[0]));
    await db.delete(creators).where(eq(creators.id, creatorIds[0]));
    const deleted = await urls();
    expect(deleted).not.toContain(profile(renamed));
    expect(deleted).not.toContain(design("published"));
  }, 30000);

  it("excludes a linked account while its closure is pending", async () => {
    await requireDatabase().update(profileAccounts).set({ status: "deleting" }).where(eq(profileAccounts.userId, owner));
    expect(await urls()).not.toContain(profile(ownerUsername));
  });

  it("includes a scheduled design once its publication time has arrived", async () => {
    const db = requireDatabase();
    await db.insert(posts).values({ id: postIds[2], creatorId: creatorIds[2], slug: `${prefix}-scheduled`, title: "Scheduled sitemap fixture", description: "Isolated fixture", category: "Web", sourceUrl: "https://example.com", status: "published", publishedAt: new Date(Date.now() - 1000) });
    expect(await urls()).toContain(design("scheduled"));
  });
});
