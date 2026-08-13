import { beforeEach, describe, expect, it, vi } from "vitest";

const { decodePostCursor, getPostPage } = vi.hoisted(() => ({
  decodePostCursor: vi.fn(),
  getPostPage: vi.fn(),
}));

vi.mock("@/data/post-pagination", () => ({ decodePostCursor }));
vi.mock("@/data/posts-repository", () => ({ getPostPage }));
vi.mock("@/domain/post", () => ({
  isPostCategory: (value: string) => value === "Web",
  isPostView: (value: string) => ["latest", "featured"].includes(value),
}));

import { GET } from "./route";

describe("GET /api/posts", () => {
  beforeEach(() => {
    getPostPage.mockReset();
    getPostPage.mockResolvedValue({ items: [], nextCursor: null });
    decodePostCursor.mockReset();
    decodePostCursor.mockImplementation((value: string) =>
      value === "valid-cursor" ? { createdAt: "2026-08-07T12:00:00.000Z", id: "post-id" } : null,
    );
  });

  it("loads a validated category and cursor page", async () => {
    const cursor = "valid-cursor";
    const response = await GET(
      new Request(
        `http://localhost/api/posts?category=Web&view=featured&cursor=${encodeURIComponent(cursor)}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(getPostPage).toHaveBeenCalledWith({
      category: "Web",
      view: "featured",
      cursor,
    });
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=120, s-maxage=300, stale-while-revalidate=3600",
    );
    await expect(response.json()).resolves.toEqual({ items: [], nextCursor: null });
  });

  it("rejects unsupported categories", async () => {
    const response = await GET(
      new Request("http://localhost/api/posts?category=Unknown"),
    );

    expect(response.status).toBe(400);
    expect(getPostPage).not.toHaveBeenCalled();
  });

  it("rejects malformed cursors", async () => {
    const response = await GET(
      new Request("http://localhost/api/posts?cursor=not-a-cursor"),
    );

    expect(response.status).toBe(400);
    expect(getPostPage).not.toHaveBeenCalled();
  });

  it("rejects unsupported post views", async () => {
    const response = await GET(
      new Request("http://localhost/api/posts?view=popular"),
    );

    expect(response.status).toBe(400);
    expect(getPostPage).not.toHaveBeenCalled();
  });
});
