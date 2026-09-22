import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPreviewEnvironment } from "../../../scripts/lib/preview-environment";
import { requireDatabase, getDatabase, type Database } from "@/db/client";
import * as schema from "@/db/schema";
import { POST_CATEGORIES } from "@/domain/post";
import { SAVED_CATEGORIES, type SavedCategory } from "@/domain/saved-post";
import type { WorkCardData } from "@/domain/work-card";
import { readWorkCounts, readWorkPage } from "./index";
import { getSavedPostCounts, getSavedPostIdsForUser, getSavedPostPage } from "../saved-posts-repository";
import { websiteFixture } from "./testing/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ requireDatabase: vi.fn(), getDatabase: vi.fn() }));
vi.mock("./clock", () => ({ evaluationTime: () => new Date("2099-01-01T00:00:00Z") }));
const now = new Date("2099-01-01T00:00:00Z");
const suite = process.env.RUN_PREVIEW_PUBLIC_WORK === "1" ? describe : describe.skip;

suite("Preview eligible saved work", () => {
  const owners = [randomUUID(), randomUUID()];
  const userId = "saved-fixture-" + randomUUID();
  const otherUser = "saved-fixture-" + randomUUID();
  const scope = { kind: "saved", userId } as const;
  // Forty-two valid mixed entries; tied bookmarks deliberately use an order
  // unrelated to work IDs or publication dates. Incomplete websites lead each group.
  const fixtures = Array.from({ length: 56 }, (_, i) => ({
    id: randomUUID(), bookmarkId: randomUUID(),
    kind: i % 4 === 0 ? "incomplete" : i % 4 === 1 ? "post" : i % 4 === 2 ? "logo" : "website",
    category: POST_CATEGORIES[Math.floor(i / 4) % POST_CATEGORIES.length],
    createdAt: new Date(now.getTime() - Math.floor(i / 4) * 1000 + (i % 4 === 0 ? 100 : 0)),
  }));
  const expected = fixtures.filter(f => f.kind !== "incomplete").sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime() || b.bookmarkId.localeCompare(a.bookmarkId));
  const extraIds = Array.from({ length: 5 }, () => randomUUID());
  const postIds = [...fixtures.filter(f => f.kind === "post").map(f => f.id), ...extraIds];
  const logoIds = fixtures.filter(f => f.kind === "logo").map(f => f.id);
  const websiteIds = fixtures.filter(f => f.kind === "website" || f.kind === "incomplete").map(f => f.id);
  let db: Database;
  let client: NeonQueryFunction<false, false>;
  const statements: string[] = [];

  beforeAll(async () => {
    const preview = loadPreviewEnvironment();
    client = neon(preview.databaseUrl);
    db = drizzle({ client, schema, logger: { logQuery(query) { statements.push(query); } } });
    vi.mocked(requireDatabase).mockReturnValue(db);
    vi.mocked(getDatabase).mockReturnValue(db);
    await db.insert(schema.creators).values(owners.map((id, i) => ({ id, name: `Saved creator ${i}`, avatarUrl: "/avatar.svg", recordOrigin: "preview" })));
    await db.insert(schema.posts).values(fixtures.filter(f => f.kind === "post").map((f, i) => ({
      id: f.id, creatorId: owners[i % 2], slug: "saved-design-" + f.id, title: "Saved design", description: "Ticket 03",
      category: f.category, sourceUrl: "https://example.invalid", status: "published", publishedAt: now,
    })));
    await db.insert(schema.posts).values(extraIds.map((id, i) => ({
      id, creatorId: owners[0], slug: "saved-boundary-" + id, title: "Boundary", description: "Ticket 03", category: "Web",
      sourceUrl: "https://example.invalid", status: i === 0 ? "draft" : i === 1 ? "archived" : "published",
      archivedAt: i === 1 ? now : null,
      publishedAt: i === 0 ? null : new Date(now.getTime() + (i === 2 ? 1 : i === 3 ? -1 : 0)),
    })));
    await db.insert(schema.postMedia).values(postIds.flatMap(postId => [
      { postId, type: "image", url: "/second.webp", alt: "Second", width: 100, height: 100, position: 1 },
      { postId, type: "image", url: "/first.webp", alt: "First", width: 100, height: 100, position: 0 },
    ]));
    await db.insert(schema.logos).values(logoIds.map((id, i) => ({
      id, creatorId: owners[i % 2], slug: "saved-logo-" + id, title: "Saved identity", kind: i % 2 ? "icon" : "logo",
      description: "Ticket 03", industry: "Design", shape: "Symbol", sourceUrl: "https://example.invalid", status: "published", publishedAt: now,
    })));
    await db.insert(schema.logoMedia).values(logoIds.map(logoId => ({ logoId, url: "/logo.webp", alt: "Logo", width: 100, height: 100 })));
    await db.insert(schema.websites).values(websiteIds.map((id, i) => ({
      id, creatorId: owners[i % 2], slug: "saved-website-" + id, title: "Saved website", tagline: "Fixture", description: "Ticket 03",
      sourceUrl: "https://example.invalid", status: "published", publishedAt: now,
    })));
    await db.insert(schema.websiteMedia).values(fixtures.filter(f => websiteIds.includes(f.id)).flatMap(f => [
      { websiteId: f.id, role: "recording", url: "/recording.webm", posterUrl: f.kind === "incomplete" ? "" : "/poster.webp", videoPreview: websiteFixture().media[0].videoPreview, width: 100, height: 100 },
      { websiteId: f.id, role: "favicon", url: "/favicon.webp", width: 32, height: 32 },
      { websiteId: f.id, role: "full_page", url: "/legacy.webp", width: 100, height: 100 },
    ]));
    await db.insert(schema.websiteSections).values(websiteIds.flatMap(websiteId => [
      { websiteId, label: "Second", position: 1, imageUrl: "/second.webp", imageWidth: 100, imageHeight: 100 },
      { websiteId, label: "First", position: 0, imageUrl: "/first.webp", imageWidth: 100, imageHeight: 100 },
    ]));
    await db.insert(schema.savedPosts).values(fixtures.map(f => ({
      id: f.bookmarkId, userId, createdAt: f.createdAt,
      postId: f.kind === "post" ? f.id : null,
      logoId: f.kind === "logo" ? f.id : null,
      websiteId: f.kind === "website" || f.kind === "incomplete" ? f.id : null,
    })));
    await db.insert(schema.savedPosts).values(extraIds.map(postId => ({ userId: otherUser, postId, createdAt: now })));
  }, 60000);
  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.savedPosts).where(inArray(schema.savedPosts.userId, [userId, otherUser]));
    await db.delete(schema.posts).where(inArray(schema.posts.id, postIds));
    await db.delete(schema.logos).where(inArray(schema.logos.id, logoIds));
    await db.delete(schema.websites).where(inArray(schema.websites.id, websiteIds));
    await db.delete(schema.creators).where(inArray(schema.creators.id, owners));
  }, 30000);

  async function traverse(category?: SavedCategory) {
    const items: WorkCardData[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const before = statements.length;
      const page = await readWorkPage({ scope, filters: { category }, order: "saved-desc", cursor });
      expect(statements.length).toBe(before + 1);
      if (page.nextCursor) expect(page.items).toHaveLength(16);
      items.push(...page.items);
      cursor = page.nextCursor;
      expect(++pages).toBeLessThan(10);
    } while (cursor);
    expect(cursor).toBeNull();
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
    return { items, pages };
  }

  it("traverses full mixed pages with one statement, no gaps, stable bookmark order, usable payloads and count parity", async () => {
    const { items, pages } = await traverse();
    expect(pages).toBe(3);
    expect(items.map(item => item.id)).toEqual(expected.map(f => f.id));
    const before = statements.length;
    expect(await readWorkCounts({ scope })).toEqual({ total: 42, categories: {
      Web: 2, Branding: 2, Product: 2, Motion: 2, Illustration: 2, "3D": 2, Print: 2, Logos: 14, Websites: 14,
    } });
    expect(statements.length).toBe(before + 1);
    expect(statements.at(-1)).not.toMatch(/lateral|limit/i);
    for (const item of items) {
      if (item.kind === "website") expect(item.website).toMatchObject({ recording: { posterUrl: "/poster.webp" }, sections: [{ label: "First" }, { label: "Second" }] });
      else if (item.kind === "logo") expect(item.logo.media.url).toBe("/logo.webp");
      else expect(item).toMatchObject({ mediaCount: 2, media: [{ url: "/first.webp" }] });
    }
    expect(await getSavedPostCounts(userId)).toEqual(await readWorkCounts({ scope }));
  }, 30000);

  it.each(SAVED_CATEGORIES)("keeps %s pages and direct filtered counts consistent", async category => {
    const { items } = await traverse(category);
    const wanted = expected.filter(f => (f.kind === "logo" ? "Logos" : f.kind === "website" ? "Websites" : f.category) === category);
    expect(items.map(item => item.id)).toEqual(wanted.map(f => f.id));
    expect(await readWorkCounts({ scope, filters: { category } })).toEqual({ total: wanted.length, categories: { [category]: wanted.length } });
    if (category === "Logos") expect(items.filter(item => item.kind === "logo" && item.logo.kind === "icon")).toHaveLength(7);
  }, 30000);

  it("isolates users and applies publication boundaries, then observes fixture publication transitions", async () => {
    const otherScope = { kind: "saved", userId: otherUser } as const;
    const page = await readWorkPage({ scope: otherScope, order: "saved-desc" });
    expect(new Set(page.items.map(item => item.id))).toEqual(new Set(extraIds.slice(3)));
    expect(await readWorkCounts({ scope: otherScope })).toEqual({ total: 2, categories: { Web: 2 } });
    try {
      await db.update(schema.posts).set({ publishedAt: now }).where(eq(schema.posts.id, extraIds[2]));
      expect((await readWorkCounts({ scope: otherScope })).total).toBe(3);
      expect((await readWorkPage({ scope: otherScope, order: "saved-desc" })).items.map(item => item.id)).toContain(extraIds[2]);
      const first = await readWorkPage({ scope, order: "saved-desc" });
      const before = statements.length;
      await expect(readWorkPage({ scope: otherScope, order: "saved-desc", cursor: first.nextCursor })).rejects.toThrow(/cursor/i);
      expect(statements.length).toBe(before);
    } finally {
      await db.update(schema.posts).set({ publishedAt: new Date(now.getTime() + 1) }).where(eq(schema.posts.id, extraIds[2]));
    }
  }, 30000);

  it.each(["post", "logo", "website"] as const)("observes %s publication changes without modifying bookmarks", async kind => {
    const target = expected.find(f => f.kind === kind)!;
    const table = kind === "post" ? schema.posts : kind === "logo" ? schema.logos : schema.websites;
    try {
      for (const offset of [-1, 0, 1]) {
        await db.update(table).set({ publishedAt: new Date(now.getTime() + offset) }).where(eq(table.id, target.id));
        expect((await readWorkCounts({ scope })).total).toBe(offset > 0 ? 41 : 42);
        expect((await traverse()).items.some(item => item.id === target.id)).toBe(offset <= 0);
      }
      for (const status of ["draft", "archived"]) {
        await db.update(table).set({ status, publishedAt: now, archivedAt: status === "archived" ? now : null }).where(eq(table.id, target.id));
        expect((await readWorkCounts({ scope })).total).toBe(41);
        expect((await traverse()).items.some(item => item.id === target.id)).toBe(false);
      }
      expect(await getSavedPostIdsForUser(userId, [target.id])).toEqual([target.id]);
    } finally {
      await db.update(table).set({ status: "published", publishedAt: now, archivedAt: null }).where(eq(table.id, target.id));
    }
  }, 30000);

  it("hides an incomplete website without removing membership and repairs its original saved position", async () => {
    const target = expected.find(f => f.kind === "website")!;
    try {
      await db.update(schema.websiteSections).set({ imageUrl: "" }).where(eq(schema.websiteSections.websiteId, target.id));
      expect((await traverse()).items.map(item => item.id)).toEqual(expected.filter(f => f.id !== target.id).map(f => f.id));
      expect((await getSavedPostCounts(userId)).total).toBe(41);
      expect(await getSavedPostIdsForUser(userId, [target.id])).toEqual([target.id]);
    } finally {
      await db.update(schema.websiteSections).set({ imageUrl: "/repaired.webp" }).where(eq(schema.websiteSections.websiteId, target.id));
    }
    expect((await traverse()).items.map(item => item.id)).toEqual(expected.map(f => f.id));
    expect((await getSavedPostCounts(userId)).total).toBe(42);
  }, 30000);

  it("fails missing logo media without redefining eligible counts", async () => {
    const target = logoIds[0];
    await db.delete(schema.logoMedia).where(eq(schema.logoMedia.logoId, target));
    try {
      await expect(getSavedPostPage({ userId, category: "Logos" })).rejects.toThrow(/no media/);
      expect(await readWorkCounts({ scope, filters: { category: "Logos" } })).toEqual({ total: 14, categories: { Logos: 14 } });
    } finally {
      await db.insert(schema.logoMedia).values({ logoId: target, url: "/logo.webp", alt: "Logo", width: 100, height: 100 });
    }
  }, 30000);

  it("preserves PostgreSQL bookmark precision across a page boundary", async () => {
    const preciseUser = "saved-precision-" + randomUUID();
    const bookmarks = expected.slice(0, 20).map(f => ({
      id: randomUUID(), userId: preciseUser,
      postId: f.kind === "post" ? f.id : null,
      logoId: f.kind === "logo" ? f.id : null,
      websiteId: f.kind === "website" ? f.id : null,
    }));
    try {
      await db.insert(schema.savedPosts).values(bookmarks);
      await db.update(schema.savedPosts).set({ createdAt: sql`'2099-01-01T00:00:00.000123Z'::timestamptz` }).where(eq(schema.savedPosts.userId, preciseUser));
      const first = await readWorkPage({ scope: { kind: "saved", userId: preciseUser }, order: "saved-desc" });
      expect(first.items).toHaveLength(16);
      const second = await readWorkPage({ scope: { kind: "saved", userId: preciseUser }, order: "saved-desc", cursor: first.nextCursor });
      expect(second.items).toHaveLength(4);
      expect(second.nextCursor).toBeNull();
      const wanted = [...bookmarks].sort((a, b) => b.id.localeCompare(a.id)).map(b => b.postId ?? b.logoId ?? b.websiteId);
      expect([...first.items, ...second.items].map(item => item.id)).toEqual(wanted);
    } finally {
      await db.delete(schema.savedPosts).where(eq(schema.savedPosts.userId, preciseUser));
    }
  }, 30000);

  it("keeps selection and hydration coherent during a controlled concurrent fixture edit", async () => {
    const target = expected.find(f => f.kind === "website")!;
    const marker = "saved_barrier_" + randomUUID().replaceAll("-", "");
    let calls = 0;
    const gated = new Proxy(client, { get(object, property) {
      if (property !== "query") return Reflect.get(object, property);
      return (query: string, params: unknown[], options: Parameters<typeof client.query>[2]) => {
        calls++;
        return client.query("with " + marker + " as materialized (select pg_sleep(5)) select saved.* from " + marker + " cross join lateral (" + query + ") saved", params, options);
      };
    } });
    vi.mocked(requireDatabase).mockReturnValue(drizzle({ client: gated, schema }));
    const outcome = readWorkPage({ scope, order: "saved-desc" }).then(value => ({ value }), error => ({ error }));
    try {
      let sleeping = false;
      for (let attempt = 0; attempt < 30 && !sleeping; attempt++) {
        const activity = await client.query("select 1 from pg_stat_activity where pid <> pg_backend_pid() and query like $1 and wait_event = 'PgSleep'", ["%" + marker + "%"]);
        sleeping = activity.length > 0;
        if (!sleeping) await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(sleeping).toBe(true);
      await db.update(schema.websiteMedia).set({ posterUrl: null }).where(eq(schema.websiteMedia.websiteId, target.id));
      const result = await outcome;
      if ("error" in result) throw result.error;
      expect(result.value.items.map(item => item.id)).toEqual(expected.slice(0, 16).map(f => f.id));
      const item = result.value.items.find(item => item.id === target.id);
      expect(item?.kind === "website" && item.website.recording.posterUrl).toBe("/poster.webp");
      expect(calls).toBe(1);
      vi.mocked(requireDatabase).mockReturnValue(db);
      expect((await readWorkPage({ scope, order: "saved-desc" })).items.map(item => item.id)).toEqual(expected.filter(f => f.id !== target.id).slice(0, 16).map(f => f.id));
      expect((await readWorkCounts({ scope })).total).toBe(41);
    } finally {
      await outcome;
      vi.mocked(requireDatabase).mockReturnValue(db);
      await db.update(schema.websiteMedia).set({ posterUrl: "/poster.webp" }).where(eq(schema.websiteMedia.websiteId, target.id));
    }
  }, 30000);
});
