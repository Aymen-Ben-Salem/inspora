import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ database: vi.fn(), select: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ requireDatabase: mocks.database }));
vi.mock("next/cache", () => ({ cacheTag: mocks.cacheTag, cacheLife: mocks.cacheLife }));
vi.mock("next/server", () => ({ connection: async () => {} }));

import sitemap from "@/app/sitemap";

function rows(value: unknown[]) {
  const query = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, orderBy: async () => value };
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.database.mockReturnValue({ select: mocks.select });
});

it("returns canonical public routes with encoded segments and no invented logo/website detail URLs", async () => {
  mocks.select.mockReturnValueOnce(rows([{ slug: "design&one" }])).mockReturnValueOnce(rows([{ username: "MixedCase" }]));
  const result = await sitemap();
  expect(result.map(entry => entry.url)).toEqual([
    "https://www.inspora.design/", "https://www.inspora.design/logos", "https://www.inspora.design/websites",
    "https://www.inspora.design/info", "https://www.inspora.design/sponsor",
    "https://www.inspora.design/posts/design%26one", "https://www.inspora.design/creators/MixedCase",
  ]);
});

it("uses existing publication/profile invalidation and a bounded periodic expiry", async () => {
  mocks.select.mockReturnValue(rows([]));
  await sitemap();
  expect(mocks.cacheTag).toHaveBeenCalledWith("published-posts", "public-creator-profiles");
  expect(mocks.cacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 240, expire: 300 });
});

it("fails instead of publishing a partial or empty replacement when the database is unavailable", async () => {
  mocks.database.mockImplementation(() => { throw new Error("database unavailable"); });
  await expect(sitemap()).rejects.toThrow("database unavailable");
});
