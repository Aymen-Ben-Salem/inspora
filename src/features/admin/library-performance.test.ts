import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), findPosts: vi.fn(), findLogos: vi.fn(), findWebsites: vi.fn(), select: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/features/creators/identity", () => ({ saveAdminCreatorForAttribution: vi.fn() }));
vi.mock("../submissions/publication-assets", () => ({ protectPublicationMedia: vi.fn() }));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: vi.fn() }));
vi.mock("@/db/client", () => ({ requireDatabase: () => ({
  select: mocks.select,
  query: { posts: { findMany: mocks.findPosts }, logos: { findMany: mocks.findLogos }, websites: { findMany: mocks.findWebsites } },
}) }));
import { getAdminPosts } from "./posts-repository";
import { getAdminLogos } from "./logos-repository";
import { getAdminWebsites } from "./websites-repository";
import { adminThumbnailUrl, parseAdminPage } from "./library-pagination";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "admin" });
  for (const find of [mocks.findPosts, mocks.findLogos, mocks.findWebsites]) find.mockResolvedValue([]);
  mocks.select.mockReturnValue({ from: () => Promise.resolve([{ total: 100, published: 70, draft: 20, archived: 10, featured: 30 }]) });
});

it.each([
  ["posts", getAdminPosts, mocks.findPosts],
  ["logos", getAdminLogos, mocks.findLogos],
  ["websites", getAdminWebsites, mocks.findWebsites],
] as const)("bounds %s reads and preserves full-library totals without hydrating all records", async (_name, read, find) => {
  const result = await read();
  expect(mocks.auth).toHaveBeenCalledTimes(1);
  expect(find).toHaveBeenCalledTimes(1);
  expect(find.mock.calls[0][0]).toMatchObject({ limit: 24, offset: 0 });
  expect(mocks.select).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ items: [], page: 1, totalPages: 5, counts: { total: 100, published: 70, draft: 20, archived: 10 } });
});

it("filters featured posts in SQL and clamps an excessive page before reading rows", async () => {
  const result = await getAdminPosts({ page: Number.MAX_SAFE_INTEGER, view: "featured" });
  const options = mocks.findPosts.mock.calls[0][0];
  const query = new PgDialect().sqlToQuery(options.where);
  expect(query.sql).toContain('"posts"."is_featured"');
  expect(query.params).toContain(true);
  expect(options).toMatchObject({ limit: 24, offset: 24 });
  expect(result).toMatchObject({ page: 2, totalPages: 2 });
});

it("reads only recording thumbnails for website cards, leaving sections for the editor", async () => {
  await getAdminWebsites();
  const options = mocks.findWebsites.mock.calls[0][0];
  expect(options.with).not.toHaveProperty("sections");
  expect(options.with.media).toMatchObject({ limit: 1, columns: { posterUrl: true, alt: true } });
  expect(options.with.creator).toEqual({ columns: { name: true } });
});

it("does not execute library queries for an unauthorized request", async () => {
  mocks.auth.mockRejectedValue(new Error("denied"));
  await expect(getAdminPosts()).rejects.toThrow("denied");
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.findPosts).not.toHaveBeenCalled();
});

it.each([undefined, "", "0", "-1", "1.5", "Infinity", "99999999999999999999", "nope"])("normalizes invalid page %s", (value) => {
  expect(parseAdminPage(value)).toBe(1);
});

it("chooses existing smaller image assets for library thumbnails without changing editor originals", () => {
  const variant = (width: number) => ({ url: `/${width}.webp`, width, height: width, storageKey: `${width}.webp`, bytes: 100, format: "webp" as const });
  expect(adminThumbnailUrl("/large.png", [variant(1200), variant(400), variant(800)])).toBe("/800.webp");
  expect(adminThumbnailUrl("/large.png", [variant(400)])).toBe("/400.webp");
  expect(adminThumbnailUrl("/large.png", [])).toBe("/large.png");
});
