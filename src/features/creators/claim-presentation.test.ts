import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
const mocks = vi.hoisted(() => ({ source: vi.fn(), counts: vi.fn(), works: vi.fn(), suggestion: vi.fn() }));
vi.mock("./identity/claim-x-suggestion", () => ({ getClaimXSuggestion: mocks.suggestion }));
vi.mock("@/db/client", () => ({ requireDatabase: () => ({ query: { creators: { findFirst: mocks.source } } }) }));
vi.mock("@/features/profiles/repository", () => ({ getPublishedCreatorWorkCounts: mocks.counts, getPublishedCreatorWorkPage: mocks.works }));
import type { creators } from "@/db/schema";
import { getCreatorClaimPreview } from "./identity/claim-presentation";
import { XLookupError } from "./x-api";

const target = { id: "target", name: "Editorial name", username: "editorial", avatarUrl: "/editorial.webp", avatarStorageProvider: null, url: null, xProfileUrl: "https://x.com/creator", editedFields: [] } as unknown as typeof creators.$inferSelect;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.counts.mockImplementation(async (id: string) => ({ total: id === "target" ? 2 : 1 }));
  mocks.works.mockResolvedValue({ items: [{ id: "work", title: "Design", media: [{ type: "image", url: "/work.webp", variants: [{ url: "/work-small.webp" }] }] }] });
});
it("previews the exact owner-edited name, username and avatar that the merge retains", async () => {
  mocks.source.mockResolvedValue({ ...target, id: "source", name: "Owner name", username: "owner", avatarUrl: "/owner.webp", editedFields: ["name", "username", "avatarUrl"] });
  const preview = await getCreatorClaimPreview(target, "authenticated-user");
  expect(preview.resultingProfile).toMatchObject({ name: "Owner name", username: "owner", avatarUrl: "/owner.webp" });
  expect(preview).toMatchObject({ merging: true, workCount: 2, combinedWorkCount: 3, thumbnails: [{ url: "/work-small.webp", title: "Design" }] });
  expect(preview.profile.username).toBe("editorial");
  expect(preview).not.toHaveProperty("ownerUserId");
});
it("previews editorial details when the owner has not edited them", async () => {
  mocks.source.mockResolvedValue({ ...target, id: "source", name: "Login name", username: "login" });
  const preview = await getCreatorClaimPreview(target, "authenticated-user");
  expect(preview.resultingProfile).toMatchObject({ name: target.name, username: target.username, avatarUrl: target.avatarUrl });
});
it("does not read or expose an owned profile before the route verifies X", async () => {
  const preview = await getCreatorClaimPreview(target);
  expect(mocks.source).not.toHaveBeenCalled();
  expect(preview.resultingProfile).toBeUndefined();
  expect(preview.currentProfile).toBeUndefined();
  expect(mocks.suggestion).not.toHaveBeenCalled();
  expect(preview.combinedWorkCount).toBe(2);
});
it("supplies current and X choices separately without treating X suggestions as ownership proof", async () => {
  mocks.source.mockResolvedValue({ ...target, id: "source", name: "Current", username: "current" });
  mocks.suggestion.mockResolvedValue({ name: "X name", username: "X_Name" });
  const preview = await getCreatorClaimPreview(target, "authenticated-user", "123");
  expect(mocks.suggestion).toHaveBeenCalledWith("123");
  expect(preview).toMatchObject({ currentProfile: { username: "current" }, xSuggestion: { name: "X name", username: "X_Name" }, resultingProfile: { username: "editorial" } });
});
it("allows choosing profile details when X suggestions are temporarily unavailable", async () => {
  mocks.suggestion.mockRejectedValue(new XLookupError("unavailable", "Unavailable"));
  expect(await getCreatorClaimPreview(target, "authenticated-user", "123")).toMatchObject({ xSuggestionUnavailable: true, resultingProfile: { username: "editorial" } });
});
it("uses the target details if the signed-in user does not yet have a creator", async () => {
  mocks.source.mockResolvedValue(undefined);
  expect(await getCreatorClaimPreview(target, "new-user")).toMatchObject({ merging: false, resultingProfile: { username: "editorial" } });
});
