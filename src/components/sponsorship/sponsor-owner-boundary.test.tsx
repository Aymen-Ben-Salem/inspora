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
it("requires the second factor only when the owner previously enabled it", async () => {
  const reason = "missing_mfa";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  viewer.sessionClaims.fva = reason === "missing_mfa" ? [0, -1] : [0, 0];
  viewer.totpEnabled = true;
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorOwnerBoundary ownerUserId="owner-a"><p>Private paid creative</p></SponsorOwnerBoundary>));
    expect(container.textContent).not.toContain("Private paid creative");
    expect(container.querySelector('a[href="/sponsor/security"]')).not.toBeNull();
    viewer.totpEnabled = false;
    await act(async () => root.render(<SponsorOwnerBoundary ownerUserId="owner-a"><p>Private paid creative</p></SponsorOwnerBoundary>));
    expect(container.textContent).toContain("Private paid creative");
  } finally { await act(async () => root.unmount()); viewer.sessionClaims.fva = [0, 0]; viewer.totpEnabled = true; vi.unstubAllGlobals(); }
});
it("shows only the security fallback until this owner's second factor is verified", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  viewer.sessionClaims.fva = [0, -1];
  const container = document.createElement("div"), root = createRoot(container);
  const render = () => root.render(<SponsorOwnerBoundary ownerUserId="owner-a" securityFallback={<p>Settings verification</p>}><p>Private paid creative</p></SponsorOwnerBoundary>);
  try {
    await act(async () => render());
    expect(container.textContent).toBe("Settings verification");
    viewer.userId = "another-owner";
    await act(async () => render());
    expect(container.textContent).not.toContain("Settings verification");
    expect(container.textContent).not.toContain("Private paid creative");
    viewer.userId = "owner-a";
    viewer.sessionClaims.fva = [0, 0];
    await act(async () => render());
    expect(container.textContent).toBe("Private paid creative");
  } finally { await act(async () => root.unmount()); viewer.userId = "owner-a"; viewer.sessionClaims.fva = [0, 0]; vi.unstubAllGlobals(); }
});
it("allows only security controls before the second factor and still checks the owner identity", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  viewer.sessionClaims.fva = [0, -1];
  const container = document.createElement("div"), root = createRoot(container);
  const render = () => root.render(<SponsorOwnerBoundary ownerUserId="owner-a" securityView={<p>Security controls only</p>}><p>Private campaign</p></SponsorOwnerBoundary>);
  try {
    await act(async () => render());
    expect(container.textContent).toBe("Security controls only");
    viewer.userId = "another-owner";
    await act(async () => render());
    expect(container.textContent).not.toContain("Security controls only");
    expect(container.textContent).not.toContain("Private campaign");
  } finally { await act(async () => root.unmount()); viewer.userId = "owner-a"; viewer.sessionClaims.fva = [0, 0]; vi.unstubAllGlobals(); }
});
