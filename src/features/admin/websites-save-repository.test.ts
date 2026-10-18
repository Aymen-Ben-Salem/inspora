import { beforeEach, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ saveCreator: vi.fn() }));
const transaction = {
  insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
};

vi.mock("server-only", () => ({}));
vi.mock("../submissions/publication-assets", () => ({ protectPublicationMedia: vi.fn() }));
vi.mock("@/features/creators/identity", () => ({
  saveAdminCreatorForAttribution: external.saveCreator,
}));
vi.mock("@/db/write-client", () => ({
  withWriteTransaction: async (work: (tx: unknown) => Promise<unknown>) =>
    work(transaction),
}));

import { createAdminWebsite, insertAdminWebsiteInTransaction } from "./websites-repository";
import type { AdminWebsiteInput } from "./types";

const retainedAvatar = {
  storageProvider: "r2",
  storageKey: "creators/retained.webp",
  type: "image",
} as const;
const input: AdminWebsiteInput = {
  slug: "transactional-website",
  title: "Transactional website",
  tagline: "Fixture",
  creator: { name: "Creator", avatarUrl: "/new.webp" },
  description: "Fixture",
  categories: [],
  themes: [],
  technologies: ["React", "Next.js"],
  colors: [],
  sourceUrl: "https://example.com/website",
  isFeatured: false,
  status: "draft",
  media: [
    { role: "recording", url: "/recording.mp4", alt: "Recording", width: 1200, height: 900 },
    { role: "favicon", url: "/favicon.png", storageProvider: "r2", storageKey: retainedAvatar.storageKey, alt: "Favicon", width: 32, height: 32 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  external.saveCreator.mockResolvedValue({
    creatorId: "11111111-1111-4111-8111-111111111111",
    displacedAvatarAssets: [retainedAvatar],
  });
});

it("saves website attribution through the caller-owned transaction", async () => {
  await createAdminWebsite(input, { userId: "admin-1" });
  expect(external.saveCreator).toHaveBeenCalledWith(
    transaction,
    { userId: "admin-1" },
    input.creator,
  );
});

it("keeps a displaced creator avatar retained by the new website", async () => {
  const result = await createAdminWebsite(input, { userId: "admin-1" });
  expect(result.removedManagedMedia).toEqual([]);
});

it("persists technologies when creating a website and publishing reviewed work", async () => {
  await createAdminWebsite(input, { userId: "admin-1" });
  expect(transaction.insert.mock.results[0].value.values).toHaveBeenCalledWith(
    expect.objectContaining({ technologies: ["React", "Next.js"] }),
  );
  vi.clearAllMocks();
  await insertAdminWebsiteInTransaction(
    transaction as unknown as Parameters<typeof insertAdminWebsiteInTransaction>[0],
    input,
    "admin-1",
    "creator-1",
  );
  expect(transaction.insert.mock.results[0].value.values).toHaveBeenCalledWith(
    expect.objectContaining({ technologies: ["React", "Next.js"] }),
  );
});
