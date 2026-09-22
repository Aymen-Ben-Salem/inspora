import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(() => null),
  requireDatabase: vi.fn(),
}));
vi.mock("@/db/schema", () => import("../db/schema"));
vi.mock("./public-work", () => ({ readWorkPage: vi.fn(), readWorkCounts: vi.fn() }));

import {
  decodeSavedPostCursor,
  encodeSavedPostCursor,
  getSavedPostPage,
  getSavedPostCounts,
  savePostForUser,
  unsavePostForUser,
  SavedPostUnavailableError,
} from "./saved-posts-repository";
import { getDatabase, requireDatabase } from "@/db/client";
import { readWorkPage, readWorkCounts } from "./public-work";
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

describe("saved-post pagination and counts adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDatabase).mockReturnValue({} as NonNullable<ReturnType<typeof getDatabase>>);
  });

  it("delegates the trusted viewer and filters while tab counts deliberately stay unfiltered", async () => {
    const page = { items: [], nextCursor: null };
    vi.mocked(readWorkPage).mockResolvedValue(page);
    vi.mocked(readWorkCounts).mockResolvedValue({ total: 2, categories: { Web: 1, Logos: 1 } });
    expect(await getSavedPostPage({ userId: "viewer-a", category: "Web" })).toEqual(page);
    expect(readWorkPage).toHaveBeenCalledWith({ scope: { kind: "saved", userId: "viewer-a" }, filters: { category: "Web" }, order: "saved-desc", cursor: undefined });
    expect(await getSavedPostCounts("viewer-a")).toEqual({ total: 2, categories: { Web: 1, Logos: 1 } });
    expect(readWorkCounts).toHaveBeenCalledWith({ scope: { kind: "saved", userId: "viewer-a" } });
  });

  it("retains explicit no-database empty pages and counts", async () => {
    vi.mocked(getDatabase).mockReturnValue(null);
    expect(await getSavedPostPage({ userId: "viewer-a" })).toEqual({ items: [], nextCursor: null });
    expect(await getSavedPostCounts("viewer-a")).toEqual({ total: 0, categories: {} });
    expect(readWorkPage).not.toHaveBeenCalled();
    expect(readWorkCounts).not.toHaveBeenCalled();
  });

  it("propagates configured read failures", async () => {
    vi.mocked(readWorkPage).mockRejectedValueOnce(new Error("query failed"));
    vi.mocked(readWorkCounts).mockRejectedValueOnce(new Error("count failed"));
    await expect(getSavedPostPage({ userId: "viewer-a" })).rejects.toThrow("query failed");
    await expect(getSavedPostCounts("viewer-a")).rejects.toThrow("count failed");
  });

  it("round-trips only a bound newest-saved cursor", () => {
    const keys = { savedAt: "2026-09-16T12:00:00.000Z", id: "11111111-1111-4111-8111-111111111111" };
    const binding = { userId: "viewer-a", category: "Web" as const };
    const cursor = encodeSavedPostCursor(keys, binding);
    expect(decodeSavedPostCursor(cursor, binding)).toEqual(keys);
    expect(decodeSavedPostCursor(cursor, { ...binding, userId: "viewer-b" })).toBeNull();
  });

  it("rejects malformed cursors before database access, including without a database", async () => {
    vi.mocked(getDatabase).mockReturnValue(null);
    await expect(getSavedPostPage({ userId: "viewer-a", cursor: "not-a-cursor" })).rejects.toThrow("Invalid saved-post cursor.");
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
