import { afterEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "@/db/client";
import { websiteFixture } from "@/data/public-work/testing/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: vi.fn(() => null), requireDatabase: vi.fn(() => { const db = getDatabase(); if (!db) throw new Error("DATABASE_URL is not configured."); return db; }) }));
vi.mock("@/db/schema", () => import("../../db/schema"));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: vi.fn() }));
vi.mock("@/domain/post", () => import("../../domain/post"));
vi.mock("@/domain/website", () => import("../../domain/website"));
vi.mock("@/storage/types", () => import("../../storage/types"));
vi.mock("@/data/posts-repository", () => ({ getPostCardsByIds: vi.fn() }));
vi.mock("@/data/logos-repository", () => ({ mapPublishedLogo: vi.fn() }));
vi.mock("@/data/websites-repository", () => import("../../data/websites-repository"));

import {
  decodeCreatorWorkCursor,
  encodeCreatorWorkCursor,
  sortCreatorWorkCandidates,
  getPublishedCreatorWorkPage,
  getPublishedCreatorWorkCounts,
  resolvePublicCreatorProfile,
} from "./repository";

const creatorId = "11111111-1111-4111-8111-111111111111";

afterEach(() => { vi.mocked(getDatabase).mockReturnValue(null); });

describe("Neon raw-query response", () => {
  it.skipIf(process.env.RUN_PREVIEW_LEGACY_PROFILE_CHECK !== "1")("resolves initialized older Preview creators through the actual profile query", async () => {
    const { loadPreviewEnvironment } = await import("../../../scripts/lib/preview-environment");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("../../db/schema");
    const preview = loadPreviewEnvironment();
    const client = neon(preview.databaseUrl);
    const samples = await client.query(`
      select c.id, c.username, count(p.id)::int as designs from creators c
      join posts p on p.creator_id = c.id and p.status = 'published' and p.published_at <= now()
      where c.record_origin = 'mirrored' and c.owner_user_id is null and c.username is not null
      group by c.id order by c.username limit 3
    `);
    expect(samples).toHaveLength(3);
    vi.mocked(getDatabase).mockReturnValue(drizzle({ client, schema }));
    for (const sample of samples) {
      const resolved = await resolvePublicCreatorProfile(sample.username);
      expect(resolved?.profile.id).toBe(sample.id);
      expect(resolved?.canonicalUsername).toBe(sample.username);
      expect(resolved?.isAlias).toBe(false);
      expect(resolved?.profile).not.toHaveProperty("ownerUserId");
      expect((await getPublishedCreatorWorkCounts(sample.id)).total).toBeGreaterThanOrEqual(sample.designs);
      console.info("Verified Preview profile:", "/creators/" + sample.username);
    }
  }, 30000);

  it.skipIf(process.env.RUN_PREVIEW_PROFILE_MEDIA_CHECK !== "1")("matches website readiness in Preview SQL using read-only virtual rows", async () => {
    const { loadPreviewEnvironment } = await import("../../../scripts/lib/preview-environment");
    const { neon } = await import("@neondatabase/serverless");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const { completeWebsiteRecordingPredicate } = await import("../../data/websites-repository");
    const preview = loadPreviewEnvironment(); // Refuses any non-Preview fingerprint.
    const client = neon(preview.databaseUrl);
    const predicate = new PgDialect().sqlToQuery(completeWebsiteRecordingPredicate());
    // No inserts: these CTEs shadow table names for this SELECT only.
    // 1 legacy-only; 2 complete; 3 complete+legacy; 4 missing poster;
    // 5 missing preview; 6 missing sections; 7 incomplete section; 8 missing favicon.
    const rows = await client.query(`
      with websites as (select generate_series(1, 8) as id),
      website_media as (
        select id as website_id, 'recording' as role,
          case when id = 4 then null else '/poster.webp' end as poster_url,
          case when id = 5 then null else '{}'::jsonb end as video_preview
        from websites where id <> 1
        union all select id, 'favicon', null, null from websites where id <> 8
        union all select id, 'full_page', null, null from websites where id in (1, 3)
      ), website_sections as (
        select id as website_id, '/section.webp' as image_url,
          case when id = 7 then null else 100 end as image_width, 100 as image_height
        from websites where id <> 6
      ) select id from websites where ${predicate.sql} order by id
    `, predicate.params);
    expect(rows.map((row) => row.id)).toEqual([2, 3]);
  }, 30000);

  it("fails instead of silently omitting selected incomplete creator work", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const payload = { ...websiteFixture(), id, creatorId, sections: [] };
    vi.mocked(getDatabase).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ rows: [{ id, kind: "website", filter: "websites", publishedAt: payload.publishedAt!.toISOString(), payload }] }),
    } as never);
    await expect(getPublishedCreatorWorkPage({ creatorId, filter: "all" })).rejects.toThrow(/incomplete/);
  });
  it("reads complete cards from the driver's single-statement rows envelope", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const payload = { ...websiteFixture(), id, creatorId };
    const execute = vi.fn().mockResolvedValue({ rows: [{ id, kind: "website", filter: "websites", publishedAt: payload.publishedAt!.toISOString(), payload }] });
    vi.mocked(getDatabase).mockReturnValue({ execute } as never);
    expect(await getPublishedCreatorWorkPage({ creatorId, filter: "all" })).toMatchObject({
      items: [{ id, kind: "website", category: "Websites", website: { slug: "paper" } }], nextCursor: null,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reads published filter counts from the driver's rows envelope", async () => {
    vi.mocked(getDatabase).mockReturnValue({ execute: vi.fn().mockResolvedValue({ rows: [{ filter: "Web", count: 2 }, { filter: "logos", count: 1 }] }) } as unknown as NonNullable<ReturnType<typeof getDatabase>>);
    expect(await getPublishedCreatorWorkCounts(creatorId)).toEqual({ total: 3, filters: { Web: 2, logos: 1 } });
  });
});

describe("creator work pagination", () => {
  const query = { creatorId, filter: "all" as const };
  const cursor = {
    ...query,
    publishedAt: "2026-09-18T12:00:00.000Z",
    kind: "website" as const,
    id: "22222222-2222-4222-8222-222222222222",
  };

  it("round-trips a cursor only for its creator and filter", () => {
    const encoded = encodeCreatorWorkCursor(cursor);
    expect(decodeCreatorWorkCursor(encoded, query)).toEqual(cursor);
    expect(decodeCreatorWorkCursor(encoded, { ...query, filter: "Web" })).toBeNull();
    expect(decodeCreatorWorkCursor(encoded, { ...query, creatorId: "33333333-3333-4333-8333-333333333333" })).toBeNull();
    expect(decodeCreatorWorkCursor("not-a-cursor", query)).toBeNull();
  });

  it("sorts newest first with deterministic kind and id tie-breaks", () => {
    const publishedAt = "2026-09-18T12:00:00.000Z";
    const items = sortCreatorWorkCandidates([
      { id: "00000000-0000-4000-8000-000000000003", kind: "icon", publishedAt },
      { id: "00000000-0000-4000-8000-000000000002", kind: "post", publishedAt },
      { id: "00000000-0000-4000-8000-000000000001", kind: "website", publishedAt },
      { id: "00000000-0000-4000-8000-000000000004", kind: "logo", publishedAt },
    ]);

    expect(items.map((item) => item.kind)).toEqual(["website", "post", "logo", "icon"]);
  });
});
