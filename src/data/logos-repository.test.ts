import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheLife, cacheTag, getDatabase, readWorkPage } = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  getDatabase: vi.fn(),
  readWorkPage: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife, cacheTag }));
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ getDatabase }));
vi.mock("@/db/schema", () => ({ creators: {}, logoMedia: {}, logos: {} }));
vi.mock("@/domain/logo", async () => import("../domain/logo"));
vi.mock("@/storage/types", async () => import("../storage/types"));
vi.mock("./public-work", () => ({ readWorkPage }));

import {
  getPublishedLogos,
  mapPublishedLogo,
} from "./logos-repository";

describe("published logos repository", () => {
  beforeEach(() => {
    cacheLife.mockClear();
    cacheTag.mockClear();
    getDatabase.mockReset();
    readWorkPage.mockReset();
    getDatabase.mockReturnValue(null);
  });

  it("keeps the empty no-database fallback outside public archive caching", async () => {
    await expect(getPublishedLogos()).resolves.toEqual([]);
    expect(cacheLife).not.toHaveBeenCalled();
    expect(cacheTag).not.toHaveBeenCalled();
  });

  it("delegates configured complete-array archives to public-work reads", async () => {
    getDatabase.mockReturnValue({});
    readWorkPage.mockResolvedValue({ items: [], nextCursor: null });

    await expect(getPublishedLogos()).resolves.toEqual([]);
    expect(readWorkPage).toHaveBeenCalledWith({
      scope: { kind: "logo-archive" },
      order: "created-desc",
    });

    readWorkPage.mockRejectedValueOnce(new Error("query failed"));
    await expect(getPublishedLogos()).rejects.toThrow("Could not load logos");
  });

  it("maps normalized rows to the public logo shape", () => {
    const publishedAt = new Date("2026-09-01T00:00:00.000Z");
    const logo = mapPublishedLogo({
      id: "00000000-0000-4000-8000-000000000001",
      slug: "paper",
      title: "Paper",
      kind: "logo",
      creatorId: "00000000-0000-4000-8000-000000000002",
      description: "A clean combination mark.",
      industry: "SaaS",
      colors: ["Black", "White"],
      styles: ["Clean"],
      shape: "Symbol & text",
      sourceUrl: "https://example.com/paper",
      status: "published",
      publishedAt,
      archivedAt: null,
      createdBy: null,
      updatedBy: null,
      createdAt: publishedAt,
      updatedAt: publishedAt,
      creator: {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Nero Pursue",
        handle: null,
        username: null,
        url: null,
        xProfileUrl: null,
        xProviderId: null,
        ownerUserId: null,
        editedFields: [],
        recordOrigin: "mirrored",
        avatarUrl: "/brand/default-avatar.svg",
        avatarStorageProvider: null,
        avatarStorageKey: null,
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
      media: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          logoId: "00000000-0000-4000-8000-000000000001",
          url: "/paper.webp",
          storageProvider: null,
          storageKey: null,
          mimeType: "image/webp",
          sourceMimeType: "image/png",
          sizeBytes: 1200,
          variants: [],
          alt: "Paper logo",
          width: 1080,
          height: 659,
          createdAt: publishedAt,
        },
      ],
    });

    expect(logo).toMatchObject({
      slug: "paper",
      kind: "logo",
      creator: { name: "Nero Pursue" },
      media: { alt: "Paper logo", width: 1080, height: 659 },
    });
    expect(logo.publishedAt).toBe(publishedAt.toISOString());
  });
});
