import { describe, expect, it } from "vitest";

import { seedPosts } from "../data/seed-posts";

import { isGifUrl, isPostCategory, POST_CATEGORIES } from "./post";

describe("post categories", () => {
  it("accepts every category exposed by the feed", () => {
    for (const category of POST_CATEGORIES) {
      expect(isPostCategory(category)).toBe(true);
    }

    expect(isPostCategory("Interface")).toBe(false);
  });
});

describe("GIF media", () => {
  it("recognizes local and remote GIF paths without relying on query parameters", () => {
    expect(isGifUrl("/media/loop.GIF?version=2")).toBe(true);
    expect(isGifUrl("https://media.example.com/loop.gif")).toBe(true);
    expect(isGifUrl("https://example.com/image.jpg?format=gif")).toBe(false);
  });
});

describe("seed posts", () => {
  it("has unique slugs and at least one valid media item per post", () => {
    const slugs = new Set(seedPosts.map((post) => post.slug));

    expect(slugs.size).toBe(seedPosts.length);
    expect(seedPosts.every((post) => post.media.length > 0)).toBe(true);
    expect(
      seedPosts.every((post) =>
        post.media.every((media) => media.width > 0 && media.height > 0),
      ),
    ).toBe(true);
  });
});
