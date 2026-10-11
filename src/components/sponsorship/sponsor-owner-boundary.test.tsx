// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const viewer = vi.hoisted(() => ({ userId: "owner-a", isLoaded: true, isSignedIn: true, sessionClaims: { fva: [0, 0] }, totpEnabled: true }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => viewer, useUser: () => ({ user: { totpEnabled: viewer.totpEnabled } }) }));
import { SponsorOwnerBoundary } from "./sponsor-owner-boundary";
it("hides cached private sponsor content immediately when the browser account switches", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorOwnerBoundary ownerUserId="owner-a"><p>Owner A creative</p></SponsorOwnerBoundary>));
    expect(container.textContent).toContain("Owner A creative");
    viewer.userId = "owner-b";
    await act(async () => root.render(<SponsorOwnerBoundary ownerUserId="owner-a"><p>Owner A creative</p></SponsorOwnerBoundary>));
    expect(container.textContent).not.toContain("Owner A creative");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => root.render(<SponsorOwnerBoundary ownerUserId="owner-b"><p>Owner B creative</p></SponsorOwnerBoundary>));
    expect(container.textContent).toContain("Owner B creative");
  } finally { await act(async () => root.unmount()); viewer.userId = "owner-a"; vi.unstubAllGlobals(); }
});
it.each(["missing_mfa", "unenrolled"])("hides cached content in a session without sponsor security: %s", async reason => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  viewer.sessionClaims.fva = reason === "missing_mfa" ? [0, -1] : [0, 0];
  viewer.totpEnabled = reason !== "unenrolled";
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorOwnerBoundary ownerUserId="owner-a"><p>Private paid creative</p></SponsorOwnerBoundary>));
    expect(container.textContent).not.toContain("Private paid creative");
    expect(container.querySelector('a[href="/sponsor/security"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); viewer.sessionClaims.fva = [0, 0]; viewer.totpEnabled = true; vi.unstubAllGlobals(); }
});
