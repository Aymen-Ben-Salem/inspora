import { beforeEach, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  unstableRethrow: vi.fn(),
  parse: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  review: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  updateTag: external.updateTag,
  revalidatePath: external.revalidatePath,
}));
vi.mock("next/navigation", () => ({
  redirect: external.redirect,
  unstable_rethrow: external.unstableRethrow,
}));
vi.mock("@/data/logos-repository", () => ({
  PUBLISHED_LOGOS_CACHE_TAG: "logos",
}));
vi.mock("@/data/posts-repository", () => ({
  PUBLISHED_POSTS_CACHE_TAG: "posts",
}));
vi.mock("@/data/websites-repository", () => ({
  PUBLISHED_WEBSITES_CACHE_TAG: "websites",
}));
vi.mock("@/features/creators/identity", () => ({
  AdminCreatorMutationError: class extends Error {},
  createAdminCreator: external.create,
  deleteAdminCreator: vi.fn(),
  updateAdminCreator: external.update,
  reviewCreatorOwnershipClaim: external.review,
}));
vi.mock("@/features/creators/validation", () => ({
  parseAdminCreatorForm: external.parse,
}));
vi.mock("@/storage/media-storage", () => ({
  deleteManagedMediaAssetsSafely: external.remove,
}));

import { PUBLIC_CREATOR_PROFILES_CACHE_TAG } from "@/features/profiles/cache";
import { reviewCreatorClaimAction, saveCreatorAction } from "./creator-actions";

beforeEach(() => {
  vi.clearAllMocks();
  external.parse.mockReturnValue({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Studio",
    username: "studio",
    avatarUrl: "/avatar.svg",
  });
  external.update.mockResolvedValue({
    creator: {},
    removedManagedMedia: [
      { storageProvider: "r2", storageKey: "creators/old.webp", type: "image" },
    ],
  });
});

it("runs cleanup and creator-profile invalidation only after a committed save", async () => {
  await expect(
    saveCreatorAction({ status: "idle" }, new FormData()),
  ).rejects.toThrow("redirect");

  expect(external.update).toHaveBeenCalledTimes(1);
  expect(external.remove).toHaveBeenCalledWith([
    { storageProvider: "r2", storageKey: "creators/old.webp", type: "image" },
  ]);
  expect(external.updateTag).toHaveBeenCalledWith(
    PUBLIC_CREATOR_PROFILES_CACHE_TAG,
  );
  expect(external.updateTag).toHaveBeenCalledWith("posts");
  expect(external.redirect).toHaveBeenCalled();
});

it("does not clean up or invalidate when the identity write fails", async () => {
  external.update.mockRejectedValueOnce(new Error("Creator not found."));

  await expect(
    saveCreatorAction({ status: "idle" }, new FormData()),
  ).resolves.toMatchObject({ status: "error" });

  expect(external.remove).not.toHaveBeenCalled();
  expect(external.updateTag).not.toHaveBeenCalled();
  expect(external.revalidatePath).not.toHaveBeenCalled();
  expect(external.redirect).not.toHaveBeenCalled();
});

it("rethrows framework redirects from server-established admin authority", async () => {
  const redirectError = new Error("NEXT_REDIRECT");
  external.update.mockRejectedValueOnce(redirectError);
  external.unstableRethrow.mockImplementationOnce((error) => {
    throw error;
  });

  await expect(
    saveCreatorAction({ status: "idle" }, new FormData()),
  ).rejects.toBe(redirectError);

  expect(external.remove).not.toHaveBeenCalled();
  expect(external.updateTag).not.toHaveBeenCalled();
  expect(external.redirect).not.toHaveBeenCalled();
});

it("delegates claim reviews without repeating the identity module's committed side effects", async () => {
  const form = new FormData();
  form.set("claimId", "11111111-1111-4111-8111-111111111111");
  form.set("decision", "reject");
  form.set("reason", "Reason");
  form.set("actorId", "untrusted-browser-actor");
  external.review.mockResolvedValue({ status: "rejected" });
  await reviewCreatorClaimAction(form);
  expect(external.review).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "reject", "Reason");
  expect(external.updateTag).not.toHaveBeenCalled();
  expect(external.revalidatePath).not.toHaveBeenCalled();
});

it("preserves the review error envelope and does not invalidate failed reviews", async () => {
  const form = new FormData();
  form.set("claimId", "11111111-1111-4111-8111-111111111111");
  form.set("decision", "reject");
  const error = new Error("Add a reason before rejecting this claim.");
  external.review.mockRejectedValueOnce(error);
  await expect(reviewCreatorClaimAction(form)).rejects.toBe(error);
  expect(external.updateTag).not.toHaveBeenCalled();
  expect(external.revalidatePath).not.toHaveBeenCalled();
});
