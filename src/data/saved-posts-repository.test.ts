import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(() => null),
  requireDatabase: vi.fn(),
}));
vi.mock("@/db/schema", () => import("../db/schema"));
vi.mock("./logos-repository", () => ({ mapPublishedLogo: vi.fn() }));
vi.mock("./websites-repository", () => ({ mapPublishedWebsite: vi.fn() }));
vi.mock("./posts-repository", () => ({ getPostCardsByIds: vi.fn() }));

import {
  decodeSavedPostCursor,
  encodeSavedPostCursor,
  getSavedPostPage,
  savePostForUser,
  unsavePostForUser,
  SavedPostUnavailableError,
} from "./saved-posts-repository";
import { getDatabase, requireDatabase } from "@/db/client";
import { getPostCardsByIds } from "./posts-repository";
import { mapPublishedLogo } from "./logos-repository";
import { mapPublishedWebsite } from "./websites-repository";
import { savedPosts, posts, logos, websites } from "../db/schema";
import { PgDialect } from "drizzle-orm/pg-core";

describe("saving all archive types", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { table: posts, key: "postId", misses: 0 },
    { table: logos, key: "logoId", misses: 1 },
    { table: websites, key: "websiteId", misses: 2 },
  ])("saves $key using its foreign key and an idempotent insert", async ({ table, key, misses }) => {
    const limit = vi.fn();
    for (let index = 0; index < misses; index++) limit.mockResolvedValueOnce([]);
    limit.mockResolvedValueOnce([{ id: "item-id" }]);
    const from = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) });
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(requireDatabase).mockReturnValue({ select: vi.fn().mockReturnValue({ from }), insert } as unknown as ReturnType<typeof requireDatabase>);

    await savePostForUser("user-a", "item-id");

    expect(from).toHaveBeenLastCalledWith(table);
    expect(insert).toHaveBeenCalledWith(savedPosts);
    expect(values).toHaveBeenCalledWith({ userId: "user-a", [key]: "item-id" });
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("rejects unavailable content without creating a save", async () => {
    const insert = vi.fn();
    const limit = vi.fn().mockResolvedValue([]);
    vi.mocked(requireDatabase).mockReturnValue({ select: () => ({ from: () => ({ where: () => ({ limit }) }) }), insert } as unknown as ReturnType<typeof requireDatabase>);
    await expect(savePostForUser("user-a", "missing")).rejects.toBeInstanceOf(SavedPostUnavailableError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("scopes removal to the current user across all three targets", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    vi.mocked(requireDatabase).mockReturnValue({ delete: () => ({ where }) } as unknown as ReturnType<typeof requireDatabase>);
    await unsavePostForUser("user-a", "item-id");
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.params).toEqual(["user-a", "item-id", "item-id", "item-id"]);
    expect(query.sql).toContain('"user_id" =');
    for (const column of ["post_id", "logo_id", "website_id"]) expect(query.sql).toContain(column);
  });
});

describe("saved-post pagination", () => {
  it("preserves newest-saved order when a page mixes all three archives", async () => {
    const savedAt = new Date("2026-09-17T00:00:00Z");
    const rows = [
      { id: "save-3", postId: "website-1", websiteId: "website-1", logoId: null, category: "Websites", savedAt },
      { id: "save-2", postId: "post-1", websiteId: null, logoId: null, category: "Web", savedAt },
      { id: "save-1", postId: "logo-1", websiteId: null, logoId: "logo-1", category: "Logos", savedAt },
    ];
    const query = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn().mockResolvedValue(rows) };
    for (const method of [query.from, query.leftJoin, query.where, query.orderBy]) method.mockReturnValue(query);
    const database = {
      select: () => query,
      query: {
        logos: { findMany: vi.fn().mockResolvedValue([{ id: "logo-1" }]) },
        websites: { findMany: vi.fn().mockResolvedValue([{ id: "website-1" }]) },
      },
    };
    vi.mocked(getDatabase).mockReturnValue(database as unknown as ReturnType<typeof getDatabase>);
    vi.mocked(getPostCardsByIds).mockResolvedValue([{ id: "post-1" }] as Awaited<ReturnType<typeof getPostCardsByIds>>);
    vi.mocked(mapPublishedLogo).mockReturnValue({ id: "logo-1" } as ReturnType<typeof mapPublishedLogo>);
    vi.mocked(mapPublishedWebsite).mockReturnValue({ id: "website-1" } as ReturnType<typeof mapPublishedWebsite>);

    const page = await getSavedPostPage({ userId: "user-a" });

    expect(page.items.map((item) => [item.id, item.category])).toEqual([
      ["website-1", "Websites"], ["post-1", "Web"], ["logo-1", "Logos"],
    ]);
    expect(page.nextCursor).toBeNull();
    expect(getPostCardsByIds).toHaveBeenCalledWith(["post-1"]);
    const filter = new PgDialect().sqlToQuery(query.where.mock.calls[0][0]);
    expect(filter.params).toContain("user-a");
    expect(filter.params.filter((value) => value === "published")).toHaveLength(3);
  });

  it("round-trips a newest-saved cursor", () => {
    const cursor = {
      savedAt: "2026-09-16T12:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    };

    expect(decodeSavedPostCursor(encodeSavedPostCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed cursors before querying", async () => {
    expect(decodeSavedPostCursor("not-a-cursor")).toBeNull();
    await expect(
      getSavedPostPage({ userId: "user_alpha", cursor: "not-a-cursor" }),
    ).rejects.toThrow("Invalid saved-post cursor.");
  });
});
