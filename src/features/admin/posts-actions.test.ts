import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  parse: vi.fn(),
  cleanup: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ userId: "admin-1" })),
}));
vi.mock("next/cache", () => ({
  updateTag: external.updateTag,
  revalidatePath: external.revalidatePath,
}));
vi.mock("next/navigation", () => ({ redirect: external.redirect }));
vi.mock("@/data/posts-repository", () => ({
  PUBLISHED_POSTS_CACHE_TAG: "published-posts",
}));
vi.mock("@/data/logos-repository", () => ({
  PUBLISHED_LOGOS_CACHE_TAG: "published-logos",
}));
vi.mock("@/data/websites-repository", () => ({
  PUBLISHED_WEBSITES_CACHE_TAG: "published-websites",
}));
vi.mock("@/data/sponsor-repository", () => ({
  SPONSOR_CACHE_TAG: "sponsor",
}));
vi.mock("@/features/profiles/cache", () => ({
  PUBLIC_CREATOR_PROFILES_CACHE_TAG: "public-creator-profiles",
}));
vi.mock("@/storage/media-storage", () => ({
  deleteManagedMediaAssetsSafely: external.cleanup,
}));
vi.mock("./post-validation", () => ({
  parseAdminPostForm: external.parse,
  formatValidationError: vi.fn(() => "invalid"),
}));
vi.mock("./posts-repository", () => ({
  createAdminPost: external.create,
  updateAdminPost: external.update,
  archiveAdminPost: vi.fn(),
  deleteArchivedPost: vi.fn(),
  setAdminPostFeatured: vi.fn(),
}));
vi.mock("./logos-repository", () => ({
  createAdminLogo: vi.fn(), updateAdminLogo: vi.fn(), archiveAdminLogo: vi.fn(),
  deleteArchivedLogo: vi.fn(),
}));
vi.mock("./websites-repository", () => ({
  createAdminWebsite: vi.fn(), updateAdminWebsite: vi.fn(), archiveAdminWebsite: vi.fn(),
  deleteArchivedWebsite: vi.fn(), setAdminWebsiteFeatured: vi.fn(),
}));
vi.mock("./sponsor-repository", () => ({
  deleteAdminSponsor: vi.fn(), saveAdminSponsor: vi.fn(), setAdminSponsorActive: vi.fn(),
}));
vi.mock("./subscribers-repository", () => ({
  deleteSubscriber: vi.fn(), unsubscribeSubscriber: vi.fn(),
}));

import { AdminCreatorMutationError } from "@/features/creators/identity";
import { createPostAction, updatePostAction } from "./actions";

describe("design save action effects", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.clearAllMocks();
    external.parse.mockReturnValue({ creator: { name: "Creator" } });
  });

  it("runs cleanup and invalidation only after a committed create", async () => {
    const removedManagedMedia = [
      { storageProvider: "r2", storageKey: "creators/old.webp", type: "image" },
    ];
    external.create.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "saved-design",
      removedManagedMedia,
    });

    await expect(createPostAction({ status: "idle" }, new FormData())).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(external.create).toHaveBeenCalledWith(
      { creator: { name: "Creator" } },
      { userId: "admin-1" },
    );
    expect(external.cleanup).toHaveBeenCalledWith(removedManagedMedia);
    expect(external.updateTag).toHaveBeenCalledWith("public-creator-profiles");
    expect(external.updateTag).toHaveBeenCalledWith("published-posts");
  });

  it("does not clean up or invalidate when the transaction rejects", async () => {
    external.create.mockRejectedValue(new Error("rolled back"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(createPostAction({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "error",
      message: "The post could not be saved. Try again.",
    });
    expect(external.cleanup).not.toHaveBeenCalled();
    expect(external.updateTag).not.toHaveBeenCalled();
    expect(external.revalidatePath).not.toHaveBeenCalled();
  });

  it("preserves creator-specific conflict errors", async () => {
    external.create.mockRejectedValue(
      new AdminCreatorMutationError("conflict", "That username is unavailable."),
    );

    await expect(createPostAction({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "error",
      message: "That username is unavailable.",
    });
  });

  it("maps concurrent creator uniqueness failures to the creator field", async () => {
    external.create.mockRejectedValue(
      Object.assign(new Error("unique violation"), {
        code: "23505",
        constraint: "creator_username_aliases_lower_unique",
      }),
    );

    await expect(createPostAction({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "error",
      message: "That creator username is unavailable.",
    });
  });

  it("combines committed update cleanup with work and profile invalidation", async () => {
    const removedManagedMedia = [
      { storageProvider: "r2", storageKey: "posts/old.webp", type: "image" },
      { storageProvider: "r2", storageKey: "creators/old.webp", type: "image" },
    ];
    external.update.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "new-slug",
      previousSlug: "old-slug",
      removedManagedMedia,
    });

    await expect(
      updatePostAction(
        "11111111-1111-4111-8111-111111111111",
        { status: "idle" },
        new FormData(),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(external.update).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      { creator: { name: "Creator" } },
      { userId: "admin-1" },
    );
    expect(external.cleanup).toHaveBeenCalledWith(removedManagedMedia);
    expect(external.updateTag).toHaveBeenCalledWith("public-creator-profiles");
    expect(external.revalidatePath).toHaveBeenCalledWith("/posts/old-slug");
  });
});
