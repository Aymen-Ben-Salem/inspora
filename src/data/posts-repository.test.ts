import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheLife, cacheTag, getDatabase } = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  getDatabase: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife, cacheTag }));
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ getDatabase }));
vi.mock("@/db/schema", () => ({ postMedia: {}, posts: {} }));
vi.mock("@/domain/post", async () => import("../domain/post"));

import {
  getAdjacentPosts,
  getPostBySlug,
  getPostPage,
  getPublishedSlugs,
  PUBLISHED_POSTS_CACHE_TAG,
} from "./posts-repository";

describe("published post caching", () => {
  beforeEach(() => {
    cacheLife.mockClear();
    cacheTag.mockClear();
    getDatabase.mockReset();
    getDatabase.mockReturnValue(null);
  });

  it("assigns a bounded cache lifetime and invalidation tag", async () => {
    await getPostPage();

    expect(cacheLife).toHaveBeenCalledWith({
      stale: 300,
      revalidate: 21600,
      expire: 604800,
    });
    expect(cacheTag).toHaveBeenCalledWith(PUBLISHED_POSTS_CACHE_TAG);
  });

  it("resolves a post from the shared published collection", async () => {
    const page = await getPostPage();
    const expected = page.items[0];

    expect(expected).toBeDefined();
    await expect(getPostBySlug(expected!.slug)).resolves.toEqual(
      expect.objectContaining({
        id: expected!.id,
        slug: expected!.slug,
        description: expect.any(String),
      }),
    );
    expect(expected).not.toHaveProperty("description");
    expect(expected!.media).toHaveLength(Math.min(1, expected!.mediaCount));
  });

  it("returns focused navigation and slug data without requiring a full media page", async () => {
    const page = await getPostPage();
    const current = page.items[0];

    expect(current).toBeDefined();
    await expect(getPublishedSlugs()).resolves.toContain(current!.slug);
    await expect(getAdjacentPosts(current!)).resolves.toEqual({
      previousPost: expect.objectContaining({ slug: expect.any(String) }),
      nextPost: expect.objectContaining({ slug: expect.any(String) }),
    });
  });

  it("retries a transient failure while loading published slugs", async () => {
    const findMany = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce([{ slug: "recovered-post" }]);

    getDatabase.mockReturnValue({
      query: { posts: { findMany } },
    });

    await expect(getPublishedSlugs()).resolves.toEqual(["recovered-post"]);
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
