import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), ensure: vi.fn(), update: vi.fn(), revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, reverificationError: vi.fn() }));
vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag, revalidatePath: mocks.revalidatePath,
  updateTag: () => { throw new Error("updateTag can only be called from within a Server Action."); },
}));
vi.mock("@/features/creators/identity", () => ({ ensureCreatorForOwner: mocks.ensure }));
vi.mock("./repository", () => ({
  ProfileMutationError: class ProfileMutationError extends Error {},
  PUBLIC_CREATOR_PROFILES_CACHE_TAG: "public-creator-profiles",
  updateOwnedCreatorProfile: mocks.update,
  updateOwnedCreatorAvatar: vi.fn(),
}));
vi.mock("@/data/posts-repository", () => ({ PUBLISHED_POSTS_CACHE_TAG: "posts" }));
vi.mock("@/data/logos-repository", () => ({ PUBLISHED_LOGOS_CACHE_TAG: "logos" }));
vi.mock("@/data/websites-repository", () => ({ PUBLISHED_WEBSITES_CACHE_TAG: "websites" }));
vi.mock("@/features/admin/media-upload", () => ({ MAX_IMAGE_UPLOAD_BYTES: 10000000, getMediaUploadLimit: vi.fn() }));
vi.mock("@/storage/r2", () => ({}));
vi.mock("@/storage/media-storage", () => ({}));
vi.mock("./account-lifecycle", () => ({}));

import { updateOwnProfile } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "trusted-owner" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it("allows the profile API to refresh caches after committed profile entry and edits", async () => {
  mocks.update.mockImplementation(async () => { expect(mocks.revalidateTag).not.toHaveBeenCalled(); });
  expect(await updateOwnProfile({ name: "Ada" })).toEqual({ ok: true });
  expect(mocks.ensure).toHaveBeenCalledWith({ userId: "trusted-owner" });
  expect(mocks.update).toHaveBeenCalledWith("trusted-owner", { name: "Ada" });
  expect(mocks.revalidateTag).toHaveBeenCalledWith("public-creator-profiles", { expire: 0 });
});

it("does not edit or invalidate caches after an identity failure", async () => {
  mocks.ensure.mockRejectedValue(new Error("This account is not active."));
  expect(await updateOwnProfile({ name: "Ada" })).toEqual({ ok: false, field: "form", message: "Your profile could not be saved. Try again." });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.revalidateTag).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
