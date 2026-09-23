import { beforeEach, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ saveCreator: vi.fn() }));
const selectResults: unknown[][] = [];
const transaction = {
  insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  })),
  delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        const result = selectResults.shift() ?? [];
        return {
          for: vi.fn(async () => result),
          then: (resolve: (value: unknown[]) => unknown) => resolve(result),
        };
      }),
    })),
  })),
};

vi.mock("server-only", () => ({}));
vi.mock("@/features/creators/identity", () => ({
  saveAdminCreatorForAttribution: external.saveCreator,
}));
vi.mock("@/db/write-client", () => ({
  withWriteTransaction: async (work: (tx: unknown) => Promise<unknown>) =>
    work(transaction),
}));

import { createAdminLogo, updateAdminLogo } from "./logos-repository";
import type { AdminLogoInput } from "./types";

const retainedAvatar = {
  storageProvider: "r2",
  storageKey: "creators/retained.webp",
  type: "image",
} as const;
const input: AdminLogoInput = {
  slug: "transactional-logo",
  title: "Transactional logo",
  kind: "logo",
  creator: { name: "Creator", avatarUrl: "/new.webp" },
  description: "Fixture",
  industry: "Technology",
  colors: [],
  styles: [],
  shape: "wordmark",
  sourceUrl: "https://example.com/logo",
  status: "draft",
  media: {
    url: "/retained.webp",
    storageProvider: "r2",
    storageKey: retainedAvatar.storageKey,
    alt: "Retained avatar",
    width: 100,
    height: 100,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  selectResults.length = 0;
  external.saveCreator.mockResolvedValue({
    creatorId: "11111111-1111-4111-8111-111111111111",
    displacedAvatarAssets: [retainedAvatar],
  });
});

it("saves logo attribution through the caller-owned transaction", async () => {
  await createAdminLogo(input, { userId: "admin-1" });

  expect(external.saveCreator).toHaveBeenCalledWith(
    transaction,
    { userId: "admin-1" },
    input.creator,
  );
});

it("keeps a displaced creator avatar retained by the new logo", async () => {
  const result = await createAdminLogo(input, { userId: "admin-1" });

  expect(result.removedManagedMedia).toEqual([]);
});

it("cleans removed variants when the logo keeps its primary asset", async () => {
  const removedVariantKey = "logos/removed-variant.webp";
  selectResults.push(
    [{ slug: "transactional-logo", status: "draft", publishedAt: null }],
    [{
      storageProvider: "r2",
      storageKey: retainedAvatar.storageKey,
      variants: [{ storageKey: removedVariantKey }],
    }],
    [{ avatarStorageKey: null }],
  );
  external.saveCreator.mockResolvedValue({
    creatorId: "11111111-1111-4111-8111-111111111111",
    displacedAvatarAssets: [],
  });

  const result = await updateAdminLogo(
    "33333333-3333-4333-8333-333333333333",
    input,
    { userId: "admin-1" },
  );

  expect(result.removedManagedMedia).toEqual([{
    storageProvider: "r2",
    storageKey: removedVariantKey,
    type: "image",
  }]);
});
