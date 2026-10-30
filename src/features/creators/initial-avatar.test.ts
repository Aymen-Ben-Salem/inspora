import { beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ import: vi.fn(), lookup: vi.fn(), find: vi.fn(), write: vi.fn(), cleanup: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./avatar-import", () => ({ defaultCreatorAvatar: { avatarUrl: "/brand/default-avatar.svg", avatarStorageProvider: null, avatarStorageKey: null }, importCreatorAvatarUrl: io.import }));
vi.mock("./x-api", () => ({ lookupXAccountById: io.lookup }));
vi.mock("@/db/client", () => ({ requireDatabase: () => ({ query: { creators: { findFirst: io.find } } }) }));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: io.write }));
vi.mock("@/storage/media-storage", () => ({ deleteManagedMediaAssetsSafely: io.cleanup }));
import { initialCreatorAvatar, initializeCreatorAvatar } from "./initial-avatar";

const user = { imageUrl: "https://img.clerk.com/photo", externalAccounts: [{ provider: "oauth_x", providerUserId: "123456", verification: { status: "verified" } }] };
const stored = { avatarUrl: "https://media.example/creators/new.webp", avatarStorageProvider: "r2", avatarStorageKey: "creators/new.webp" };
beforeEach(() => { vi.resetAllMocks(); io.import.mockResolvedValue(stored); io.lookup.mockResolvedValue({ id: "123456", username: "person", profileImageUrl: "https://pbs.twimg.com/profile_images/123/photo_normal.jpg" }); });

it("keeps a suitable custom provider photo without spending an X lookup", async () => {
  expect(await initialCreatorAvatar(user)).toEqual(stored);
  expect(io.import).toHaveBeenCalledExactlyOnceWith(user.imageUrl);
  expect(io.lookup).not.toHaveBeenCalled();
});
it("replaces an undersized Clerk thumbnail using the verified stable X account ID", async () => {
  io.import.mockRejectedValueOnce(new Error("too small"));
  expect(await initialCreatorAvatar(user)).toEqual(stored);
  expect(io.lookup).toHaveBeenCalledExactlyOnceWith("123456");
  expect(io.import).toHaveBeenLastCalledWith("https://pbs.twimg.com/profile_images/123/photo_normal.jpg");
});
it("never uses an unverified X association", async () => {
  io.import.mockRejectedValue(new Error("too small"));
  expect(await initialCreatorAvatar({ ...user, externalAccounts: [{ ...user.externalAccounts[0], verification: { status: "unverified" } }] })).toMatchObject({ avatarUrl: "/brand/default-avatar.svg" });
  expect(io.lookup).not.toHaveBeenCalled();
});
it("falls back to the default when the X API or its image fails", async () => {
  io.import.mockRejectedValue(new Error("failed"));
  io.lookup.mockRejectedValue(new Error("rate limited"));
  expect(await initialCreatorAvatar(user)).toMatchObject({ avatarUrl: "/brand/default-avatar.svg" });
});
it("does not fetch photos for an existing changed/trashed/claimed profile", async () => {
  io.find.mockResolvedValue(undefined);
  await initializeCreatorAvatar("creator", "owner", user);
  expect(io.import).not.toHaveBeenCalled();
  expect(io.lookup).not.toHaveBeenCalled();
});
it("discards the imported candidate if a manual edit wins the race", async () => {
  io.find.mockResolvedValue({ id: "creator" });
  io.write.mockResolvedValue(false);
  await initializeCreatorAvatar("creator", "owner", user);
  expect(io.cleanup).toHaveBeenCalledWith([{ storageProvider: "r2", storageKey: stored.avatarStorageKey, type: "image" }]);
});

it("does not delete a photo when the database commit outcome is unknown", async () => {
  io.find.mockResolvedValue({ id: "creator" });
  io.write.mockRejectedValue(new Error("Connection lost during commit"));
  await expect(initializeCreatorAvatar("creator", "owner", user)).rejects.toThrow("Connection lost");
  expect(io.cleanup).not.toHaveBeenCalled();
});
