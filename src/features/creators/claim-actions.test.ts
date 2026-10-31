import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn(), change: vi.fn(), sync: vi.fn(), refresh: vi.fn(), availability: vi.fn() }));
vi.mock("./identity/claim-profile", () => ({ ClaimProfileError: class extends Error { constructor(public field: string, message: string) { super(message); } }, getClaimUsernameAvailability: mocks.availability }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("./identity/claims", () => ({ refreshCommittedClaim: mocks.refresh }));
vi.mock("./identity/claim-requests", () => ({ CreatorClaimError: class extends Error {}, requestCreatorClaim: mocks.request, changeOwnClaim: mocks.change, synchronizeOwnedXIdentity: mocks.sync }));
import { changeOwnClaimAction, checkClaimUsernameAction, submitCreatorClaimAction, synchronizeOwnXAction } from "./claim-actions";
import { ClaimProfileError } from "./identity/claim-profile";
import { CreatorClaimError } from "./identity/claim-requests";
const id = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle" as const };
function form(method = "x") {
  const data = new FormData();
  data.set("targetCreatorId", id); data.set("method", method); data.set("confirmed", "on");
  data.set("name", "Chosen name"); data.set("username", "Chosen_Name");
  data.set("userId", "forged-user"); data.set("verifiedXProviderId", "forged-provider");
  data.set("evidenceUrl", "https://portfolio.example/work"); data.set("evidenceNote", "I made this work, as shown in my original portfolio.");
  return data;
}
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: "trusted-owner" }); mocks.request.mockResolvedValue({ status: "pending", claimId: id }); });
it("requires sign-in before any mutation", async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  expect(await submitCreatorClaimAction(idle, form())).toMatchObject({ status: "error" });
  expect(await changeOwnClaimAction(idle, form())).toMatchObject({ status: "error" });
  expect(await synchronizeOwnXAction(true)).toMatchObject({ status: "error" });
  expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.change).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
});
it("uses the authenticated owner and never accepts provider proof from the browser", async () => {
  expect(await submitCreatorClaimAction(idle, form())).toMatchObject({ status: "success" });
  expect(mocks.request).toHaveBeenCalledWith({ userId: "trusted-owner" }, { targetCreatorId: id, method: "x", confirmed: true, profile: { name: "Chosen name", username: "Chosen_Name" } });
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("requires explicit confirmation", async () => {
  const data = form(); data.delete("confirmed");
  expect(await submitCreatorClaimAction(idle, data)).toMatchObject({ status: "error" });
  expect(mocks.request).not.toHaveBeenCalled();
});
it.each(["javascript:alert(1)", "https://user:password@example.com", "not a URL"])("rejects unsafe evidence %s", async (url) => {
  const data = form("ownership_report"); data.set("evidenceUrl", url);
  expect(await submitCreatorClaimAction(idle, data)).toMatchObject({ status: "error" });
  expect(mocks.request).not.toHaveBeenCalled();
});
it.each(["ownership_report"])("accepts deliberate %s evidence", async (method) => {
  expect(await submitCreatorClaimAction(idle, form(method))).toMatchObject({ status: "success" });
  expect(mocks.request).toHaveBeenCalledWith({ userId: "trusted-owner" }, expect.objectContaining({ method, evidenceUrl: "https://portfolio.example/work" }));
});
it("rejects manual claims even when a caller bypasses the UI", async () => {
  expect(await submitCreatorClaimAction(idle, form("manual"))).toMatchObject({ status: "error" });
  expect(mocks.request).not.toHaveBeenCalled();
});
it("reports immediate ownership after X verification", async () => {
  mocks.request.mockResolvedValue({ status: "claimed", creatorId: id });
  expect(await submitCreatorClaimAction(idle, form())).toMatchObject({ status: "success", message: expect.stringContaining("now yours") });
});
it("returns a recoverable conflict without reporting success", async () => {
  mocks.request.mockRejectedValueOnce(new CreatorClaimError("Withdraw your pending request first."));
  expect(await submitCreatorClaimAction(idle, form())).toMatchObject({ status: "error", message: "Withdraw your pending request first." });
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("rejects missing or invalid profile choices without silently changing the typed username", async () => {
  const data = form(); data.set("username", "not-a-handle");
  expect(await submitCreatorClaimAction(idle, data)).toMatchObject({ status: "error", fieldErrors: { username: expect.any(String) }, submittedProfile: { username: "not-a-handle" } });
  data.delete("name"); data.delete("username");
  expect(await submitCreatorClaimAction(idle, data)).toMatchObject({ status: "error", fieldErrors: { name: expect.any(String), username: expect.any(String) } });
  expect(mocks.request).not.toHaveBeenCalled();
});
it("returns a field error for a username conflict while preserving the submitted choices", async () => {
  mocks.request.mockRejectedValueOnce(new ClaimProfileError("username", "That username was just taken."));
  expect(await submitCreatorClaimAction(idle, form())).toMatchObject({ status: "error", fieldErrors: { username: "That username was just taken." }, submittedProfile: { name: "Chosen name", username: "Chosen_Name" } });
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("authenticates and bounds availability requests without accepting an exclusion list", async () => {
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect(await checkClaimUsernameAction(id, "name")).toMatchObject({ status: "error" });
  expect(await checkClaimUsernameAction("bad-id", "name")).toMatchObject({ status: "error" });
  expect(await checkClaimUsernameAction(id, "a".repeat(31))).toMatchObject({ status: "error" });
  expect(mocks.availability).not.toHaveBeenCalled();
  mocks.availability.mockResolvedValue({ status: "available", message: "Available" });
  expect(await checkClaimUsernameAction(id, " MiXeD_Name ")).toMatchObject({ status: "available" });
  expect(mocks.availability).toHaveBeenCalledWith("trusted-owner", id, "MiXeD_Name");
});
it("scopes withdrawal to the authenticated owner", async () => {
  const data = form(); data.set("claimId", id); data.set("operation", "withdraw");
  expect(await changeOwnClaimAction(idle, data)).toMatchObject({ status: "success" });
  expect(mocks.change).toHaveBeenCalledWith({ userId: "trusted-owner" }, id, "withdraw");
});
it("only forwards an actual boolean confirmation for an X identity change", async () => {
  mocks.sync.mockResolvedValue({ status: "confirm", message: "Confirm the new account." });
  await synchronizeOwnXAction("true" as unknown as boolean);
  expect(mocks.sync).toHaveBeenCalledWith({ userId: "trusted-owner" }, false);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
