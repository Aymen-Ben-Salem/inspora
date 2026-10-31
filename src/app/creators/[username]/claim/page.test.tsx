import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/features/creators/identity/claim-presentation", () => ({ getCreatorClaimPreview: vi.fn(async () => undefined) }));
vi.mock("@/features/creators/identity/x-profile", () => ({ resolveCreatorXAccount: vi.fn(async () => "123") }));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), target: vi.fn(), identity: vi.fn(), ensure: vi.fn(), counts: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("redirect:" + url); }, notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/db/client", () => ({ requireDatabase: () => ({ query: { creators: { findFirst: mocks.target } } }) }));
vi.mock("@/features/creators/identity", () => ({ resolvePublicCreatorProfile: mocks.resolve, ensureCreatorForOwner: mocks.ensure }));
vi.mock("@/features/creators/identity/claim-requests", () => ({ normalizedClaimXUrl: (url: string) => url, visibleClaimTarget: (target: { handle?: string }) => !target.handle?.startsWith("dev-") }));
vi.mock("@/features/creators/identity/external-identity", () => ({ verifiedXIdentityForUser: mocks.identity }));
vi.mock("@/features/profiles/repository", () => ({ getPublishedCreatorWorkCounts: mocks.counts }));
vi.mock("@/components/site-navbar", () => ({ SiteNavbar: () => null }));
vi.mock("@/components/profile/creator-claim-form", () => ({ CreatorClaimForm: () => null }));
import CreatorClaimPage from "./page";
beforeEach(() => {
  vi.clearAllMocks(); mocks.resolve.mockResolvedValue({ canonicalUsername: "canonical", profile: { id: "target" } });
  mocks.auth.mockResolvedValue({ userId: "viewer" }); mocks.target.mockResolvedValue({ id: "target", name: "Creator" });
  mocks.ensure.mockResolvedValue({ id: "source" }); mocks.identity.mockResolvedValue(null); mocks.counts.mockResolvedValue({ total: 2 });
});
const visit = () => CreatorClaimPage({ params: Promise.resolve({ username: "old_alias" }) });
it("keeps the canonical claim destination through sign-in without creating a profile", async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  const page = await visit();
  expect(page).toBeDefined();
  expect(mocks.ensure).not.toHaveBeenCalled(); expect(mocks.identity).not.toHaveBeenCalled();
});
it("sends an existing owner to their profile", async () => {
  mocks.target.mockResolvedValue({ id: "target", name: "Creator", ownerUserId: "viewer" });
  await expect(visit()).rejects.toThrow("redirect:/profile");
});
it("does not expose a development fixture claim", async () => {
  mocks.target.mockResolvedValue({ id: "target", handle: "dev-hidden" });
  await expect(visit()).rejects.toThrow("not-found");
});
