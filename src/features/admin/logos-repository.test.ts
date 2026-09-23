import { beforeEach, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ saveCreator: vi.fn() }));
const transaction = {
  insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
};

vi.mock("server-only", () => ({}));
vi.mock("@/features/creators/identity", () => ({
  saveAdminCreatorForAttribution: external.saveCreator,
}));
vi.mock("@/db/write-client", () => ({
  withWriteTransaction: async (work: (tx: unknown) => Promise<unknown>) =>
    work(transaction),
}));

import { createAdminLogo } from "./logos-repository";
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
