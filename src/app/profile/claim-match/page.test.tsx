import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), identity: vi.fn(), candidates: vi.fn(), resolve: vi.fn(), capabilities: vi.fn() }));
vi.mock("@/features/creators/identity/claim-presentation", () => ({ getCreatorClaimPreview: vi.fn(async () => undefined) }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("redirect:" + url); } }));
vi.mock("@/features/creators/identity/external-identity", () => ({ verifiedXIdentityForUser: mocks.identity }));
vi.mock("@/features/creators/identity/x-profile", () => ({ findXCreatorCandidates: mocks.candidates, resolveCreatorXAccount: mocks.resolve }));
vi.mock("@/features/sponsorship/authorization", () => ({ readAccountCapabilities: mocks.capabilities }));
vi.mock("@/components/site-navbar", () => ({ SiteNavbar: () => null }));
vi.mock("@/components/profile/creator-claim-form", () => ({ CreatorClaimForm: () => null }));
import { renderToStaticMarkup } from "react-dom/server";
import CreatorMatchPage from "./page";
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: "viewer" });
  mocks.capabilities.mockResolvedValue({ viewer: true });
  mocks.identity.mockResolvedValue({ providerAccountId: "123", username: "creator" });
  mocks.candidates.mockResolvedValue([{ id: "target", username: "creator", name: "Creator", ownerUserId: null }]);
  mocks.resolve.mockResolvedValue("123");
});
const visit = () => CreatorMatchPage({ searchParams: Promise.resolve({ returnTo: "/icons" }) });
it("asks for confirmation without claiming on a sign-in return", async () => {
  const html = renderToStaticMarkup(await visit());
  expect(html).toContain("Claim your profile");
  expect(html).toContain('href="/icons"');
});
it("returns users without X or existing matches to their original page", async () => {
  mocks.identity.mockResolvedValueOnce(null);
  await expect(visit()).rejects.toThrow("redirect:/icons");
  expect(mocks.candidates).not.toHaveBeenCalled();
  mocks.candidates.mockResolvedValue([]);
  await expect(visit()).rejects.toThrow("redirect:/icons");
});
it("does not prompt for a profile already owned by this account", async () => {
  mocks.candidates.mockResolvedValue([{ id: "own", ownerUserId: "viewer" }]);
  await expect(visit()).rejects.toThrow("redirect:/icons");
});
it("shows attribution reports for duplicate or already owned profiles without a live lookup", async () => {
  mocks.candidates.mockResolvedValue([{ id: "target", username: "creator", name: "Creator", ownerUserId: "someone-else" }]);
  expect(renderToStaticMarkup(await visit())).toContain("Check your X attribution");
  expect(mocks.resolve).not.toHaveBeenCalled();
  mocks.candidates.mockResolvedValue([{ id: "one", username: "one" }, { id: "two", username: null }]);
  const html = renderToStaticMarkup(await visit());
  expect(html).toContain("attribution needs correction");
  expect(html).not.toContain("/creators/null");
});
