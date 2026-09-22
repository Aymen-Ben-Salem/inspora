import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadPreviewEnvironment } from "../../../scripts/lib/preview-environment";
import { requireDatabase, getDatabase, type Database } from "@/db/client";
import * as schema from "@/db/schema";
import type { PostCardData } from "@/domain/post";
import { readWorkPage } from "./index";
import { getPublishedWebsites } from "../websites-repository";
import { completeWebsiteRecordingPredicate, hasCompleteRecording } from "./website-presentation";
import { websiteFixture } from "./testing/fixtures";
import { incompletePresentations } from "./testing/completeness";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ requireDatabase: vi.fn(), getDatabase: vi.fn() }));
vi.mock("./clock", () => ({ evaluationTime: () => new Date("2099-01-01T00:00:00Z") }));
const request = { scope: { kind: "website-archive" }, order: "publication-desc" } as const;
const now = new Date("2099-01-01T00:00:00Z");
const suite = process.env.RUN_PREVIEW_PUBLIC_WORK === "1" ? describe : describe.skip;

suite("Preview website archive statements", () => {
  const owner = randomUUID();
  const ids = Array.from({ length: 44 }, () => randomUUID()).sort().reverse();
  const postIds = Array.from({ length: 52 }, () => randomUUID()).sort().reverse();
  const logoIds = Array.from({ length: 22 }, () => randomUUID()).sort().reverse();
  const postIdSet = new Set<string>(postIds);
  const logoIdSet = new Set<string>(logoIds);
  let db: Database;
  let client: NeonQueryFunction<false, false>;
  const statements: { query: string; params: unknown[] }[] = [];
  beforeAll(async () => {
    // Exact established Preview fingerprint must pass before any fixture writes.
    const preview = loadPreviewEnvironment();
    client = neon(preview.databaseUrl);
    db = drizzle({ client, schema, logger: { logQuery(query, params) { statements.push({ query, params }); } } });
    vi.mocked(requireDatabase).mockReturnValue(db);
    vi.mocked(getDatabase).mockReturnValue(db);
    await db.insert(schema.creators).values({ id: owner, name: "Public work isolated fixture", avatarUrl: "/fixture-avatar.svg", recordOrigin: "preview" });
    await db.insert(schema.websites).values(ids.map((id, i) => ({
      id, creatorId: owner, slug: "public-work-" + id, title: "Archive fixture " + i,
      tagline: "Isolated archive fixture", description: "Ticket 01", sourceUrl: "https://example.invalid",
      status: i === 42 ? "draft" : i === 43 ? "archived" : "published",
      archivedAt: i === 43 ? now : null,
      publishedAt: new Date(now.getTime() + (i === 41 ? 1 : i === 40 ? -1 : 0)), isFeatured: i % 2 === 0,
    })));
    await db.insert(schema.websiteMedia).values(ids.flatMap((id, i) => [
      { websiteId: id, role: "recording", url: "/fixture.webm", posterUrl: i === 0 ? "" : "/poster.webp", width: 100, height: 100, videoPreview: websiteFixture().media[0].videoPreview, createdAt: new Date(2) },
      { websiteId: id, role: "favicon", url: "/favicon.webp", width: 32, height: 32, createdAt: new Date(1) },
      { websiteId: id, role: "full_page", url: "/legacy.webp", width: 100, height: 100, createdAt: new Date(0) },
    ]));
    await db.insert(schema.websiteSections).values(ids.flatMap(id => [
      { websiteId: id, label: "Second", position: 1, imageUrl: "/second.webp", imageWidth: 100, imageHeight: 100 },
      { websiteId: id, label: "First", position: 0, imageUrl: "/first.webp", imageWidth: 100, imageHeight: 100 },
    ]));
    const tiedCreation = new Date("2098-01-01T00:00:00Z");
    await db.insert(schema.posts).values(postIds.map((id, i) => ({
      id,
      creatorId: owner,
      slug: "public-work-design-" + id,
      title: "Design fixture " + i,
      description: "Ticket 02",
      category: i % 2 === 0 ? "Web" : "Branding",
      sourceUrl: "https://example.invalid",
      status: i === 0 ? "draft" : i === 1 ? "archived" : "published",
      archivedAt: i === 1 ? now : null,
      publishedAt: i === 0 ? null : new Date(now.getTime() + (i === 2 ? 1 : i === 3 ? -1 : 0)),
      isFeatured: i % 2 === 0,
      createdAt: tiedCreation,
    })));
    await db.insert(schema.postMedia).values(postIds.flatMap((postId, i) => [
      { postId, type: "image", url: `/design-${i}-second.webp`, alt: "Second", width: 100, height: 100, position: 1 },
      { postId, type: "image", url: `/design-${i}-first.webp`, alt: "First", width: 100, height: 100, position: 0 },
    ]));
    await db.insert(schema.logos).values(logoIds.map((id, i) => ({
      id,
      creatorId: owner,
      slug: "public-work-logo-" + id,
      title: "Logo fixture " + i,
      kind: i === 0 ? "icon" : "logo",
      description: "Ticket 02",
      industry: "Design",
      shape: "Symbol",
      sourceUrl: "https://example.invalid",
      status: i === 21 ? "draft" : "published",
      publishedAt: i === 21 ? null : new Date(now.getTime() + (i === 20 ? 1 : i === 19 ? -1 : 0)),
      createdAt: tiedCreation,
    })));
    await db.insert(schema.logoMedia).values(logoIds.map((logoId, i) => ({
      logoId,
      url: `/logo-${i}.webp`,
      alt: `Logo ${i}`,
      width: 100,
      height: 100,
    })));
  }, 60000);
  afterAll(async () => {
    if (db) {
      await db.delete(schema.websites).where(inArray(schema.websites.id, ids));
      await db.delete(schema.posts).where(inArray(schema.posts.id, postIds));
      await db.delete(schema.logos).where(inArray(schema.logos.id, logoIds));
      await db.delete(schema.creators).where(eq(schema.creators.id, owner));
    }
  }, 30000);

  it("returns the full ordered eligible collection with featured filtering and usable payloads", async () => {
    statements.length = 0;
    const page = await readWorkPage(request);
    expect(statements).toHaveLength(1);
    expect(statements[0].query).toContain("lateral");
    const own = page.items.filter(item => item.creator.id === owner);
    expect(own.map(item => item.id)).toEqual(ids.slice(1, 41));
    expect(page.nextCursor).toBeNull();
    expect(own[0]).toMatchObject({
      creator: { id: owner, name: "Public work isolated fixture", avatarUrl: "/fixture-avatar.svg" },
      recording: { url: "/fixture.webm", posterUrl: "/poster.webp", videoPreview: { url: "/preview.mp4" } },
      favicon: { url: "/favicon.webp" },
      sections: [{ label: "First", url: "/first.webp" }, { label: "Second", url: "/second.webp" }],
    });
    const featured = await getPublishedWebsites({ view: "featured" });
    expect(featured.filter(item => item.creator.id === owner).map(item => item.id)).toEqual(ids.slice(1, 41).filter((_, i) => (i + 1) % 2 === 0));
    // Use the exact production statement with a bounded limit. The incomplete
    // newest fixture must not consume a slot before eligible candidates.
    const query = statements[0];
    const limited = await client.query(query.query + " limit 2", query.params, { arrayMode: true });
    expect(limited.map(row => row[0])).toEqual(ids.slice(1, 3));
  }, 30000);

  it("traverses more than two full design pages with stable tied ordering and one statement per page", async () => {
    statements.length = 0;
    const items: PostCardData[] = [];
    let cursor: string | null | undefined;
    let pages = 0;

    do {
      const before = statements.length;
      const page = await readWorkPage({
        scope: { kind: "design-archive" },
        order: "created-desc",
        cursor,
      });
      expect(statements.length).toBe(before + 1);
      if (page.nextCursor) expect(page.items).toHaveLength(16);
      items.push(...page.items);
      cursor = page.nextCursor;
      pages += 1;
      expect(pages).toBeLessThan(20);
    } while (cursor);

    expect(pages).toBeGreaterThan(3);
    expect(cursor).toBeNull();
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    const own = items.filter((item) => postIdSet.has(item.id));
    expect(own.map((item) => item.id)).toEqual(postIds.slice(3));
    expect(own[0]).toMatchObject({
      media: [{ url: "/design-3-first.webp" }],
      mediaCount: 2,
    });
  }, 30000);

  it("applies design category and featured selection before page limits", async () => {
    const expected = postIds.filter((_, i) => i >= 4 && i <= 50 && i % 2 === 0);
    const collected: PostCardData[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await readWorkPage({
        scope: { kind: "design-archive" },
        filters: { category: "Web", view: "featured" },
        order: "created-desc",
        cursor,
      });
      collected.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);

    expect(collected.filter((item) => postIdSet.has(item.id)).map((item) => item.id))
      .toEqual(expected);
  }, 30000);

  it("returns the complete ordered logo archive with app icons and no page truncation", async () => {
    statements.length = 0;
    const page = await readWorkPage({
      scope: { kind: "logo-archive" },
      order: "created-desc",
    });
    expect(statements).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
    const own = page.items.filter((item) => logoIdSet.has(item.id));
    expect(own.map((item) => item.id)).toEqual(logoIds.slice(0, 20));
    expect(own).toHaveLength(20);
    expect(own[0]).toMatchObject({ kind: "icon", media: { url: "/logo-0.webp" } });
  }, 30000);

  it("matches SQL completeness to the in-memory integrity rule using virtual constraint edge cases", async () => {
    const rows = [websiteFixture(), ...incompletePresentations.map(({ change }) => { const row = websiteFixture(); change(row); return row; })];
    const legacy = websiteFixture();
    legacy.media.push({ ...legacy.media[1], role: "full_page" });
    rows.push(legacy);
    // Virtual rows cover individual null/zero dimensions without weakening constraints.
    const media = rows.flatMap((row, i) => row.media.map(m => ({ website_id: i, role: m.role, poster_url: m.posterUrl, video_preview: m.videoPreview })));
    const sections = rows.flatMap((row, i) => row.sections.map(s => ({ website_id: i, image_url: s.imageUrl, image_width: s.imageWidth, image_height: s.imageHeight })));
    const predicate = new PgDialect().sqlToQuery(completeWebsiteRecordingPredicate());
    const sql = "with websites as (select generate_series(0, $1::int) as id), " +
      "website_media as (select * from jsonb_to_recordset($2::jsonb) as m(website_id int, role text, poster_url text, video_preview jsonb)), " +
      "website_sections as (select * from jsonb_to_recordset($3::jsonb) as s(website_id int, image_url text, image_width int, image_height int)) " +
      "select id from websites where " + predicate.sql + " order by id";
    const selected = await client.query(sql, [rows.length - 1, JSON.stringify(media), JSON.stringify(sections)]);
    expect(selected.map(r => r.id)).toEqual([0, rows.length - 1]);
    expect(rows.map((r, i) => hasCompleteRecording(r) ? i : -1).filter(i => i >= 0)).toEqual([0, rows.length - 1]);
    // JSON scalar null and SQL NULL must both be excluded; arbitrary non-null
    // preview metadata stays eligible, without stronger shape validation.
    for (const preview of ["null::jsonb", "'null'::jsonb", "'{}'::jsonb", "'false'::jsonb", "'0'::jsonb", "'\"\"'::jsonb"]) {
      const result = await client.query("with websites as (select 1 as id), website_media as (select 1 as website_id, 'recording' as role, '/p' as poster_url, " + preview + " as video_preview union all select 1, 'favicon', null, null), website_sections as (select 1 as website_id, '/s' as image_url, 1 as image_width, 1 as image_height) select id from websites where " + predicate.sql);
      expect(result).toHaveLength(preview.includes("null") ? 0 : 1);
    }
  }, 30000);


  it("applies design and logo publication boundaries to virtual missing-date rows", async () => {
    const rows = await client.query("with work(kind, status, published_at) as (values ('design', 'published', null::timestamptz), ('logo', 'published', null::timestamptz), ('design', 'published', '2099-01-01'::timestamptz), ('logo', 'published', '2098-12-31 23:59:59.999Z'::timestamptz), ('design', 'published', '2099-01-01 00:00:00.001Z'::timestamptz), ('logo', 'draft', '2098-01-01'::timestamptz)) select * from work where status = 'published' and published_at is not null and published_at <= $1::timestamptz order by kind", [now.toISOString()]);
    expect(rows.map((row) => row.kind)).toEqual(["design", "logo"]);
    expect(new Date(rows[0].published_at).toISOString()).toBe(now.toISOString());
  });

  it("returns a coherent snapshot across a controlled concurrent presentation edit", async () => {
    const target = ids[1];
    const marker = "archive_barrier_" + randomUUID().replaceAll("-", "");
    let calls = 0;
    const gated = new Proxy(client, { get(object, property) {
      if (property !== "query") return Reflect.get(object, property);
      return (query: string, params: unknown[], options: Parameters<typeof client.query>[2]) => {
        calls++;
        return client.query("with " + marker + " as materialized (select pg_sleep(5)) select archive.* from " + marker + " cross join lateral (" + query + ") archive", params, options);
      };
    } });
    vi.mocked(requireDatabase).mockReturnValue(drizzle({ client: gated, schema }));
    const pending = readWorkPage(request);
    // Attach a handler immediately so a query failure cannot be unhandled.
    const outcome = pending.then(value => ({ value }), error => ({ error }));
    try {
      let sleeping = false;
      for (let attempt = 0; attempt < 30 && !sleeping; attempt++) {
        const activity = await client.query("select 1 from pg_stat_activity where pid <> pg_backend_pid() and query like $1 and wait_event = 'PgSleep'", ["%" + marker + "%"]);
        sleeping = activity.length > 0;
        if (!sleeping) await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(sleeping).toBe(true);
      await db.update(schema.websiteMedia).set({ posterUrl: null }).where(eq(schema.websiteMedia.websiteId, target));
      const result = await outcome;
      if ("error" in result) throw result.error;
      expect(result.value.items.find(item => item.id === target)?.recording.posterUrl).toBe("/poster.webp");
      expect(calls).toBe(1);
      vi.mocked(requireDatabase).mockReturnValue(db);
      expect((await readWorkPage(request)).items.some(item => item.id === target)).toBe(false);
    } finally {
      await outcome;
      vi.mocked(requireDatabase).mockReturnValue(db);
      await db.update(schema.websiteMedia).set({ posterUrl: "/poster.webp" }).where(eq(schema.websiteMedia.websiteId, target));
    }
  }, 30000);
});
