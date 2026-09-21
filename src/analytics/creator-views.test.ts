import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/db/client";

const snapshots = vi.hoisted(() => new Map<string, { fingerprint: string; count: number; asOf: string }>());
vi.mock("./view-snapshots", () => ({
  readViewSnapshot: vi.fn(async (key: string, fingerprint: string) => {
    const snapshot = snapshots.get(key);
    return snapshot?.fingerprint === fingerprint ? { count: snapshot.count, asOf: snapshot.asOf } : null;
  }),
  writeViewSnapshot: vi.fn(async (key: string, fingerprint: string, result: {count:number;asOf:string}) => {
    snapshots.set(key, {fingerprint, count:result.count, asOf:result.asOf});
  }),
}));
beforeEach(() => snapshots.clear());
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: vi.fn(() => null) }));
vi.mock("@/data/posts-repository", () => ({
  PUBLISHED_POSTS_CACHE_TAG: "published-posts",
}));
vi.mock("@/data/logos-repository", () => ({
  PUBLISHED_LOGOS_CACHE_TAG: "published-logos",
}));
vi.mock("@/features/profiles/cache", () => ({
  PUBLIC_CREATOR_PROFILES_CACHE_TAG: "public-creator-profiles",
}));
vi.mock("@/data/websites-repository", async () => {
  const { sql } = await import("drizzle-orm");
  return {
    PUBLISHED_WEBSITES_CACHE_TAG: "published-websites",
    completeWebsiteRecordingPredicate: vi.fn(() => sql`true`),
  };
});

import {
  buildCreatorViewsQuery,
  getCreatorViews,
  parseCreatorViewsRows,
} from "./creator-views";

const creatorId = "11111111-1111-4111-8111-111111111111";
const designId = "22222222-2222-4222-8222-222222222222";
const logoId = "33333333-3333-4333-8333-333333333333";
const websiteId = "44444444-4444-4444-8444-444444444444";

function configurePreviewAnalytics() {
  process.env.DATA_ENVIRONMENT = "development";
  process.env.POSTHOG_API_HOST = "https://analytics.preview.test";
  process.env.POSTHOG_PERSONAL_API_KEY = "preview-read-key";
  process.env.POSTHOG_PROJECT_ID = "preview-project";
  process.env.POSTHOG_WORK_VIEWS_CUTOVER_AT = "2026-09-21T12:00:00.000Z";
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getDatabase).mockReturnValue(null);
  delete process.env.DATA_ENVIRONMENT;
  delete process.env.POSTHOG_API_HOST;
  delete process.env.POSTHOG_PERSONAL_API_KEY;
  delete process.env.POSTHOG_PROJECT_ID;
  delete process.env.POSTHOG_WORK_VIEWS_CUTOVER_AT;
});

describe("creator views query", () => {
  it("unions legacy Design history with unified events before exact session/work deduplication", () => {
    const request = buildCreatorViewsQuery(
      {
        design: [designId],
        logo: [logoId],
        website: [websiteId],
      },
      "2026-09-21T12:00:00.000Z",
    );

    expect(request.query).toContain("UNION ALL");
    expect(request.query).toContain("timestamp < parseDateTimeBestEffort({cutover_at})");
    expect(request.query).toContain("timestamp >= parseDateTimeBestEffort({cutover_at})");
    expect(request.query).toContain("uniqExact(work_kind, work_id, session_id)");
    expect(request.query).toContain("notEmpty(toString(properties.$session_id))");
    expect(request.query).not.toContain("properties.creator_id");
    expect(request.values).toMatchObject({
      legacy_event: "post opened",
      unified_event: "work opened",
      cutover_at: "2026-09-21T12:00:00.000Z",
      design_ids: [designId],
      logo_ids: [logoId],
      website_ids: [websiteId],
    });
  });

  it("parses the controlled aggregate fixture value instead of recounting events in JavaScript", () => {
    expect(parseCreatorViewsRows([[3]])).toBe(3);
    expect(() => parseCreatorViewsRows([])).toThrow("unexpected");
    expect(() => parseCreatorViewsRows([["not-a-count"]])).toThrow("unexpected");
  });

  it("sends eligible work IDs as PostHog values and returns the aggregate", async () => {
    configurePreviewAnalytics();
    const execute = vi.fn().mockResolvedValue({
      rows: [
        { kind: "design", id: designId },
        { kind: "logo", id: logoId },
        { kind: "website", id: websiteId },
      ],
    });
    vi.mocked(getDatabase).mockReturnValue({ execute } as never);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [[3]] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCreatorViews(creatorId);

    expect(result).toMatchObject({ status: "available", count: 3 });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.refresh).toBe("blocking");
    expect(body.query.values).toMatchObject({
      design_ids: [designId],
      logo_ids: [logoId],
      website_ids: [websiteId],
    });
    expect(body.query.query).toContain("uniqExact(work_kind, work_id, session_id)");
  });

  it("keeps a previous successful value when the provider refresh fails", async () => {
    configurePreviewAnalytics();
    vi.mocked(getDatabase).mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        rows: [{ kind: "design", id: designId }],
      }),
    } as never);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [[7]] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new Error("provider unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getCreatorViews(creatorId);
    const second = await getCreatorViews(creatorId);

    expect(first).toMatchObject({ status: "available", count: 7 });
    expect(second).toEqual(first);
  });

  it("returns unavailable rather than a false zero when no provider value exists", async () => {
    configurePreviewAnalytics();
    const freshCreatorId = "55555555-5555-4555-8555-555555555555";
    vi.mocked(getDatabase).mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        rows: [{ kind: "design", id: designId }],
      }),
    } as never);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider unavailable")));

    await expect(getCreatorViews(freshCreatorId)).resolves.toEqual({
      status: "unavailable",
    });
  });
});

 it("does not restore archived or reassigned credit during provider failure", async () => {
    configurePreviewAnalytics();
    const execute = vi.fn().mockResolvedValue({ rows: [{kind: "design", id: designId}] });
    vi.mocked(getDatabase).mockReturnValue({execute} as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({results: [[7]]}))));
    expect(await getCreatorViews(creatorId)).toMatchObject({count:7});
    execute.mockResolvedValue({rows:[{kind:"logo",id:logoId}]});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await getCreatorViews(creatorId)).toEqual({status:"unavailable"});
  });
 it("fails closed when current eligibility cannot be established", async () => {
    configurePreviewAnalytics();
    vi.mocked(getDatabase).mockReturnValue({execute:vi.fn().mockRejectedValue(new Error("database offline"))} as never);
    expect(await getCreatorViews(creatorId)).toEqual({status:"unavailable"});
  });

it("loads a shared snapshot after a module cold start and preserves its timestamp", async () => {
  configurePreviewAnalytics();
  vi.mocked(getDatabase).mockReturnValue({execute:vi.fn().mockResolvedValue({rows:[{kind:"design",id:designId}]})} as never);
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({results:[[9]]}))));
  const success = await getCreatorViews(creatorId);
  vi.resetModules();
  vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));
  const freshWorker = await import("./creator-views");
  expect(await freshWorker.getCreatorViews(creatorId)).toEqual(success);
  process.env.POSTHOG_PROJECT_ID = "other-project";
  expect(await freshWorker.getCreatorViews(creatorId)).toEqual({status:"unavailable"});
});
it("rejects malformed counts and recovers without treating them as zero", async () => {
  configurePreviewAnalytics();
  vi.mocked(getDatabase).mockReturnValue({execute:vi.fn().mockResolvedValue({rows:[{kind:"design",id:designId}]})} as never);
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({results:[[null]]}))));
  expect(await getCreatorViews(creatorId)).toEqual({status:"unavailable"});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({results:[[4]]}))));
  expect(await getCreatorViews(creatorId)).toMatchObject({status:"available",count:4});
});
it("rejects unexpected aggregate shapes", () => {
  for (const rows of [[], [[1],[2]], [[1,2]], [[-1]], [[1.5]], [[null]]]) expect(() => parseCreatorViewsRows(rows)).toThrow();
});
it("returns genuine zero for an empty eligible list without querying the provider", async () => {
  configurePreviewAnalytics();
  vi.mocked(getDatabase).mockReturnValue({execute:vi.fn().mockResolvedValue({rows:[]})} as never);
  const provider = vi.fn(); vi.stubGlobal("fetch",provider);
  expect(await getCreatorViews(creatorId)).toMatchObject({status:"available",count:0});
  expect(provider).not.toHaveBeenCalled();
});
