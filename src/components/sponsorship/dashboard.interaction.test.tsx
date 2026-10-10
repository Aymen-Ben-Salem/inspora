// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SponsorDashboard, type SponsorDashboardData } from "./dashboard";

const initial: SponsorDashboardData = {
  account: {
    state: "active",
    paidThrough: "2026-11-09T20:31:20Z",
    periodStart: "2026-10-10T20:31:20Z",
    recoveryDeadline: null,
    cancelAtPeriodEnd: false,
    billingAvailable: true,
  },
  checkout: { id: "checkout", state: "completed", paymentReceived: true, exceptionCode: null },
  campaigns: [{ id: "campaign", title: "Test", url: "https://example.com", state: "published" }],
  checkoutEnabled: true,
  capacityAvailable: true,
};

it("shows refresh progress and then renders cancellation without removing the paid campaign", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let resolve!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={initial} />));
    const refresh = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Refresh")!;
    await act(async () => refresh.click());
    expect(refresh.textContent).toBe("Refreshing…");
    expect(refresh.disabled).toBe(true);
    expect(refresh.getAttribute("aria-busy")).toBe("true");
    await act(async () => resolve(Response.json({ ok: true, value: { ...initial, account: { ...initial.account, cancelAtPeriodEnd: true } } })));
    expect(refresh.disabled).toBe(false);
    expect(refresh.textContent).toBe("Refresh");
    expect(container.textContent).toContain("Cancellation");
    expect(container.textContent).toContain("Ends 9 Nov 2026, 20:31 UTC");
    expect(container.textContent).toContain("Published through the paid period");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("releases the refresh loading state after a failed request and keeps the saved billing view", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={initial} />));
    const refresh = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Refresh")!;
    await act(async () => refresh.click());
    expect(refresh.disabled).toBe(false);
    expect(refresh.textContent).toBe("Refresh");
    expect(container.textContent).toContain("Your latest billing state could not be loaded.");
    expect(container.textContent).toContain("Published through the paid period");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
