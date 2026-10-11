// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ search: "", listeners: new Set<() => void>() }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useSearchParams: () => new URLSearchParams(useSyncExternalStore(
    (listener) => { navigation.listeners.add(listener); return () => navigation.listeners.delete(listener); },
    () => navigation.search, () => navigation.search,
  )) };
});
function navigate(search: string) { navigation.search = search; for (const listener of navigation.listeners) listener(); }
beforeEach(() => {
  navigation.search = "";
  vi.spyOn(window.history, "replaceState").mockImplementation((_state, _title, url) => {
    navigate(new URL(String(url), "http://localhost:3000/sponsor/dashboard").search);
  });
});
afterEach(() => { vi.restoreAllMocks(); });
import { SponsorDashboard, type SponsorDashboardData } from "./dashboard";

const initial: SponsorDashboardData = {
  ownerUserId: "owner",
  account: {
    state: "active",
    paidThrough: "2026-11-09T20:31:20Z",
    periodStart: "2026-10-10T20:31:20Z",
    recoveryDeadline: null,
    cancelAtPeriodEnd: false,
    billingAvailable: true,
    billingCurrency: "usd",
    billingMode: "subscription",
    billingInterval: "day",
    billingIntervalCount: 30,
  },
  checkout: { id: "checkout", state: "completed", billingMode: "subscription", paymentReceived: true, exceptionCode: null },
  campaigns: [{ id: "campaign", title: "Test", url: "https://example.com", state: "published" }],
  checkoutEnabled: true,
  capacityAvailable: true,
};

it("defaults to a single calendar month and sends the explicit monthly choice to checkout", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetcher = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async () => Response.json({ ok: false, message: "Review captured" }));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={{ ...initial, account: null,
      checkout: { ...initial.checkout!, state: "ready", paymentReceived: false } }} />));
    const once = container.querySelector<HTMLInputElement>('input[value="one_time"]');
    expect(once?.checked).toBe(true);
    expect(container.textContent).toContain("One calendar month");
    const checkout = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Continue to test checkout")!;
    await act(async () => checkout.click());
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual({ checkoutId: "checkout", billingMode: "one_time" });
    const monthly = container.querySelector<HTMLInputElement>('input[value="subscription"]')!;
    await act(async () => monthly.click());
    await act(async () => checkout.click());
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({ checkoutId: "checkout", billingMode: "subscription" });
  } finally {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});

it("displays pinned monthly terms despite a one-time review query", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={{ ...initial, account: null,
      checkout: { ...initial.checkout!, state: "reserved", paymentReceived: false } }} initialMode="one_time" />));
    const once = container.querySelector<HTMLInputElement>('input[value="one_time"]')!,
      monthly = container.querySelector<HTMLInputElement>('input[value="subscription"]')!;
    expect(monthly.checked).toBe(true); expect(once.closest("fieldset")!.disabled).toBe(true);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("updates a revisited review to the choice carried from the campaign editor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  const data = { ...initial, account: null, checkout: { ...initial.checkout!, state: "ready" } };
  try {
    await act(async () => root.render(<SponsorDashboard initial={data} initialMode="one_time" />));
    await act(async () => navigate("?billing=subscription"));
    await act(async () => root.render(<SponsorDashboard initial={data} initialMode="subscription" />));
    expect(container.querySelector<HTMLInputElement>('input[value="subscription"]')!.checked).toBe(true);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("reapplies an editor choice even when it matches the original review query", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  const data = { ...initial, account: null, checkout: { ...initial.checkout!, state: "ready" } };
  try {
    await act(async () => root.render(<SponsorDashboard initial={data} initialMode="one_time" />));
    await act(async () => container.querySelector<HTMLInputElement>('input[value="subscription"]')!.click());
    expect(container.querySelector<HTMLInputElement>('input[value="subscription"]')!.checked).toBe(true);
    await act(async () => { navigate("?billing=one_time"); root.render(<SponsorDashboard initial={data} initialMode="one_time" />); });
    expect(container.querySelector<HTMLInputElement>('input[value="one_time"]')!.checked).toBe(true);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

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
