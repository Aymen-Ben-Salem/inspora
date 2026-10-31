// @vitest-environment happy-dom
import { ClerkAPIResponseError } from "@clerk/nextjs/errors";
import { ClerkInstanceContext } from "@clerk/shared/react";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(), reload: vi.fn(), refresh: vi.fn(), verify: vi.fn(),
  sync: vi.fn(), submit: vi.fn(), destroy: vi.fn(), connected: false,
}));
vi.mock("@clerk/nextjs", async () => ({
  // Exercise Clerk's real challenge/retry/cancellation handling, with only its
  // network and verification UI replaced by controlled test boundaries.
  useReverification: (await import("@clerk/shared/react")).useReverification,
  useUser: () => ({ isLoaded: true, user: {
    createExternalAccount: mocks.connect, reload: mocks.reload,
    passwordEnabled: true,
    verifiedExternalAccounts: mocks.connected ? [{ id: "x-account", username: "creator", providerSlug: () => "x", destroy: mocks.destroy }] : [],
  } }),
}));
vi.mock("@clerk/nextjs/legacy", () => ({ useSignIn: () => ({ signIn: undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/features/profiles/actions", () => ({
  completeOwnAvatarUpload: vi.fn(), createOwnAvatarUploadSignature: vi.fn(),
  discardOwnAvatarUpload: vi.fn(), updateOwnProfile: vi.fn(),
}));
vi.mock("@/features/creators/claim-actions", () => ({ synchronizeOwnXAction: mocks.sync, submitCreatorClaimAction: mocks.submit }));
vi.mock("./use-viewer-profile", () => ({ refreshViewerProfile: vi.fn() }));

import { ConnectClaimX } from "./connect-claim-x";
import { EditProfile } from "./edit-profile";

const profile = { id: "creator", name: "Creator", username: "creator", avatarUrl: "/brand/default-avatar.svg", websiteUrl: null, xProfileUrl: null };
const requiredMessage = "You need to provide additional verification to perform this operation";
const requiredError = () => new ClerkAPIResponseError(requiredMessage, {
  status: 403, data: [{ code: "session_reverification_required", message: requiredMessage }],
});
type VerificationUI = { afterVerification: () => void; afterVerificationCancelled: () => void };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.resetAllMocks(); mocks.connected = false;
  mocks.connect.mockResolvedValue({ verification: {} });
  mocks.sync.mockResolvedValue({ status: "synced", message: "Connected." });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const flows = [
  { label: "Edit Profile", path: "/profile?modal=edit" },
  { label: "creator claim", path: "/creators/creator/claim" },
];
async function renderFlow(label: string) {
  const context = { value: { __internal_openReverification: mocks.verify } } as unknown as ComponentProps<typeof ClerkInstanceContext.Provider>["value"];
  await act(async () => root.render(
    <ClerkInstanceContext.Provider value={context}>
      {label === "Edit Profile" ? <EditProfile profile={profile} onSaved={vi.fn()} onDirtyChange={vi.fn()} /> : <ConnectClaimX returnPath="/creators/creator/claim" />}
    </ClerkInstanceContext.Provider>,
  ));
}
function connectButton() {
  return container.querySelector<HTMLButtonElement>('[aria-label="Connect X"]') ?? container.querySelector<HTMLButtonElement>("button")!;
}

it.each(flows)("$label prompts for verification and retries X linking with the same return path", async ({ label, path }) => {
  mocks.connect.mockRejectedValueOnce(requiredError());
  await renderFlow(label);
  await act(async () => connectButton().click());
  expect(container.textContent).not.toContain(requiredMessage);
  expect(mocks.verify).toHaveBeenCalledOnce();
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  expect(connectButton().disabled).toBe(true);
  expect(mocks.reload).not.toHaveBeenCalled();
  await act(async () => (mocks.verify.mock.calls[0][0] as VerificationUI).afterVerification());
  expect(mocks.connect).toHaveBeenCalledTimes(2);
  for (const [params] of mocks.connect.mock.calls) expect(params).toEqual({ strategy: "oauth_x", redirectUrl: window.location.origin + path });
  expect(mocks.reload).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(mocks.submit).not.toHaveBeenCalled();
});

it.each(flows)("$label leaves the connection unchanged when verification is cancelled and permits retry", async ({ label }) => {
  mocks.connect.mockRejectedValueOnce(requiredError());
  await renderFlow(label);
  await act(async () => connectButton().click());
  await act(async () => (mocks.verify.mock.calls[0][0] as VerificationUI).afterVerificationCancelled());
  expect(mocks.connect).toHaveBeenCalledTimes(1);
  expect(mocks.reload).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(connectButton().disabled).toBe(false);
  await act(async () => connectButton().click());
  expect(mocks.reload).toHaveBeenCalledOnce();
  expect(mocks.submit).not.toHaveBeenCalled();
});

it.each(flows)("$label continues straight to X when the session does not need verification", async ({ label }) => {
  const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
  mocks.connect.mockResolvedValue({ verification: { externalVerificationRedirectURL: new URL("https://x.com/i/oauth2/authorize?state=test") } });
  await renderFlow(label);
  await act(async () => connectButton().click());
  expect(assign).toHaveBeenCalledWith("https://x.com/i/oauth2/authorize?state=test");
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.reload).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
});

it.each(flows)("$label still displays a provider failure after successful verification", async ({ label }) => {
  mocks.connect.mockRejectedValueOnce(requiredError()).mockRejectedValueOnce(new Error("Provider unavailable"));
  await renderFlow(label);
  await act(async () => connectButton().click());
  await act(async () => (mocks.verify.mock.calls[0][0] as VerificationUI).afterVerification());
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(connectButton().disabled).toBe(false);
  expect(mocks.reload).not.toHaveBeenCalled();
});

it("handles the same verification requirement for Google in Edit Profile", async () => {
  mocks.connect.mockRejectedValueOnce(requiredError());
  await renderFlow("Edit Profile");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Connect Google"]')!.click());
  await act(async () => (mocks.verify.mock.calls[0][0] as VerificationUI).afterVerification());
  expect(mocks.connect).toHaveBeenLastCalledWith({ strategy: "oauth_google", redirectUrl: window.location.origin + "/profile?modal=edit" });
  expect(mocks.reload).toHaveBeenCalledOnce();
});

it.each(["complete", "cancel"])("handles verification before disconnecting X: %s", async outcome => {
  mocks.connected = true;
  mocks.destroy.mockRejectedValueOnce(requiredError()).mockResolvedValue(undefined);
  vi.stubGlobal("confirm", vi.fn(() => true));
  await renderFlow("Edit Profile");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="X connected; disconnect"]')!.click());
  expect(mocks.destroy).toHaveBeenCalledTimes(1);
  expect(mocks.reload).not.toHaveBeenCalled();
  await act(async () => {
    const ui = mocks.verify.mock.calls[0][0] as VerificationUI;
    if (outcome === "complete") ui.afterVerification();
    else ui.afterVerificationCancelled();
  });
  expect(mocks.destroy).toHaveBeenCalledTimes(outcome === "complete" ? 2 : 1);
  expect(mocks.reload).toHaveBeenCalledTimes(outcome === "complete" ? 1 : 0);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
