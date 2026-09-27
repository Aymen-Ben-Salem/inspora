import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ database: vi.fn(), orderBy: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: mocks.database }));
import { getDesignCategories, DESIGN_CATEGORIES_CACHE_TAG } from "./categories-repository";
import { POST_CATEGORIES } from "@/domain/post";
import { cacheTag } from "next/cache";

beforeEach(() => vi.clearAllMocks());
it("keeps the default categories available without a configured database", async () => {
  mocks.database.mockReturnValue(null);
  expect(await getDesignCategories()).toEqual(POST_CATEGORIES);
});
it("exposes persisted custom categories after the default categories", async () => {
  mocks.database.mockReturnValue({ select: () => ({ from: () => ({ orderBy: mocks.orderBy }) }) });
  mocks.orderBy.mockResolvedValue([...POST_CATEGORIES, "Typography", "Art & Design"].sort().map((name) => ({ name })));
  expect(await getDesignCategories()).toEqual([...POST_CATEGORIES, "Art & Design", "Typography"]);
  expect(cacheTag).toHaveBeenCalledWith(DESIGN_CATEGORIES_CACHE_TAG);
});
it("propagates configured database failures instead of hiding custom categories", async () => {
  mocks.database.mockReturnValue({ select: () => ({ from: () => ({ orderBy: mocks.orderBy }) }) });
  mocks.orderBy.mockRejectedValue(new Error("unavailable"));
  await expect(getDesignCategories()).rejects.toThrow("unavailable");
});
