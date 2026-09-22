import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPreviewEnvironment } from "../../../scripts/lib/preview-environment";
import { requireDatabase, getDatabase, type Database } from "@/db/client";
import * as schema from "@/db/schema";
import { POST_CATEGORIES } from "@/domain/post";
import type { CreatorWorkFilter } from "@/features/profiles/types";
import type { WorkCardData } from "@/domain/work-card";
import { readWorkCounts, readWorkPage, readWorkIdentities } from "./index";
import { getPublishedCreatorWorkCounts, getPublishedCreatorWorkPage } from "@/features/profiles/repository";
import { websiteFixture, mixedCreatorWorkFixtures } from "./testing/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ requireDatabase: vi.fn(), getDatabase: vi.fn() }));
vi.mock("./clock", () => ({ evaluationTime: () => new Date("2099-01-01T00:00:00Z") }));
const now = new Date("2099-01-01T00:00:00Z");
const suite = process.env.RUN_PREVIEW_PUBLIC_WORK === "1" ? describe : describe.skip;

suite("Preview eligible creator work", () => {
  const owners = [randomUUID(), randomUUID()];
  const scope = { kind: "creator", creatorId: owners[0] } as const;
  const fixtures = mixedCreatorWorkFixtures(now);
  const expected = fixtures.filter(f => f.kind !== "incomplete").sort((a, b) =>
    b.publishedAt.getTime() - a.publishedAt.getTime() || ({ website: 4, post: 3, logo: 2, incomplete: 0 }[b.kind]! - { website: 4, post: 3, logo: 2, incomplete: 0 }[a.kind]!) || b.id.localeCompare(a.id));
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
    await db.insert(schema.creators).values(owners.map((id, i) => ({ id, name: `Creator read fixture ${i}`, avatarUrl: "/avatar.svg", recordOrigin: "preview" })));
    await db.insert(schema.posts).values(fixtures.filter(f => f.kind === "post").map((f) => ({
      id: f.id, creatorId: owners[0], slug: "creator-read-design-" + f.id, title: "Creator design", description: "Ticket 04",
      category: f.category, sourceUrl: "https://example.invalid", status: "published", publishedAt: f.publishedAt,
    })));
    await db.insert(schema.posts).values(extraIds.map((id, i) => ({
      id, creatorId: owners[1], slug: "creator-read-boundary-" + id, title: "Boundary", description: "Ticket 04", category: "Web",
      sourceUrl: "https://example.invalid", status: i === 0 ? "draft" : i === 1 ? "archived" : "published",
      archivedAt: i === 1 ? now : null,
      publishedAt: i === 0 ? null : new Date(now.getTime() + (i === 2 ? 1 : i === 3 ? -1 : 0)),
    })));
    await db.insert(schema.postMedia).values(postIds.flatMap(postId => [
      { postId, type: "image", url: "/second.webp", alt: "Second", width: 100, height: 100, position: 1 },
      { postId, type: "image", url: "/first.webp", alt: "First", width: 100, height: 100, position: 0 },
    ]));
    await db.insert(schema.logos).values(logoIds.map((id, i) => ({
      id, creatorId: owners[0], slug: "creator-read-logo-" + id, title: "Creator logo", kind: i % 2 ? "icon" : "logo",
      description: "Ticket 04", industry: "Design", shape: "Symbol", sourceUrl: "https://example.invalid", status: "published", publishedAt: fixtures.find(f => f.id === id)!.publishedAt,
    })));
    await db.insert(schema.logoMedia).values(logoIds.map(logoId => ({ logoId, url: "/logo.webp", alt: "Logo", width: 100, height: 100 })));
    await db.insert(schema.websites).values(websiteIds.map((id) => ({
      id, creatorId: owners[0], slug: "creator-read-website-" + id, title: "Creator website", tagline: "Fixture", description: "Ticket 04",
      sourceUrl: "https://example.invalid", status: "published", publishedAt: fixtures.find(f => f.id === id)!.publishedAt,
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
  }, 60000);
  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.posts).where(inArray(schema.posts.id, postIds));
    await db.delete(schema.logos).where(inArray(schema.logos.id, logoIds));
    await db.delete(schema.websites).where(inArray(schema.websites.id, websiteIds));
    await db.delete(schema.creators).where(inArray(schema.creators.id, owners));
  }, 30000);


  async function traverse(filter: CreatorWorkFilter = "all", creatorId = owners[0]) {
    const items: WorkCardData[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const before = statements.length;
      const page = await readWorkPage({ scope: { kind: "creator", creatorId }, filters: { filter }, order: "publication-desc", cursor });
      expect(statements.length).toBe(before + 1);
      if (page.nextCursor) expect(page.items).toHaveLength(16);
      items.push(...page.items);
      cursor = page.nextCursor;
      expect(++pages).toBeLessThan(10);
    } while (cursor);
    expect(cursor).toBeNull();
    expect(new Set(items.map(item => ("kind" in item ? item.kind : "design") + ":" + item.id)).size).toBe(items.length);
    return { items, pages };
  }
  function fixtureFilter(f: typeof fixtures[number]) {
    return f.kind === "website" ? "websites" : f.kind === "logo" ? (logoIds.indexOf(f.id) % 2 ? "app-icons" : "logos") : f.category;
  }
  it("traverses three coherent full mixed pages, preserving order, cards, counts and identities", async () => {
    const { items, pages } = await traverse();
    expect(pages).toBe(3);
    expect(items.map(item => item.id)).toEqual(expected.map(f => f.id));
    const before = statements.length;
    expect(await readWorkCounts({ scope })).toEqual({ total: 42, filters: {
      Web: 2, Branding: 2, Product: 2, Motion: 2, Illustration: 2, "3D": 2, Print: 2, logos: 7, "app-icons": 7, websites: 14,
    } });
    expect(statements.length).toBe(before + 1);
    expect(statements.at(-1)).not.toMatch(/jsonb_agg|limit/i);
    const identityStart = statements.length;
    const identities = await readWorkIdentities({ scope });
    expect(statements.length).toBe(identityStart + 1);
    expect(statements.at(-1)).not.toMatch(/jsonb_agg|limit/i);
    expect(new Set(identities.map(row => row.kind + ":" + row.id))).toEqual(new Set(expected.map(f => (f.kind === "post" ? "design" : f.kind) + ":" + f.id)));
    for (const item of items) {
      if (item.kind === "website") expect(item.website).toMatchObject({ recording: { posterUrl: "/poster.webp" }, sections: [{ label: "First" }, { label: "Second" }] });
      else if (item.kind === "logo") expect(item.logo.media.url).toBe("/logo.webp");
      else expect(item).toMatchObject({ mediaCount: 2, media: [{ url: "/first.webp" }] });
    }
    expect(await getPublishedCreatorWorkCounts(owners[0])).toEqual(await readWorkCounts({ scope }));
    expect(await getPublishedCreatorWorkPage({ creatorId: owners[0], filter: "all" })).toEqual(await readWorkPage({ scope, order: "publication-desc" }));
  }, 30000);
  it.each([...POST_CATEGORIES, "websites", "logos", "app-icons"] as CreatorWorkFilter[])("preserves %s selection and filtered counts, with independent unfiltered tab totals", async filter => {
    const { items } = await traverse(filter);
    const wanted = expected.filter(f => fixtureFilter(f) === filter);
    expect(items.map(item => item.id)).toEqual(wanted.map(f => f.id));
    expect(await readWorkCounts({ scope, filters: { filter } })).toEqual({ total: wanted.length, filters: { [filter]: wanted.length } });
    expect((await getPublishedCreatorWorkCounts(owners[0])).total).toBe(42);
  }, 30000);
  it("isolates creators at publication boundaries and observes attribution and publication fixture transitions", async () => {
    const other = { kind: "creator", creatorId: owners[1] } as const;
    expect((await traverse("all", owners[1])).items.map(item => item.id)).toEqual([extraIds[4], extraIds[3]]);
    expect(await readWorkCounts({ scope: other })).toEqual({ total: 2, filters: { Web: 2 } });
    expect(new Set((await readWorkIdentities({ scope: other })).map(row => row.id))).toEqual(new Set(extraIds.slice(3)));
    const target = postIds[0];
    try {
      await db.update(schema.posts).set({ creatorId: owners[1] }).where(eq(schema.posts.id, target));
      expect((await readWorkCounts({ scope })).total).toBe(41);
      expect((await readWorkIdentities({ scope })).some(row => row.id === target)).toBe(false);
      expect((await traverse()).items.some(row => row.id === target)).toBe(false);
      expect((await readWorkCounts({ scope: other })).total).toBe(3);
      await db.update(schema.posts).set({ status: "draft" }).where(eq(schema.posts.id, target));
      expect((await readWorkCounts({ scope: other })).total).toBe(2);
      expect((await readWorkIdentities({ scope: other })).some(row => row.id === target)).toBe(false);
    } finally {
      await db.update(schema.posts).set({ creatorId: owners[0], status: "published" }).where(eq(schema.posts.id, target));
    }
  }, 30000);
  it("removes incomplete websites from pages/counts/identities and restores repaired work", async () => {
    const target = expected.find(f => f.kind === "website")!.id;
    try {
      await db.update(schema.websiteSections).set({ imageUrl: "" }).where(eq(schema.websiteSections.websiteId, target));
      expect((await traverse()).items.map(row => row.id)).toEqual(expected.filter(f => f.id !== target).map(f => f.id));
      expect((await readWorkCounts({ scope })).total).toBe(41);
      expect((await readWorkIdentities({ scope })).some(row => row.id === target)).toBe(false);
    } finally {
      await db.update(schema.websiteSections).set({ imageUrl: "/repaired.webp" }).where(eq(schema.websiteSections.websiteId, target));
    }
    expect((await readWorkCounts({ scope })).total).toBe(42);
    expect((await readWorkIdentities({ scope })).some(row => row.id === target)).toBe(true);
    expect((await traverse()).items.map(row => row.id)).toEqual(expected.map(f => f.id));
  }, 30000);
  it("fails missing logo media without changing the count or identity population", async () => {
    const target = logoIds[0];
    try {
      await db.delete(schema.logoMedia).where(eq(schema.logoMedia.logoId, target));
      await expect(readWorkPage({ scope, order: "publication-desc" })).rejects.toThrow(/no media/);
      expect((await readWorkCounts({ scope })).total).toBe(42);
      expect((await readWorkIdentities({ scope })).some(row => row.id === target && row.kind === "logo")).toBe(true);
    } finally {
      await db.insert(schema.logoMedia).values({ logoId: target, url: "/logo.webp", alt: "Logo", width: 100, height: 100 });
    }
  }, 30000);
  it("keeps colliding design/logo IDs distinct, with app icons in the logo family", async () => {
    const id = postIds[0];
    try {
      await db.insert(schema.logos).values({ id, creatorId: owners[0], slug: "creator-collision-" + id, title: "Collision", description: "Ticket 04", kind: "icon", industry: "Design", shape: "Symbol", sourceUrl: "https://example.invalid", status: "published", publishedAt: now });
      expect((await readWorkIdentities({ scope })).filter(row => row.id === id)).toEqual(expect.arrayContaining([{ kind: "design", id }, { kind: "logo", id }]));
      expect((await readWorkCounts({ scope })).total).toBe(43);
    } finally { await db.delete(schema.logos).where(eq(schema.logos.id, id)); }
  }, 30000);
  it("preserves microseconds and kind/ID ties across a page boundary", async () => {
    try {
      await db.update(schema.posts).set({ publishedAt: sql`'2098-12-31T23:59:59.000123Z'::timestamptz` }).where(inArray(schema.posts.id, postIds.slice(0, 14)));
      await db.update(schema.logos).set({ publishedAt: sql`'2098-12-31T23:59:59.000123Z'::timestamptz` }).where(inArray(schema.logos.id, logoIds));
      const items = (await traverse()).items;
      const wantedPosts = postIds.slice(0, 14).sort((a, b) => b.localeCompare(a));
      const wantedLogos = [...logoIds].sort((a, b) => (logoIds.indexOf(a) % 2 - logoIds.indexOf(b) % 2) || b.localeCompare(a));
      expect(items.slice(0, 28).map(item => item.id)).toEqual([...wantedPosts, ...wantedLogos]);
    } finally {
      for (const f of fixtures.filter(f => f.kind === "post" || f.kind === "logo")) {
        const table = f.kind === "post" ? schema.posts : schema.logos;
        await db.update(table).set({ publishedAt: f.publishedAt }).where(eq(table.id, f.id));
      }
    }
  }, 30000);

  it("keeps selection and hydration coherent during a controlled concurrent fixture edit", async () => {
    const target = expected.find(f => f.kind === "website")!;
    const marker = "creator_barrier_" + randomUUID().replaceAll("-", "");
    let calls = 0;
    const gated = new Proxy(client, { get(object, property) {
      if (property !== "query") return Reflect.get(object, property);
      return (query: string, params: unknown[], options: Parameters<typeof client.query>[2]) => {
        calls++;
        return client.query("with " + marker + " as materialized (select pg_sleep(5)) select saved.* from " + marker + " cross join lateral (" + query + ") saved", params, options);
      };
    } });
    vi.mocked(requireDatabase).mockReturnValue(drizzle({ client: gated, schema }));
    const outcome = readWorkPage({ scope, order: "publication-desc" }).then(value => ({ value }), error => ({ error }));
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
      expect((await readWorkPage({ scope, order: "publication-desc" })).items.map(item => item.id)).toEqual(expected.filter(f => f.id !== target.id).slice(0, 16).map(f => f.id));
      expect((await readWorkCounts({ scope })).total).toBe(41);
    } finally {
      await outcome;
      vi.mocked(requireDatabase).mockReturnValue(db);
      await db.update(schema.websiteMedia).set({ posterUrl: "/poster.webp" }).where(eq(schema.websiteMedia.websiteId, target.id));
    }
  }, 30000);
});
