// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const viewer = vi.hoisted(() => ({ isLoaded: true, user: { id: "owner-a", totpEnabled: false } }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => viewer }));
import { SponsorSecurityRecommendation } from "./security-recommendation";
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); viewer.user = { id: "owner-a", totpEnabled: false }; });
it("recommends MFA without blocking the dashboard and remembers a dismissal for this owner", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorSecurityRecommendation />));
    expect(container.textContent).toContain("optional two-factor");
    expect(container.querySelector('a[href="/sponsor/security"]')).not.toBeNull();
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toBe("");
    await act(async () => root.render(null));
    await act(async () => root.render(<SponsorSecurityRecommendation />));
    expect(container.textContent).toBe("");
    viewer.user = { id: "owner-b", totpEnabled: false };
    await act(async () => root.render(<SponsorSecurityRecommendation />));
    expect(container.textContent).toContain("optional two-factor");
    viewer.user = { ...viewer.user, totpEnabled: true };
    await act(async () => root.render(<SponsorSecurityRecommendation />));
    expect(container.textContent).toBe("");
  } finally { await act(async () => root.unmount()); }
});
