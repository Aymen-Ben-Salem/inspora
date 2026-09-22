import { beforeEach, expect, it, vi } from "vitest";
import { cacheLife, cacheTag } from "next/cache";
import { websiteFixture } from "./testing/fixtures";
import { incompletePresentations } from "./testing/completeness";
import { getPublishedCreatorWorkPage, getPublishedCreatorWorkCounts } from "@/features/profiles/repository";
import { getDatabase } from "@/db/client";
import { readWorkCounts, readWorkPage, readWorkIdentities } from "./index";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: vi.fn(), requireDatabase: vi.fn(() => getDatabase()) }));
const execute = vi.fn();
const scope = { kind: "creator", creatorId: "11111111-1111-4111-8111-111111111111" } as const;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDatabase).mockReturnValue({ execute } as never);
  execute.mockResolvedValue({ rows: [] });
});
it("reads empty creator pages and direct counts through the shared boundary", async () => {
  expect(await readWorkPage({ scope, order: "publication-desc" })).toEqual({ items: [], nextCursor: null });
  expect(await readWorkCounts({ scope })).toEqual({ total: 0, filters: {} });
  expect(execute).toHaveBeenCalledTimes(2);
});

it("keeps identity reads fresh and free of page/count caches", async () => {
  execute.mockResolvedValueOnce({ rows: [{ kind: "logo", id: scope.creatorId }] }).mockResolvedValueOnce({ rows: [] });
  expect(await readWorkIdentities({ scope })).toEqual([{ kind: "logo", id: scope.creatorId }]);
  expect(await readWorkIdentities({ scope })).toEqual([]);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(cacheTag).not.toHaveBeenCalled();
  expect(cacheLife).not.toHaveBeenCalled();
});
it("owns all creator page/count dependency tags and their existing lifetimes", async () => {
  await getPublishedCreatorWorkPage({ creatorId: scope.creatorId, filter: "all" });
  await getPublishedCreatorWorkCounts(scope.creatorId);
  expect(cacheLife).toHaveBeenCalledTimes(2);
  expect(cacheLife).toHaveBeenCalledWith({ stale: 300, revalidate: 21600, expire: 604800 });
  expect(cacheTag).toHaveBeenCalledTimes(2);
  expect(cacheTag).toHaveBeenCalledWith("public-creator-profiles", "published-posts", "published-logos", "published-websites");
});
it("preserves explicit no-database adapter behavior and propagates configured failures", async () => {
  vi.mocked(getDatabase).mockReturnValue(null);
  expect(await getPublishedCreatorWorkPage({ creatorId: scope.creatorId, filter: "all" })).toEqual({ items: [], nextCursor: null });
  expect(await getPublishedCreatorWorkCounts(scope.creatorId)).toEqual({ total: 0, filters: {} });
  await expect(readWorkIdentities({ scope })).rejects.toThrow();
  vi.mocked(getDatabase).mockReturnValue({ execute } as never);
  execute.mockRejectedValue(new Error("query failed"));
  await expect(getPublishedCreatorWorkPage({ creatorId: scope.creatorId, filter: "all" })).rejects.toThrow("query failed");
  await expect(getPublishedCreatorWorkCounts(scope.creatorId)).rejects.toThrow("query failed");
  await expect(readWorkIdentities({ scope })).rejects.toThrow("query failed");
});
it.each([
  { rows: undefined }, { rows: [null] }, { rows: [{ kind: "icon", id: scope.creatorId }] },
  { rows: [{ kind: "design", id: "invalid" }] },
])("fails malformed identity reads instead of producing an empty result: %j", async result => {
  execute.mockResolvedValue(result);
  await expect(readWorkIdentities({ scope })).rejects.toThrow();
});
it.each([
  { filter: "unknown", count: 2 }, { filter: "logos", count: -1 },
  { filter: "Web", count: null }, { filter: "Web", count: 1.5 },
])("fails malformed count data: %j", async row => {
  execute.mockResolvedValue({ rows: [row] });
  await expect(readWorkCounts({ scope })).rejects.toThrow();
});
function selectedWebsite() {
  const payload = { ...websiteFixture(), id: scope.creatorId, creatorId: scope.creatorId };
  return { id: payload.id, kind: "website", publishedAt: payload.publishedAt!.toISOString(), filter: "websites", payload };
}
it.each(incompletePresentations)("fails selected incomplete websites without returning partial cards: $name", async ({ change }) => {
  const row = selectedWebsite();
  change(row.payload);
  execute.mockResolvedValue({ rows: [selectedWebsite(), row] });
  await expect(readWorkPage({ scope, order: "publication-desc" })).rejects.toThrow(/incomplete/);
});
it.each([null, undefined, {}, { id: "bad" }])("fails a missing or malformed selected payload: %j", async payload => {
  execute.mockResolvedValue({ rows: [{ ...selectedWebsite(), payload }] });
  await expect(readWorkPage({ scope, order: "publication-desc" })).rejects.toThrow();
});
it("rejects invalid cursors before any selection and recovers with a fresh load", async () => {
  const rows = Array.from({ length: 17 }, (_, i) => {
    const row = selectedWebsite();
    const id = "22222222-2222-4222-8222-" + String(i).padStart(12, "0");
    return { ...row, id, payload: { ...row.payload, id } };
  });
  execute.mockResolvedValueOnce({ rows });
  const first = await readWorkPage({ scope, order: "publication-desc" });
  expect(first.items).toHaveLength(16);
  const decoded = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8"));
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const invalid = [
    "malformed!", encode({ ...decoded, v: 2 }), encode({ ...decoded, order: "created-desc" }),
    encode({ ...decoded, scope: { ...scope, creatorId: "33333333-3333-4333-8333-333333333333" } }),
    encode({ ...decoded, filter: "Web" }), encode({ ...decoded, keys: { ...decoded.keys, id: "bad" } }),
    encode({ ...decoded, keys: { ...decoded.keys, publishedAt: "tomorrow" } }), encode(decoded.keys),
  ];
  execute.mockClear();
  for (const cursor of invalid) {
    await expect(readWorkPage({ scope, order: "publication-desc", cursor })).rejects.toThrow(/cursor/);
  }
  expect(execute).not.toHaveBeenCalled();
  expect(await readWorkPage({ scope, order: "publication-desc" })).toEqual({ items: [], nextCursor: null });
});
it("rejects unsupported creator filters, orders and identity/count cursors", async () => {
  await expect(readWorkPage({ scope, order: "created-desc" } as never)).rejects.toThrow(/Unsupported/);
  await expect(readWorkPage({ scope, order: "publication-desc", filters: { category: "Web" } } as never)).rejects.toThrow(/Unsupported/);
  await expect(readWorkCounts({ scope, cursor: "anything" } as never)).rejects.toThrow(/Unsupported/);
  await expect(readWorkIdentities({ scope, filters: { filter: "Web" } } as never)).rejects.toThrow(/Unsupported/);
  expect(execute).not.toHaveBeenCalled();
});


it.each([
  { kind: "unknown" }, { media: [] }, { media: [{ id: "media", url: "/logo", width: 0, height: 100 }] },
])("preserves malformed logo integrity failures without silently omitting cards: %j", async change => {
  const payload = { ...selectedWebsite().payload, kind: "logo", media: [{ id: "media", url: "/logo", width: 100, height: 100 }], ...change };
  execute.mockResolvedValue({ rows: [{ id: payload.id, kind: "logo", publishedAt: payload.publishedAt!.toISOString(), filter: "logos", payload }] });
  await expect(readWorkPage({ scope, order: "publication-desc" })).rejects.toThrow();
});
it.each([null, "2099-01-01T00:00:00.000Z"])("fails inconsistent selected publication %s", async publishedAt => {
  const row = selectedWebsite();
  execute.mockResolvedValue({ rows: [{ ...row, payload: { ...row.payload, publishedAt } }] });
  await expect(readWorkPage({ scope, order: "publication-desc" })).rejects.toThrow();
});
