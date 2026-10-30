import { beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ fetch: vi.fn(), store: vi.fn(), freeze: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/sponsorship/metadata", () => ({ metadataFetcher: { fetchPublic: io.fetch } }));
vi.mock("@/storage/r2", () => ({ storeCreatorAvatar: io.store, freezeAdminCreatorAvatar: io.freeze, getR2PublicUrl: (key: string) => `https://media.example/${key}` }));
import { importCreatorAvatarUrl, prepareAdminCreatorAvatar } from "./avatar-import";
import { CreatorAvatarError, DEFAULT_CREATOR_AVATAR } from "./avatar-policy";

beforeEach(() => {
  vi.resetAllMocks();
  io.fetch.mockResolvedValue({ url: new URL("https://images.example/photo.jpg"), bytes: new Uint8Array([1]) });
  io.store.mockResolvedValue({ url: "https://media.example/creators/new.webp", storageKey: "creators/new.webp" });
  io.freeze.mockResolvedValue({ url: "https://media.example/creators/frozen.webp", storageKey: "creators/frozen.webp" });
});

it("downloads the larger X variant through the bounded public transport and stores inspected bytes", async () => {
  expect(await importCreatorAvatarUrl("https://pbs.twimg.com/profile_images/123/photo_normal.jpg")).toMatchObject({ avatarStorageProvider: "r2", avatarStorageKey: "creators/new.webp" });
  expect(io.fetch).toHaveBeenCalledWith("https://pbs.twimg.com/profile_images/123/photo_400x400.jpg", 10 * 1024 * 1024, expect.any(AbortSignal));
  expect(io.store).toHaveBeenCalledWith(new Uint8Array([1]));
});

it("reports actual image quality failures instead of trusting a 400x400 URL", async () => {
  io.store.mockRejectedValue(new CreatorAvatarError("Choose a photo at least 400 × 400 pixels."));
  await expect(importCreatorAvatarUrl("https://images.example/400x400.jpg")).rejects.toThrow("400 × 400");
});

it.each(["http://images.example/photo.png", "/other-photo.svg", "https://user:password@images.example/photo.png"])("rejects invalid photo sources before downloading %s", async url => {
  await expect(importCreatorAvatarUrl(url)).rejects.toThrow();
  expect(io.fetch).not.toHaveBeenCalled();
});

it("preserves an unchanged legacy/custom avatar and returns only avatar fields", async () => {
  const existing = { name: "Old name", avatarUrl: "https://images.example/old.jpg", avatarStorageProvider: null, avatarStorageKey: null };
  expect(await prepareAdminCreatorAvatar({ avatarUrl: existing.avatarUrl }, existing, "https://pbs.twimg.com/new.jpg")).toEqual({ avatarUrl: existing.avatarUrl, avatarStorageProvider: null, avatarStorageKey: null });
  expect(io.fetch).not.toHaveBeenCalled();
});

it("uses verified X photo metadata only when the admin leaves the default", async () => {
  await prepareAdminCreatorAvatar({ avatarUrl: DEFAULT_CREATOR_AVATAR }, undefined, "https://pbs.twimg.com/profile_images/123/photo_normal.jpg");
  expect(io.fetch).toHaveBeenCalledOnce();
  io.fetch.mockClear();
  await prepareAdminCreatorAvatar({ avatarUrl: "https://images.example/custom.jpg" }, undefined, "https://pbs.twimg.com/ignored.jpg");
  expect(io.fetch.mock.calls[0][0]).toBe("https://images.example/custom.jpg");
});

it("keeps profile creation available when the automatic X photo fails", async () => {
  io.fetch.mockRejectedValue(new Error("unavailable"));
  expect(await prepareAdminCreatorAvatar({ avatarUrl: DEFAULT_CREATOR_AVATAR }, undefined, "https://pbs.twimg.com/profile_images/123/photo.jpg")).toMatchObject({ avatarUrl: DEFAULT_CREATOR_AVATAR, avatarStorageKey: null });
});

it("freezes a new managed upload and rejects a mismatched URL", async () => {
  expect(await prepareAdminCreatorAvatar({ avatarUrl: "https://media.example/creators/upload.webp", avatarStorageProvider: "r2", avatarStorageKey: "creators/upload.webp" })).toMatchObject({ avatarStorageKey: "creators/frozen.webp" });
  await expect(prepareAdminCreatorAvatar({ avatarUrl: "https://images.example/unrelated.jpg", avatarStorageProvider: "r2", avatarStorageKey: "creators/upload.webp" })).rejects.toThrow("does not match");
});
