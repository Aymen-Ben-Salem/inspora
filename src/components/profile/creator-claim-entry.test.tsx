import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), target: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/auth/config", () => ({ isClerkConfigured: () => true }));
vi.mock("@/db/client", () => ({ requireDatabase: () => ({ query: { creators: { findFirst: mocks.target } } }) }));
import { CreatorClaimEntry } from "./creator-claim-entry";
beforeEach(() => { vi.clearAllMocks(); });
it.each([
  [null, null, "Claim this profile", "/creators/creator/claim"],
  ["viewer", null, "Claim this profile", "/creators/creator/claim"],
  ["viewer", "someone-else", "Report ownership problem", "/creators/creator/claim"],
  ["viewer", "viewer", "Manage your profile", "/profile"],
])("shows the right public entry for session %s and owner %s", async (userId, ownerUserId, label, href) => {
  mocks.auth.mockResolvedValue({ userId }); mocks.target.mockResolvedValue({ ownerUserId });
  const html = renderToStaticMarkup(await CreatorClaimEntry({ creatorId: "target", username: "creator" }));
  expect(html).toContain(label); expect(html).toContain('href="' + href + '"');
});
