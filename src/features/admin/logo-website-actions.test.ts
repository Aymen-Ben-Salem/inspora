import { beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({
  createLogo: vi.fn(),
  createWebsite: vi.fn(),
  parseLogo: vi.fn(),
  parseWebsite: vi.fn(),
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
vi.mock("@/data/posts-repository", () => ({ PUBLISHED_POSTS_CACHE_TAG: "published-posts" }));
vi.mock("@/data/logos-repository", () => ({ PUBLISHED_LOGOS_CACHE_TAG: "published-logos" }));
vi.mock("@/data/websites-repository", () => ({ PUBLISHED_WEBSITES_CACHE_TAG: "published-websites" }));
vi.mock("@/data/sponsor-repository", () => ({ SPONSOR_CACHE_TAG: "sponsor" }));
vi.mock("@/features/profiles/cache", () => ({
  PUBLIC_CREATOR_PROFILES_CACHE_TAG: "public-creator-profiles",
}));
vi.mock("@/features/creators/identity", () => ({
  AdminCreatorMutationError: class AdminCreatorMutationError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  },
}));
vi.mock("@/storage/media-storage", () => ({
  deleteManagedMediaAssetsSafely: external.cleanup,
}));
vi.mock("./logo-validation", () => ({ parseAdminLogoForm: external.parseLogo }));
vi.mock("./website-validation", () => ({ parseAdminWebsiteForm: external.parseWebsite }));
vi.mock("./post-validation", () => ({
  parseAdminPostForm: vi.fn(),
  formatValidationError: vi.fn(() => "invalid"),
}));
vi.mock("./logos-repository", () => ({
  createAdminLogo: external.createLogo,
  updateAdminLogo: vi.fn(),
  archiveAdminLogo: vi.fn(),
  deleteArchivedLogo: vi.fn(),
}));
vi.mock("./websites-repository", () => ({
  createAdminWebsite: external.createWebsite,
  updateAdminWebsite: vi.fn(),
  archiveAdminWebsite: vi.fn(),
  deleteArchivedWebsite: vi.fn(),
  setAdminWebsiteFeatured: vi.fn(),
}));
vi.mock("./posts-repository", () => ({
  createAdminPost: vi.fn(),
  updateAdminPost: vi.fn(),
  archiveAdminPost: vi.fn(),
  deleteArchivedPost: vi.fn(),
  setAdminPostFeatured: vi.fn(),
}));
vi.mock("./sponsor-repository", () => ({
  deleteAdminSponsor: vi.fn(),
  saveAdminSponsor: vi.fn(),
  setAdminSponsorActive: vi.fn(),
}));
vi.mock("./subscribers-repository", () => ({
  deleteSubscriber: vi.fn(),
  unsubscribeSubscriber: vi.fn(),
}));

import { AdminCreatorMutationError } from "@/features/creators/identity";
import { createLogoAction, createWebsiteAction } from "./actions";

describe.each([
  {
    kind: "logo",
    action: createLogoAction,
    create: external.createLogo,
    parse: external.parseLogo,
    workTag: "published-logos",
    errorMessage: "The logo could not be saved. Try again.",
  },
  {
    kind: "website",
    action: createWebsiteAction,
    create: external.createWebsite,
    parse: external.parseWebsite,
    workTag: "published-websites",
    errorMessage: "The website could not be saved. Try again.",
  },
])("$kind save action effects", ({ action, create, parse, workTag, errorMessage }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    parse.mockReturnValue({ creator: { name: "Creator" } });
  });

  it("passes the trusted principal and runs effects only after commit", async () => {
    const removedManagedMedia = [
      { storageProvider: "r2", storageKey: "creators/old.webp", type: "image" },
    ];
    create.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "saved-work",
      removedManagedMedia,
    });

    await expect(action({ status: "idle" }, new FormData())).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(create).toHaveBeenCalledWith(
      { creator: { name: "Creator" } },
      { userId: "admin-1" },
    );
    expect(external.cleanup).toHaveBeenCalledWith(removedManagedMedia);
    expect(external.updateTag).toHaveBeenCalledWith("public-creator-profiles");
    expect(external.updateTag).toHaveBeenCalledWith(workTag);
  });

  it("does not run effects after rollback", async () => {
    create.mockRejectedValue(new Error("rolled back"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(action({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "error",
      message: errorMessage,
    });
    expect(external.cleanup).not.toHaveBeenCalled();
    expect(external.updateTag).not.toHaveBeenCalled();
  });

  it("preserves creator-specific errors", async () => {
    create.mockRejectedValue(
      new AdminCreatorMutationError("conflict", "That username is unavailable."),
    );

    await expect(action({ status: "idle" }, new FormData())).resolves.toEqual({
      status: "error",
      message: "That username is unavailable.",
    });
  });
});
