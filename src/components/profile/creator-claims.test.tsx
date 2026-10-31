// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OwnCreatorClaim } from "@/features/creators/types";
const mocks = vi.hoisted(() => ({ submit: vi.fn(), change: vi.fn(), review: vi.fn(), sync: vi.fn(), connect: vi.fn(), refresh: vi.fn(), replace: vi.fn(), viewer: vi.fn(), availability: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ useReverification: (action: unknown) => action, useUser: () => ({ isLoaded: true, user: { createExternalAccount: mocks.connect, reload: vi.fn() } }) }));
vi.mock("@clerk/nextjs/legacy", () => ({ useSignIn: () => ({ signIn: undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }));
vi.mock("@/features/creators/claim-actions", () => ({ submitCreatorClaimAction: mocks.submit, changeOwnClaimAction: mocks.change, synchronizeOwnXAction: mocks.sync, checkClaimUsernameAction: mocks.availability }));
vi.mock("@/features/admin/creator-actions", () => ({ reviewCreatorClaimAction: mocks.review }));
vi.mock("./use-viewer-profile", () => ({ refreshViewerProfile: mocks.viewer }));
import { CreatorClaimForm } from "./creator-claim-form";
import { CreatorClaimAttention, CreatorClaimsPanel } from "./creator-claims-panel";
import { consumeClaimSuccess } from "./claim-success-notice";
import { XIdentitySync } from "./x-identity-sync";
import { CreatorClaimReviewForm } from "../admin/creator-claim-review-form";
let container: HTMLDivElement; let root: Root;
beforeEach(() => { vi.clearAllMocks(); mocks.availability.mockResolvedValue({ status: "available", message: "Available for your profile." }); sessionStorage.clear(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
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
  await act(async () => button("This isn’t me").click());
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
  mocks.submit.mockResolvedValue({ status: "success", message: "This profile is now yours.", claimedCreatorId: "target" });
  await renderClaim("creator", true); await submit(button("Claim my profile"));
  expect(container.querySelector('[role="status"]')?.textContent).toBe("This profile is now yours.");
  expect(container.querySelector('a[href="/profile"]')).not.toBeNull();
  expect(mocks.viewer).toHaveBeenCalledOnce();
  expect(mocks.replace).toHaveBeenCalledWith("/profile");
  expect(consumeClaimSuccess("target")).toBe(true);
  expect(consumeClaimSuccess("target")).toBe(false);
  expect(mocks.submit.mock.calls[0][1].get("confirmed")).toBe("on");
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
  expect(container.querySelector('a[href="/creators/creator/claim?report=1"]')?.textContent).toBe("Send a new report");
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

it("makes a matching profile a visible action and removes it after successful synchronization", async () => {
  mocks.sync.mockResolvedValueOnce({ status: "conflict", message: "Matched" });
  await act(async () => root.render(<XIdentitySync accountKey="x" username="creator" />));
  expect(container.querySelector('a[href="/profile/claim-match?returnTo=%2Fprofile%3Fmodal%3Dedit"]')?.textContent).toContain("Review profile");
  expect(container.textContent).toContain("@creator");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  mocks.sync.mockResolvedValueOnce({ status: "synced", message: "Updated" });
  await act(async () => root.render(<XIdentitySync key="synced" accountKey="x" username="creator" />));
  expect(container.textContent).toBe("");
});

it("keeps completed claims and waiting reports out of the profile feed", async () => {
  await act(async () => root.render(<CreatorClaimAttention claims={[{ ...claim, status: "approved", attentionReason: null }, { ...claim, method: "ownership_report", attentionReason: null }]} />));
  expect(container.textContent).toBe("");
  await act(async () => root.render(<CreatorClaimAttention claims={[claim]} />));
  expect(container.querySelector('a[href="/profile/claims"]')?.textContent).toContain("needs your attention");
});

it("keeps claim history collapsed with no repeated success or dismissal controls", async () => {
  await act(async () => root.render(<CreatorClaimsPanel history claims={[{ ...claim, status: "approved", attentionReason: null }]} />));
  expect(container.querySelector("details")?.open).toBe(false);
  expect(container.querySelector("summary")?.textContent).toContain("Claimed");
  expect(container.querySelector("button")).toBeNull();
  expect(container.querySelector('a[href="/profile"]')).toBeNull();
});

it("offers a single explicit claim button only after X matches", async () => {
  await renderClaim("creator", true);
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  expect(button("Claim my profile").name).toBe("confirmed");
  await renderClaim("different", false);
  expect(button("Claim my profile")).toBeUndefined();
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("shows the resulting identity before the user confirms the merge", async () => {
  const profile = { id: "target", name: "Editorial name", username: "editorial", avatarUrl: "/brand/default-avatar.svg", websiteUrl: null, xProfileUrl: null };
  await act(async () => root.render(<CreatorClaimForm targetId="target" targetName={profile.name} returnPath="/creators/editorial/claim" connectedXUsername="creator" xMatches preview={{ profile, resultingProfile: { ...profile, name: "Owner name", username: "owner" }, merging: true, workCount: 1, combinedWorkCount: 2, thumbnails: [] }} />));
  expect(container.querySelector('[aria-label="Creator profile to claim"]')?.textContent).toContain("Editorial name");
  expect(container.textContent).toContain("Your profile after claiming");
  expect(container.querySelector<HTMLInputElement>('[name="name"]')?.value).toBe("Owner name");
  expect(container.querySelector<HTMLInputElement>('[name="username"]')?.value).toBe("owner");
  expect(container.textContent).toContain("2 works");
  expect(mocks.submit).not.toHaveBeenCalled();
});

const choiceProfile = { id: "target", name: "Creator name", username: "creator_name", avatarUrl: "/brand/default-avatar.svg", websiteUrl: null, xProfileUrl: "https://x.com/X_Name" };
async function renderChoices() {
  await act(async () => root.render(<CreatorClaimForm targetId="target" targetName="Creator name" returnPath="/creators/creator_name/claim" connectedXUsername="x_name" xMatches preview={{ profile: choiceProfile, resultingProfile: choiceProfile, currentProfile: { ...choiceProfile, id: "current", name: "My name", username: "My_Name" }, xSuggestion: { name: "X name", username: "X_Name" }, merging: true, workCount: 1, combinedWorkCount: 2, thumbnails: [] }} />));
}
const field = (name: string) => container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
async function typeField(name: string, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("suggests X names, allows keeping either profile's details, and submits the visible choices", async () => {
  await renderChoices();
  expect(field("name").value).toBe("X name"); expect(field("username").value).toBe("X_Name");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Name suggestions"] button:nth-child(2)')!.click());
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Username suggestions"] button:nth-child(3)')!.click());
  expect(field("name").value).toBe("My name"); expect(field("username").value).toBe("creator_name");
  mocks.submit.mockResolvedValueOnce({ status: "error", message: "Retry" });
  await submit(button("Claim my profile"));
  expect(mocks.submit.mock.calls[0][1].get("name")).toBe("My name");
  expect(mocks.submit.mock.calls[0][1].get("username")).toBe("creator_name");
  expect(field("name").value).toBe("My name"); expect(field("username").value).toBe("creator_name");
});
it("checks typing and clearing, ignores outdated responses, and focuses an invalid username", async () => {
  vi.useFakeTimers();
  let finishFirst!: (value: unknown) => void;
  mocks.availability.mockReturnValueOnce(new Promise(resolve => { finishFirst = resolve; }));
  await renderChoices();
  await act(async () => vi.advanceTimersByTimeAsync(350));
  await typeField("username", "Another_Name");
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(mocks.availability).toHaveBeenLastCalledWith("target", "Another_Name");
  await act(async () => finishFirst({ status: "unavailable", message: "Old result" }));
  expect(container.textContent).not.toContain("Old result");
  expect(container.textContent).toContain("Available for your profile.");
  await typeField("username", "");
  await submit(button("Claim my profile"));
  expect(mocks.submit).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(field("username"));
  expect(field("username").getAttribute("aria-invalid")).toBe("true");
});
it("keeps typed choices and focuses the username after a submit-time conflict", async () => {
  await renderChoices();
  await typeField("name", "Chosen display name"); await typeField("username", "Chosen_Name");
  mocks.submit.mockResolvedValueOnce({ status: "error", fieldErrors: { username: "That username was just taken." }, submittedProfile: { name: "Chosen display name", username: "Chosen_Name" } });
  await submit(button("Claim my profile"));
  expect(field("name").value).toBe("Chosen display name");
  expect(field("username").value).toBe("Chosen_Name");
  expect(document.activeElement).toBe(field("username"));
  expect(container.textContent).toContain("That username was just taken.");
  await typeField("username", "Different_Name");
  expect(container.textContent).not.toContain("That username was just taken.");
});
it("hides duplicate suggestions and allows submission when the advisory availability check fails", async () => {
  vi.useFakeTimers(); mocks.availability.mockRejectedValue(new Error("Offline"));
  await act(async () => root.render(<CreatorClaimForm targetId="target" targetName="Creator name" returnPath="/creators/creator_name/claim" connectedXUsername="creator_name" xMatches preview={{ profile: choiceProfile, resultingProfile: choiceProfile, currentProfile: choiceProfile, xSuggestion: { name: choiceProfile.name, username: choiceProfile.username }, merging: true, workCount: 1, combinedWorkCount: 2, thumbnails: [] }} />));
  expect(container.querySelector('[aria-label="Name suggestions"]')).toBeNull();
  expect(container.querySelector('[aria-label="Username suggestions"]')).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(container.textContent).toContain("We’ll check again when you claim.");
  mocks.submit.mockResolvedValueOnce({ status: "error", message: "Retry" });
  await submit(button("Claim my profile"));
  expect(mocks.submit).toHaveBeenCalledOnce();
});

it("reports without sending the user to a claimed profile", async () => {
  mocks.submit.mockResolvedValue({ status: "success", message: "Report sent." });
  await renderClaim("different", false, true);
  await submit(button("Send report"));
  expect(container.querySelector('a[href="/profile/claims"]')?.textContent).toBe("View report");
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(consumeClaimSuccess("target")).toBe(false);
});
