import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn(), remove: vi.fn(), toggle: vi.fn(), cleanup: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/auth/config", () => ({ getConfiguredAdminUserIds: () => new Set(["admin"]), isClerkConfigured: () => true }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/data/posts-repository", () => ({ PUBLISHED_POSTS_CACHE_TAG: "posts" }));
vi.mock("@/data/logos-repository", () => ({ PUBLISHED_LOGOS_CACHE_TAG: "logos" }));
vi.mock("@/data/websites-repository", () => ({ PUBLISHED_WEBSITES_CACHE_TAG: "websites" }));
vi.mock("@/data/sponsor-repository", () => ({ SPONSOR_CACHE_TAG: "sponsor" }));
vi.mock("@/features/profiles/cache", () => ({ PUBLIC_CREATOR_PROFILES_CACHE_TAG: "creators" }));
vi.mock("@/storage/media-storage", () => ({ deleteManagedMediaAssetsSafely: mocks.cleanup }));
vi.mock("./posts-repository", () => ({}));
vi.mock("./logos-repository", () => ({}));
vi.mock("./websites-repository", () => ({}));
vi.mock("./subscribers-repository", () => ({}));
vi.mock("./sponsor-repository", () => ({ saveAdminSponsor: mocks.save, deleteAdminSponsor: mocks.remove, setAdminSponsorActive: mocks.toggle }));
import { saveSponsorAction, deleteSponsorAction, toggleSponsorActiveAction } from "./actions";

beforeEach(() => vi.clearAllMocks());
function form() { const data = new FormData(); data.set("title", "Manual sponsor"); data.set("url", "https://example.com"); data.set("isActive", "false"); return data; }
it.each([null, "regular-customer"])("blocks direct free-sponsor mutation requests from %s", async (userId) => {
  mocks.auth.mockResolvedValue({ userId });
  const data = form(); data.set("isAdmin", "true"); data.set("skipPayment", "true");
  await expect(saveSponsorAction({status: "idle"}, data)).rejects.toThrow("redirect:");
  await expect(deleteSponsorAction()).rejects.toThrow("redirect:");
  await expect(toggleSponsorActiveAction(data)).rejects.toThrow("redirect:");
  for (const operation of [mocks.save, mocks.remove, mocks.toggle, mocks.cleanup]) expect(operation).not.toHaveBeenCalled();
});
it("lets an allowlisted admin save manual creative without client-owned billing fields", async () => {
  mocks.auth.mockResolvedValue({userId: "admin"}); mocks.save.mockResolvedValue({removedManagedMedia: []});
  const data = form(); data.set("ownerUserId", "customer"); data.set("campaignState", "published"); data.set("accountId", "paid-account");
  await expect(saveSponsorAction({status: "idle"}, data)).rejects.toThrow("redirect:/admin/sponsor?saved=true");
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({title: "Manual sponsor", isActive: false}), "admin");
  for (const field of ["ownerUserId", "accountId", "campaignState"]) expect(mocks.save.mock.calls[0][0]).not.toHaveProperty(field);
});
