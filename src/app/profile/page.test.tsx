import { beforeEach, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn(), ensure: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: external.auth }));
vi.mock("@/auth/config", () => ({ isClerkConfigured: () => true }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));
vi.mock("@/analytics/creator-views", () => ({ getCreatorViews: vi.fn() }));
vi.mock("@/components/profile/profile-page", () => ({ ProfilePage: () => null }));
vi.mock("@/features/creators/identity", () => ({
  ensureCreatorForOwner: external.ensure,
  requestCreatorOwnershipClaimFromVerifiedX: external.request,
}));
vi.mock("@/features/profiles/repository", () => ({
  getPublishedCreatorWorkCounts: vi.fn(), getPublishedCreatorWorkPage: vi.fn(), isCreatorWorkFilter: () => true,
}));
vi.mock("@/features/profiles/messages-repository", () => ({ getOwnProfileActivity: vi.fn() }));

import OwnerProfilePage from "./page";

beforeEach(() => { vi.clearAllMocks(); });

it("uses the authenticated owner when edit entry requests a verified X claim", async () => {
  external.auth.mockResolvedValue({ userId: "trusted-owner" });
  external.request.mockResolvedValue({ status: "pending", claimId: "claim" });
  external.ensure.mockRejectedValue(new Error("stop before rendering"));
  await expect(OwnerProfilePage({ searchParams: Promise.resolve({ modal: "edit" }) })).rejects.toThrow("stop before rendering");
  expect(external.request).toHaveBeenCalledWith({ userId: "trusted-owner" });
});

it("does not request a claim for signed-out edit entry", async () => {
  external.auth.mockResolvedValue({ userId: null });
  await expect(OwnerProfilePage({ searchParams: Promise.resolve({ modal: "edit" }) })).rejects.toThrow("/sign-in");
  expect(external.request).not.toHaveBeenCalled();
  expect(external.ensure).not.toHaveBeenCalled();
});
