import { beforeEach, expect, it, vi } from "vitest";
import { cacheLife, cacheTag } from "next/cache";
import { requireDatabase } from "@/db/client";
import { readWorkCounts, readWorkPage } from "./index";
import { websiteFixture } from "./testing/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ requireDatabase: vi.fn() }));
vi.mock("./clock", () => ({ evaluationTime: () => new Date("2026-09-01T00:00:00Z") }));

const request = { scope: { kind: "saved", userId: "viewer-a" }, order: "saved-desc" } as const;
const findMany = vi.fn();
const selection = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), getSQL: vi.fn(), groupBy: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockReset();
  selection.groupBy.mockReset();
  for (const method of [selection.from, selection.leftJoin, selection.where]) method.mockReturnValue(selection);
  vi.mocked(requireDatabase).mockReturnValue({
    select: () => selection,
    query: { savedPosts: { findMany } },
  } as unknown as ReturnType<typeof requireDatabase>);
});

it("returns full saved pages with usable cards, bound continuation, and no public caching", async () => {
  const rows = Array.from({ length: 17 }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(17 - i).padStart(12, "0")}`,
    createdAt: new Date("2026-08-31T00:00:00Z"),
    cursorSavedAt: "2026-08-31T00:00:00.000000Z",
    websiteId: `website-${i}`,
    website: { ...websiteFixture(), id: `website-${i}` },
    postId: null, logoId: null, post: null, logo: null,
  }));
  findMany.mockResolvedValue(rows);
  const page = await readWorkPage(request);
  expect(page.items).toHaveLength(16);
  expect(page.items[0]).toMatchObject({ kind: "website", category: "Websites", website: { recording: { posterUrl: "/poster.webp" } } });
  expect(page.nextCursor).toEqual(expect.any(String));
  findMany.mockResolvedValue(rows.slice(16));
  const last = await readWorkPage({ ...request, cursor: page.nextCursor });
  expect(last.items.map(item => item.id)).toEqual(["website-16"]);
  expect(last.nextCursor).toBeNull();
  expect(cacheLife).not.toHaveBeenCalled();
  expect(cacheTag).not.toHaveBeenCalled();
});

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const boundCursor = {
  v: 1, scope: { kind: "saved", userId: "viewer-a" }, filters: { category: null }, order: "saved-desc",
  keys: { savedAt: "2026-08-31T00:00:00.000Z", id: "11111111-1111-4111-8111-111111111111" },
};
it.each([
  ["malformed", "garbage"],
  ["other viewer", encode({ ...boundCursor, scope: { kind: "saved", userId: "viewer-b" } })],
  ["other scope", encode({ ...boundCursor, scope: { kind: "creator", userId: "viewer-a" } })],
  ["filter", encode({ ...boundCursor, filters: { category: "Web" } })],
  ["order", encode({ ...boundCursor, order: "created-desc" })],
  ["version", encode({ ...boundCursor, v: 2 })],
  ["bad timestamp", encode({ ...boundCursor, keys: { ...boundCursor.keys, savedAt: "bad" } })],
  ["bad UUID", encode({ ...boundCursor, keys: { ...boundCursor.keys, id: "bad" } })],
  ["legacy unbound", encode(boundCursor.keys)],
])("rejects %s saved cursors before selection and permits a fresh load", async (_name, cursor) => {
  await expect(readWorkPage({ ...request, cursor })).rejects.toThrow(/cursor/i);
  expect(requireDatabase).not.toHaveBeenCalled();
  findMany.mockResolvedValue([]);
  expect(await readWorkPage(request)).toEqual({ items: [], nextCursor: null });
});

it.each([
  { ...request, filters: { view: "featured" } },
  { ...request, filters: { category: "Unknown" } },
  { ...request, order: "created-desc" },
  { ...request, scope: { kind: "saved", userId: "" } },
])("rejects unsupported saved requests before selection: %j", async invalid => {
  await expect(readWorkPage(invalid as typeof request)).rejects.toThrow(/Unsupported/);
  expect(requireDatabase).not.toHaveBeenCalled();
});

it("counts directly without hydration or caching and rejects cursors on count requests", async () => {
  selection.groupBy.mockResolvedValue([{ category: "Web", count: 2 }, { category: "Logos", count: 3 }, { category: "Websites", count: 1 }]);
  expect(await readWorkCounts({ scope: request.scope })).toEqual({ total: 6, categories: { Web: 2, Logos: 3, Websites: 1 } });
  expect(findMany).not.toHaveBeenCalled();
  expect(cacheLife).not.toHaveBeenCalled();
  expect(cacheTag).not.toHaveBeenCalled();
  vi.mocked(requireDatabase).mockClear();
  await expect(readWorkCounts({ scope: request.scope, cursor: encode(boundCursor) } as never)).rejects.toThrow(/Unsupported/);
  expect(requireDatabase).not.toHaveBeenCalled();
});

it("propagates configured query failures for pages and counts", async () => {
  findMany.mockRejectedValueOnce(new Error("query failed"));
  selection.groupBy.mockRejectedValueOnce(new Error("count failed"));
  await expect(readWorkPage(request)).rejects.toThrow("query failed");
  await expect(readWorkCounts({ scope: request.scope })).rejects.toThrow("count failed");
});

it.each(["missing target", "missing creator", "incomplete website", "future", "missing publication", "draft"])("fails the complete page on %s", async failure => {
  const good = { id: "save", createdAt: new Date(), websiteId: "website", website: websiteFixture(), postId: null, logoId: null, post: null, logo: null };
  const bad = structuredClone(good);
  if (failure === "missing target") Object.assign(bad, { website: null });
  if (failure === "missing creator") Object.assign(bad.website, { creator: null });
  if (failure === "incomplete website") bad.website.sections = [];
  if (failure === "future") bad.website.publishedAt = new Date("2026-09-02T00:00:00Z");
  if (failure === "missing publication") bad.website.publishedAt = null;
  if (failure === "draft") bad.website.status = "draft";
  findMany.mockResolvedValue([good, bad]);
  await expect(readWorkPage(request)).rejects.toThrow();
});

it.each(["missing media", "malformed media", "invalid kind"])("fails a saved logo with %s instead of dropping it", async failure => {
  const logo = {
    ...websiteFixture(), kind: failure === "invalid kind" ? "mark" : "logo",
    media: failure === "missing media" ? [] : failure === "malformed media" ? [{}] : [{ url: "/logo.webp", width: 100, height: 100 }],
  };
  findMany.mockResolvedValue([{ id: "save", logoId: logo.id, logo, websiteId: null, postId: null }]);
  await expect(readWorkPage(request)).rejects.toThrow();
});

it("fails the whole saved page for a missing design cover and recovers after repair", async () => {
  const good = {
    id: "saved-website", websiteId: "website", website: websiteFixture(),
    postId: null, logoId: null,
  };
  const post = {
    id: "design", slug: "design", title: "Design", category: "Web",
    status: "published", publishedAt: new Date("2026-08-31T00:00:00Z"),
    createdAt: new Date("2026-08-31T00:00:00Z"),
    creator: websiteFixture().creator, media: [],
  };
  const savedDesign = { id: "saved-design", postId: post.id, post, logoId: null, websiteId: null };
  findMany.mockResolvedValue([good, savedDesign]);
  await expect(readWorkPage(request)).rejects.toThrow(/design.*cover/i);

  selection.groupBy.mockResolvedValue([{ category: "Web", count: 1 }, { category: "Websites", count: 1 }]);
  expect(await readWorkCounts({ scope: request.scope })).toEqual({
    total: 2, categories: { Web: 1, Websites: 1 },
  });

  const cover = { id: "cover", type: "image", url: "/cover.webp", width: 100, height: 100, alt: "Cover" };
  findMany.mockResolvedValue([good, { ...savedDesign, post: { ...post, media: [cover] } }]);
  const page = await readWorkPage(request);
  expect(page.items.map(item => item.id)).toEqual([good.website.id, post.id]);
  expect(page.items[1]).toMatchObject({ media: [cover], mediaCount: 1 });
  expect(page.nextCursor).toBeNull();
});
