import { beforeEach, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ saveCreator: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/creators/identity", () => ({
  saveAdminCreatorForAttribution: external.saveCreator,
}));
vi.mock("@/db/write-client", () => ({
  withWriteTransaction: async (work: (tx: unknown) => Promise<unknown>) =>
    work({ insert: () => ({ values: async () => undefined }) }),
}));

import { createAdminPost } from "./posts-repository";
import type { AdminPostInput } from "./types";

const oldAvatar = { storageProvider: "r2", storageKey: "creators/old.webp", type: "image" };
const input: AdminPostInput = {
  slug: "retained-avatar", title: "Retained avatar", description: "Fixture",
  creator: { id: "11111111-1111-4111-8111-111111111111", name: "Creator", avatarUrl: "/new.webp" },
  category: "Branding", industries: [], colors: [], styles: [],
  sourceUrl: "https://example.com/design", isFeatured: false, status: "draft",
  media: [{ type: "image", url: "/old.webp", storageProvider: "r2", storageKey: oldAvatar.storageKey, alt: "Retained", width: 100, height: 100 }],
};

beforeEach(() => {
  external.saveCreator.mockResolvedValue({ creatorId: input.creator.id, displacedAvatarAssets: [oldAvatar] });
});

it("keeps a displaced creator avatar used as the new design's media", async () => {
  const result = await createAdminPost(input, { userId: "admin" });
  expect(result.removedManagedMedia).toEqual([]);
});

it("keeps a displaced creator avatar used as a retained media variant", async () => {
  const result = await createAdminPost({ ...input, media: [{ ...input.media[0], storageKey: "posts/main.webp", variants: [{ url: "/old.webp", storageKey: oldAvatar.storageKey, width: 100, height: 100, bytes: 100, format: "webp" }] }] }, { userId: "admin" });
  expect(result.removedManagedMedia).toEqual([]);
});

it("returns a displaced avatar when the design does not retain it", async () => {
  const result = await createAdminPost({ ...input, media: [{ ...input.media[0], storageKey: "posts/main.webp" }] }, { userId: "admin" });
  expect(result.removedManagedMedia).toEqual([oldAvatar]);
});
