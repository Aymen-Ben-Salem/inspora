import { afterEach, beforeEach, expect, it, vi } from "vitest";
const external = vi.hoisted(() => ({
  assert: vi.fn(),
  read: vi.fn(),
  rows: [] as unknown[],
  query: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/features/inspora-catalog/source", () => ({ assertCatalogSourceEnvironment: external.assert, readCatalogEnrichment: external.read }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => (...args: unknown[]) => { external.query(...args); return Promise.resolve(external.rows); } }));
import { catalogReviewStatus, resetCatalogReviewCache } from "./editorial-catalog-review";
import { mediaFingerprint, sourceFingerprint } from "../../../tools/inspora-mcp/enrichment.mjs";

const id = "1c51893b-bc44-4d48-933b-e1402c74dc95";
const row = { kind: "logo", id, slug: "mark", title: "Mark", description: "A round mark", tagline: "", creator_name: "Studio", creator_username: "studio",
  category: "", industries: [], styles: ["Minimal"], colors: ["Black"], categories: [], themes: [], technologies: [], industry: "Tech", shape: "Circle",
  source_url: "https://example.com", status: "published", published_at: "2026-11-01T00:00:00.000Z", updated_at: "2026-11-13 10:00:00.123456+00",
  creator_updated_at: "2026-11-01 00:00:00+00", creator_visible: true, media: [{ type: "image", url: "https://media.inspora.design/logo.png", alt: "Mark", width: 10, height: 10 }] };
const entry = (forRow: typeof row) => ({ id, sourceFingerprint: sourceFingerprint(forRow), scope: "brand", visualNotes: "A round black mark on a pale ground.", typography: null,
  typographyIsSubject: false, evidence: { mediaMetadataSha256: mediaFingerprint(forRow), primarySha256: "a".repeat(64), frameSha256: [], reviewedAt: "2026-11-13T10:00:00.000Z" } });

beforeEach(() => {
  resetCatalogReviewCache();
  external.assert.mockReset();
  external.query.mockReset();
  external.read.mockReset().mockResolvedValue({ version: 1, entries: [entry(row)] });
  external.rows = [row];
});
afterEach(() => vi.useRealTimers());

it("reports current catalog-review notes for the work the MCP fingerprints", async () => {
  expect(await catalogReviewStatus(id)).toBe("review");
  expect(external.query).toHaveBeenCalledTimes(1);
});

it("reports catalog-review notes that no longer match an edited work", async () => {
  external.rows = [{ ...row, description: "An edited description", updated_at: "2026-11-19 09:00:00.5+00" }];
  expect(await catalogReviewStatus(id)).toBe("review-stale");
});

it("returns null when the work has no catalog-review entry or is not in the public catalog", async () => {
  external.read.mockResolvedValue({ version: 1, entries: [] });
  expect(await catalogReviewStatus(id)).toBeNull();
  expect(external.query).not.toHaveBeenCalled();
  resetCatalogReviewCache();
  external.read.mockResolvedValue({ version: 1, entries: [entry(row)] });
  external.rows = [];
  expect(await catalogReviewStatus(id)).toBeNull();
});

it("falls back to null outside production, on storage errors and when the lookup is slow", async () => {
  external.assert.mockImplementation(() => { throw new Error("Catalog delivery requires the production main deployment."); });
  expect(await catalogReviewStatus(id)).toBeNull();
  external.assert.mockReset();
  external.read.mockRejectedValue(new Error("R2 unavailable"));
  expect(await catalogReviewStatus(id)).toBeNull();
  // A failed read is not cached: the next page load tries again.
  external.read.mockResolvedValue({ version: 1, entries: [entry(row)] });
  expect(await catalogReviewStatus(id)).toBe("review");
  resetCatalogReviewCache();
  vi.useFakeTimers();
  external.read.mockReturnValue(new Promise(() => {}));
  const pending = catalogReviewStatus(id);
  await vi.advanceTimersByTimeAsync(3000);
  expect(await pending).toBeNull();
});

it("reads the enrichment object once per cache window", async () => {
  await catalogReviewStatus(id);
  await catalogReviewStatus(id);
  expect(external.read).toHaveBeenCalledTimes(1);
});
