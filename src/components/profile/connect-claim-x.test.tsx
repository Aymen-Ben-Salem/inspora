// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), connect: vi.fn(), reload: vi.fn(), refresh: vi.fn(), signedIn: false }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, user: mocks.signedIn ? { createExternalAccount: mocks.connect, reload: mocks.reload } : null }) }));
vi.mock("@clerk/nextjs/legacy", () => ({ useSignIn: () => ({ signIn: { authenticateWithRedirect: mocks.authenticate } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { ConnectClaimX } from "./connect-claim-x";
let container: HTMLDivElement; let root: Root;
beforeEach(() => { vi.clearAllMocks(); mocks.signedIn = false; vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const path = "/creators/creator/claim";
async function click() {
  await act(async () => root.render(<ConnectClaimX returnPath={path} />));
  await act(async () => container.querySelector("button")!.click());
}
it("starts only X sign-in and retains the selected creator through the callback", async () => {
  await click();
  expect(mocks.authenticate).toHaveBeenCalledWith({ strategy: "oauth_x", redirectUrl: "/profile/x-callback?returnTo=" + encodeURIComponent(path), redirectUrlComplete: path });
  expect(mocks.connect).not.toHaveBeenCalled();
});
it("connects X to an existing login without starting another sign-in", async () => {
  mocks.signedIn = true; mocks.connect.mockResolvedValue({ verification: {} });
  await click();
  expect(mocks.connect).toHaveBeenCalledWith({ strategy: "oauth_x", redirectUrl: window.location.origin + path });
  expect(mocks.reload).toHaveBeenCalled(); expect(mocks.refresh).toHaveBeenCalled();
  expect(mocks.authenticate).not.toHaveBeenCalled();
});
it("offers a recovery message when Clerk rejects an already associated X account", async () => {
  mocks.signedIn = true; mocks.connect.mockRejectedValue(new Error("Conflict"));
  await click();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("sign out and sign in with that X account");
});
