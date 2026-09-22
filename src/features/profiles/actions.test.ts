import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), ensure: vi.fn(), update: vi.fn(), avatar: vi.fn(), verify: vi.fn(), deleteAssets: vi.fn(), revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, reverificationError: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag, revalidatePath: mocks.revalidatePath,
  updateTag: () => { throw new Error("updateTag can only be called from within a Server Action."); },
}));
vi.mock("@/features/creators/identity", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/creators/identity")>(),
  ensureCreatorForOwner: mocks.ensure,
  updateOwnedCreatorProfile: mocks.update,
  updateOwnedCreatorAvatar: mocks.avatar,
}));
vi.mock("@/data/posts-repository", () => ({ PUBLISHED_POSTS_CACHE_TAG: "posts" }));
vi.mock("@/data/logos-repository", () => ({ PUBLISHED_LOGOS_CACHE_TAG: "logos" }));
vi.mock("@/data/websites-repository", () => ({ PUBLISHED_WEBSITES_CACHE_TAG: "websites" }));
vi.mock("@/features/admin/media-upload", () => ({ MAX_IMAGE_UPLOAD_BYTES: 10000000, getMediaUploadLimit: vi.fn() }));
vi.mock("@/storage/r2", () => ({
  verifyR2Upload: mocks.verify,
  isStorageKeyForKind: (key: string) => key.startsWith("creators/"),
  getR2PublicUrl: (key: string) => "https://media.example/" + key,
  deleteR2MediaAssets: mocks.deleteAssets,
}));
vi.mock("./account-lifecycle", () => ({}));

import { updateOwnProfile, completeOwnAvatarUpload } from "./actions";
import { ProfileMutationError } from "@/features/creators/identity";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "trusted-owner" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it("allows the profile API to refresh caches after committed profile entry and edits", async () => {
  mocks.update.mockImplementation(async () => { expect(mocks.revalidateTag).not.toHaveBeenCalled(); });
  expect(await updateOwnProfile({ name: "Ada" })).toEqual({ ok: true });
  expect(mocks.ensure).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith({ userId: "trusted-owner" }, { name: "Ada" });
  expect(mocks.revalidateTag).toHaveBeenCalledWith("public-creator-profiles", { expire: 0 });
});

it("does not edit or invalidate caches after an identity failure", async () => {
  mocks.update.mockRejectedValue(new Error("database connection failed"));
  expect(await updateOwnProfile({ name: "Ada" })).toEqual({ ok: false, field: "form", message: "Your profile could not be saved. Try again." });
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

const avatarInput = { fileName: "avatar.png", sourceContentType: "image/png", contentType: "image/webp", size: 1234, storageKey: "creators/new.webp" };

it.each([
  ["name", "Enter your name.", "invalid_input"],
  ["username", "That username is unavailable.", "unavailable_username"],
  ["form", "Your creator profile was not found.", "missing_creator"],
  ["form", "This account is not active.", "inactive_account"],
  ["form", "Your creator ownership changed. Reload and try again.", "ownership_conflict"],
  ["form", "The database is unavailable. Try again.", "database_unavailable"],
] as const)("preserves %s errors for %s", async (field, message, code) => {
  mocks.update.mockRejectedValue(new ProfileMutationError(field, message, code));
  expect(await updateOwnProfile({ name: "Ada" })).toEqual({ ok: false, field, message });
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("normalizes explicit fields and ignores browser-supplied ownership", async () => {
  expect(await updateOwnProfile({ username: " @Ada Lovelace ", websiteUrl: "", ownerUserId: "other", creatorId: "other" } as never)).toEqual({ ok: true });
  expect(mocks.update).toHaveBeenCalledWith({ userId: "trusted-owner" }, { username: "ada_lovelace", websiteUrl: null });
  expect(mocks.revalidateTag.mock.calls).toEqual([
    ["public-creator-profiles", { expire: 0 }], ["posts", { expire: 0 }], ["logos", { expire: 0 }], ["websites", { expire: 0 }],
  ]);
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/creators/[username]", "page");
});

it.each([
  [{ name: " " }, "name"], [{ username: "admin" }, "username"], [{ websiteUrl: "https://user:password@example.com" }, "websiteUrl"],
] as const)("rejects invalid transport input %j", async (input, field) => {
  expect(await updateOwnProfile(input)).toMatchObject({ ok: false, field });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
});

it("refuses signed-out edits without writes or upload verification", async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  expect(await updateOwnProfile({ name: "Ada" })).toMatchObject({ ok: false, field: "form" });
  expect(await completeOwnAvatarUpload(avatarInput)).toMatchObject({ ok: false });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.verify).not.toHaveBeenCalled();
});

it("cleans displaced avatars only after commit and still succeeds if storage cleanup fails", async () => {
  const displaced = [{ storageProvider: "r2", storageKey: "creators/old.webp", type: "image" }];
  mocks.avatar.mockImplementation(async () => {
    expect(mocks.verify).toHaveBeenCalled();
    expect(mocks.deleteAssets).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    return { profile: { avatarUrl: "https://media.example/creators/new.webp" }, displacedAvatarAssets: displaced };
  });
  mocks.deleteAssets.mockRejectedValue(new Error("Storage unavailable"));
  expect(await completeOwnAvatarUpload(avatarInput)).toEqual({ ok: true, avatarUrl: "https://media.example/creators/new.webp" });
  expect(mocks.avatar).toHaveBeenCalledWith({ userId: "trusted-owner" }, { storageKey: avatarInput.storageKey, url: "https://media.example/creators/new.webp" });
  expect(mocks.deleteAssets).toHaveBeenCalledWith(displaced);
  expect(mocks.revalidateTag).toHaveBeenCalledWith("public-creator-profiles", { expire: 0 });
  expect(console.error).toHaveBeenCalledWith("Managed media cleanup failed", expect.any(Error));
});

it("does not delete retained assets", async () => {
  mocks.avatar.mockResolvedValue({ profile: { avatarUrl: "retained" }, displacedAvatarAssets: [] });
  expect(await completeOwnAvatarUpload(avatarInput)).toEqual({ ok: true, avatarUrl: "retained" });
  expect(mocks.deleteAssets).not.toHaveBeenCalled();
});

it("does not clean assets or invalidate after a rolled-back avatar write", async () => {
  mocks.avatar.mockRejectedValue(new ProfileMutationError("form", "This account is not active.", "inactive_account"));
  expect(await completeOwnAvatarUpload(avatarInput)).toEqual({ ok: false, message: "This account is not active." });
  expect(mocks.deleteAssets).not.toHaveBeenCalled();
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("rejects failed upload verification before the identity write", async () => {
  mocks.verify.mockRejectedValue(new Error("Invalid uploaded file"));
  expect(await completeOwnAvatarUpload(avatarInput)).toMatchObject({ ok: false });
  expect(mocks.avatar).not.toHaveBeenCalled();
  expect(mocks.deleteAssets).not.toHaveBeenCalled();
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
});
