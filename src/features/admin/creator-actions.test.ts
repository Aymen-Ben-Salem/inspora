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
  trash: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
  review: vi.fn(),
  permanentlyDelete: vi.fn(), cleanup: vi.fn(), admin: vi.fn(), has: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: external.admin, AdminAuthConfigurationError: class extends Error {} }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ has: external.has }), reverificationError: () => ({ clerk_error: "reverification" }) }));
vi.mock("@/features/creators/identity/permanent-delete", () => ({ permanentlyDeleteCreator: external.permanentlyDelete }));
vi.mock("@/features/submissions/cleanup", () => ({ attemptCleanupKey: external.cleanup }));
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
  trashAdminCreator: external.trash,
  restoreAdminCreator: external.restore,
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
import { reviewCreatorClaimAction, saveCreatorAction, saveCreatorProfileAction, trashCreatorAction, restoreCreatorAction, deleteCreatorAction } from "./creator-actions";

beforeEach(() => {
  vi.clearAllMocks();
  external.admin.mockResolvedValue({ userId: "admin" }); external.has.mockReturnValue(true);
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

const deleteForm = () => { const form = new FormData(); form.set("creatorId", "11111111-1111-4111-8111-111111111111"); form.set("confirmation", "studio"); form.set("expectedUpdatedAt", "2026-10-30T00:00:00.000Z"); form.set("expectedWorkCount", "2"); return form; };
it("requires admin authentication and recent identity verification before permanent deletion", async () => {
  external.admin.mockRejectedValueOnce(new Error("denied"));
  await expect(deleteCreatorAction({ status: "idle" }, deleteForm())).rejects.toThrow("denied");
  external.has.mockReturnValueOnce(false);
  await expect(deleteCreatorAction({ status: "idle" }, deleteForm())).resolves.toMatchObject({ clerk_error: "reverification" });
  expect(external.permanentlyDelete).not.toHaveBeenCalled();
});
it("keeps failed storage or account cleanup visible after the deletion commits", async () => {
  external.permanentlyDelete.mockResolvedValueOnce({ cleanupKeys: ["account:owner", "creator-media:id"] });
  external.cleanup.mockResolvedValueOnce("pending").mockResolvedValueOnce("completed");
  await expect(deleteCreatorAction({ status: "idle" }, deleteForm())).rejects.toThrow("redirect");
  expect(external.redirect).toHaveBeenCalledWith("/admin/creators?view=trash&deleted=true&cleanup=pending");
  expect(external.remove).not.toHaveBeenCalled();
});
it("does not run cleanup or invalidate caches when permanent deletion rolls back", async () => {
  external.permanentlyDelete.mockRejectedValueOnce(new Error("Creator not found."));
  await expect(deleteCreatorAction({ status: "idle" }, deleteForm())).resolves.toMatchObject({ status: "error" });
  expect(external.cleanup).not.toHaveBeenCalled();
  expect(external.updateTag).not.toHaveBeenCalled();
});

it.each([
  [trashCreatorAction, external.trash, "/admin/creators?trashed=true"],
  [restoreCreatorAction, external.restore, "/admin/creators?view=trash&restored=true"],
] as const)("refreshes all public work after a committed lifecycle change without deleting media (%#)", async (action, mutate, location) => {
  const form = new FormData();
  form.set("creatorId", "11111111-1111-4111-8111-111111111111");
  mutate.mockResolvedValueOnce(undefined);
  await expect(action({ status: "idle" }, form)).rejects.toThrow("redirect");
  expect(mutate).toHaveBeenCalledWith(form.get("creatorId"));
  for (const tag of ["posts", "logos", "websites", PUBLIC_CREATOR_PROFILES_CACHE_TAG]) expect(external.updateTag).toHaveBeenCalledWith(tag);
  expect(external.remove).not.toHaveBeenCalled();
  expect(external.redirect).toHaveBeenCalledWith(location);
});

it.each([[trashCreatorAction, external.trash], [restoreCreatorAction, external.restore]] as const)("does not invalidate or delete media if a lifecycle change fails (%#)", async (action, mutate) => {
  const form = new FormData();
  form.set("creatorId", "11111111-1111-4111-8111-111111111111");
  mutate.mockRejectedValueOnce(new Error("Creator not found."));
  await expect(action({ status: "idle" }, form)).resolves.toMatchObject({ status: "error" });
  expect(external.remove).not.toHaveBeenCalled();
  expect(external.updateTag).not.toHaveBeenCalled();
  expect(external.redirect).not.toHaveBeenCalled();
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

it.each([saveCreatorAction, saveCreatorProfileAction])("rethrows framework redirects from server-established admin authority (%#)", async (save) => {
  const redirectError = new Error("NEXT_REDIRECT");
  external.update.mockRejectedValueOnce(redirectError);
  external.unstableRethrow.mockImplementationOnce((error) => {
    throw error;
  });

  await expect(
    save({ status: "idle" }, new FormData()),
  ).rejects.toBe(redirectError);

  expect(external.remove).not.toHaveBeenCalled();
  expect(external.updateTag).not.toHaveBeenCalled();
  expect(external.redirect).not.toHaveBeenCalled();
});

it("returns a saved profile to the review page without redirecting and refreshes review data", async () => {
  const creator = { id: "11111111-1111-4111-8111-111111111111", name: "Updated studio", username: "updated_studio" };
  external.update.mockResolvedValueOnce({ creator, removedManagedMedia: [] });
  await expect(saveCreatorProfileAction({ status: "idle" }, new FormData())).resolves.toEqual({ status: "idle", creator });
  expect(external.update).toHaveBeenCalledWith(creator.id, expect.objectContaining({ id: creator.id }));
  expect(external.remove).toHaveBeenCalledWith([]);
  expect(external.updateTag).toHaveBeenCalledWith(PUBLIC_CREATOR_PROFILES_CACHE_TAG);
  expect(external.revalidatePath).toHaveBeenCalledWith("/admin/submissions");
  expect(external.revalidatePath).toHaveBeenCalledWith("/admin/submissions/[id]", "page");
  expect(external.redirect).not.toHaveBeenCalled();
});

it("keeps failed in-place profile saves in the editor without cleanup or invalidation", async () => {
  external.update.mockRejectedValueOnce(new Error("That username is unavailable."));
  await expect(saveCreatorProfileAction({ status: "idle" }, new FormData())).resolves.toEqual({ status: "error", message: "That username is unavailable." });
  expect(external.remove).not.toHaveBeenCalled();
  expect(external.updateTag).not.toHaveBeenCalled();
  expect(external.revalidatePath).not.toHaveBeenCalled();
});

it("requires an existing creator for an in-place review edit", async () => {
  external.parse.mockReturnValueOnce({ name: "New creator", avatarUrl: "/avatar.svg" });
  await expect(saveCreatorProfileAction({ status: "idle" }, new FormData())).resolves.toMatchObject({ status: "error" });
  expect(external.create).not.toHaveBeenCalled();
  expect(external.update).not.toHaveBeenCalled();
  expect(external.updateTag).not.toHaveBeenCalled();
});

it("delegates claim reviews without repeating the identity module's committed side effects", async () => {
  const form = new FormData();
  form.set("claimId", "11111111-1111-4111-8111-111111111111");
  form.set("decision", "reject");
  form.set("reason", "Reason");
  form.set("actorId", "untrusted-browser-actor");
  form.set("version", "a".repeat(64));
  external.review.mockResolvedValue({ status: "rejected" });
  await reviewCreatorClaimAction(form);
  expect(external.remove).toHaveBeenCalledWith([]);
  expect(external.review).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "reject", "Reason", "a".repeat(64));
  expect(external.updateTag).not.toHaveBeenCalled();
  expect(external.revalidatePath).not.toHaveBeenCalled();
});

it("returns a visible review error and does not invalidate failed reviews", async () => {
  const form = new FormData();
  form.set("claimId", "11111111-1111-4111-8111-111111111111");
  form.set("decision", "reject");
  const error = new Error("Add a reason before rejecting this claim.");
  form.set("version", "a".repeat(64));
  external.review.mockRejectedValueOnce(error);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(reviewCreatorClaimAction(form)).resolves.toMatchObject({ status: "error" });
  log.mockRestore();
  expect(external.remove).not.toHaveBeenCalled();
  expect(external.updateTag).not.toHaveBeenCalled();
  expect(external.revalidatePath).not.toHaveBeenCalled();
});

it("cleans only the candidates returned by a committed claim review", async () => {
  const assets = [{ storageProvider: "r2", storageKey: "creators/displaced.webp", type: "image" }];
  external.review.mockResolvedValueOnce({ status: "claimed", creatorId: "survivor", displacedAvatarAssets: assets });
  const form = new FormData();
  form.set("claimId", "11111111-1111-4111-8111-111111111111");
  form.set("decision", "approve");
  form.set("version", "a".repeat(64));
  form.set("evidenceConfirmed", "on");
  await reviewCreatorClaimAction(form);
  expect(external.remove).toHaveBeenCalledWith(assets);
  expect(external.review.mock.invocationCallOrder[0]).toBeLessThan(external.remove.mock.invocationCallOrder[0]!);
});

it("shows ownership conflicts without cleanup or a success result", async () => {
  external.review.mockResolvedValueOnce({ status: "conflict", message: "Ownership changed. Reload." });
  const form = new FormData();
  form.set("claimId", "11111111-1111-4111-8111-111111111111"); form.set("decision", "approve"); form.set("version", "a".repeat(64)); form.set("evidenceConfirmed", "on");
  await expect(reviewCreatorClaimAction(form)).resolves.toEqual({ status: "error", message: "Ownership changed. Reload." });
  expect(external.remove).not.toHaveBeenCalled();
});
