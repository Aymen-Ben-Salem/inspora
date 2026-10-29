// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OwnCreatorClaim } from "@/features/creators/types";
const mocks = vi.hoisted(() => ({ submit: vi.fn(), change: vi.fn(), review: vi.fn(), sync: vi.fn(), connect: vi.fn(), refresh: vi.fn(), viewer: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ isLoaded: true, user: { createExternalAccount: mocks.connect, reload: vi.fn() } }) }));
vi.mock("@clerk/nextjs/legacy", () => ({ useSignIn: () => ({ signIn: undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/creators/claim-actions", () => ({ submitCreatorClaimAction: mocks.submit, changeOwnClaimAction: mocks.change, synchronizeOwnXAction: mocks.sync }));
vi.mock("@/features/admin/creator-actions", () => ({ reviewCreatorClaimAction: mocks.review }));
vi.mock("./use-viewer-profile", () => ({ refreshViewerProfile: mocks.viewer }));
import { CreatorClaimForm } from "./creator-claim-form";
import { CreatorClaimsPanel } from "./creator-claims-panel";
import { XIdentitySync } from "./x-identity-sync";
import { CreatorClaimReviewForm } from "../admin/creator-claim-review-form";
let container: HTMLDivElement; let root: Root;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
async function renderClaim(connectedXUsername: string | null = null, xMatches = false, report = false) {
  await act(async () => root.render(<CreatorClaimForm targetId="target" targetName="Creator" returnPath="/creators/creator/claim" connectedXUsername={connectedXUsername} xMatches={xMatches} report={report} />));
}
async function submit(buttonElement: HTMLButtonElement) {
  await act(async () => buttonElement.form!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: buttonElement })));
}
it("does not submit on mount, offers reports instead of manual claims, and retains the selected creator", async () => {
  await renderClaim();
  expect(mocks.submit).not.toHaveBeenCalled(); expect(button("Claim my profile")).toBeUndefined();
  await act(async () => [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("report incorrect attribution"))!.click());
  expect(container.querySelector<HTMLInputElement>('[name="method"]')?.value).toBe("ownership_report");
  expect(container.querySelector<HTMLInputElement>('[name="targetCreatorId"]')?.value).toBe("target");
  expect(container.querySelector<HTMLInputElement>('[name="evidenceUrl"]')?.required).toBe(true);
  expect(container.querySelector<HTMLInputElement>('[name="confirmed"]')?.required).toBe(true);
});
it("preserves the claim destination through connecting X", async () => {
  mocks.connect.mockRejectedValueOnce(new Error("Provider unavailable"));
  await renderClaim(); await act(async () => button("Connect X").click());
  expect(mocks.connect).toHaveBeenCalledWith({ strategy: "oauth_x", redirectUrl: window.location.origin + "/creators/creator/claim" });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("X could not be connected");
  expect(mocks.submit).not.toHaveBeenCalled();
});
it("shows an explicit success after submitting a matching X claim", async () => {
  mocks.submit.mockResolvedValue({ status: "success", message: "This profile is now yours." });
  await renderClaim("creator", true); await submit(button("Claim my profile"));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("This profile is now yours.");
  expect(container.querySelector('a[href="/profile"]')).not.toBeNull();
  expect(mocks.viewer).toHaveBeenCalledOnce();
});
const claim: OwnCreatorClaim = { id: "claim", targetCreatorId: "target", targetName: "Creator", targetUsername: "creator", status: "pending", method: "x", createdAt: "2026-10-29T00:00:00Z", dismissedAt: null, reviewReason: null, attentionReason: "Reconnect X before review." };
it("shows recovery instructions and a withdrawal control for a pending request", async () => {
  mocks.change.mockResolvedValue({ status: "success", message: "Request withdrawn." });
  await act(async () => root.render(<CreatorClaimsPanel claims={[claim]} />));
  expect(container.textContent).toContain("Reconnect X before review.");
  expect(container.querySelector('input[value="withdraw"]')).not.toBeNull();
  await submit(button("Withdraw request"));
  expect(container.textContent).toContain("Request withdrawn.");
});
it("keeps rejected decisions in history with a corrected-evidence link", async () => {
  await act(async () => root.render(<CreatorClaimsPanel history claims={[{ ...claim, status: "rejected", attentionReason: null, reviewReason: "Please add your portfolio.", dismissedAt: "2026-10-29" }]} />));
  expect(container.textContent).toContain("Please add your portfolio.");
  expect(container.querySelector('a[href="/creators/creator/claim"]')?.textContent).toBe("Submit corrected evidence");
  expect(container.querySelector("button")).toBeNull();
});
it("offers report resolution without an approval option", async () => {
  await act(async () => root.render(<CreatorClaimReviewForm claimId="claim" version={"a".repeat(64)} method="ownership_report" />));
  expect(container.querySelector('option[value="approve"]')).toBeNull();
  expect(container.querySelector('option[value="resolve"]')).not.toBeNull();
  expect(container.querySelector("textarea")?.required).toBe(true);
});
it("shows approval conflicts with a reload action", async () => {
  mocks.review.mockResolvedValue({ status: "error", message: "The creator changed. Reload before reviewing." });
  await act(async () => root.render(<CreatorClaimReviewForm claimId="claim" version={"a".repeat(64)} method="manual" />));
  expect(container.querySelector('option[value="approve"]')).toBeNull();
  await submit(button("Save review"));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Reload before reviewing");
  await act(async () => button("Reload current review").click()); expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("requires confirmation before synchronizing a changed provider account", async () => {
  mocks.sync.mockResolvedValueOnce({ status: "confirm", message: "Confirm the new identity." }).mockResolvedValueOnce({ status: "synced", message: "Updated." });
  await act(async () => root.render(<XIdentitySync accountKey="new-x" />));
  expect(mocks.sync).toHaveBeenLastCalledWith(false);
  await act(async () => button("Confirm new X identity").click());
  expect(mocks.sync).toHaveBeenLastCalledWith(true); expect(mocks.viewer).toHaveBeenCalledOnce();
});
it("recovers from a network failure checking X", async () => {
  mocks.sync.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => root.render(<XIdentitySync accountKey="x" />));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Please try again");
  expect(button("Try again")).toBeDefined();
});
