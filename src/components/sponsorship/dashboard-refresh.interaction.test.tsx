// @vitest-environment happy-dom
import { act, Activity, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
import { SponsorDashboard, type SponsorDashboardData } from "./dashboard";

const stale: SponsorDashboardData = {
  ownerUserId: "owner",
  account: null,
  checkout: {
    id: "preparation",
    state: "preparing",
    billingMode: "one_time",
    paymentReceived: false,
    exceptionCode: null,
  },
  campaigns: [],
  checkoutEnabled: true,
  capacityAvailable: true,
};
const saved: SponsorDashboardData = {
  ...stale,
  checkout: { ...stale.checkout!, state: "ready" },
  campaigns: [{ id: "campaign", title: "Saved campaign", url: "https://example.com", state: "prepared" }],
};
const fetcher = vi.fn();
let container: HTMLDivElement, root: Root;
const button = (label: string) => Array.from(container.querySelectorAll("button"))
  .find(button => button.textContent === label)!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  window.history.replaceState(null, "", "http://localhost:3000/sponsor/dashboard?billing=one_time");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetcher.mockReset();
  vi.unstubAllGlobals();
});

it("automatically replaces a prefetched preparation with the saved campaign and enables checkout", async () => {
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
  await act(async () => root.render(<SponsorDashboard initial={stale} />));

  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/sponsorship/dashboard", {
    cache: "no-store", signal: expect.any(AbortSignal),
  });
  expect(button("Refreshing…").disabled).toBe(true);
  expect(button("Continue to test checkout").disabled).toBe(true);
  await act(async () => resolve(Response.json({ ok: true, value: saved })));

  expect(button("Continue to test checkout").disabled).toBe(false);
  window.history.replaceState(null, "", "?section=campaigns&billing=one_time");
  await act(async () => root.render(<SponsorDashboard initial={stale} />));
  expect(container.querySelector<HTMLElement>("#campaigns")!.hidden).toBe(false);
  expect(container.querySelector("#campaigns")!.textContent).toContain("Saved campaign");
  expect(container.textContent).not.toContain("Waiting for verified payment");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("keeps manual Refresh available when the automatic request fails", async () => {
  fetcher.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(Response.json({ ok: true, value: saved }));
  await act(async () => root.render(<SponsorDashboard initial={stale} />));

  expect(container.textContent).toContain("Your latest billing state could not be loaded.");
  expect(button("Refresh").disabled).toBe(false);
  expect(button("Continue to test checkout").disabled).toBe(true);
  await act(async () => button("Refresh").click());
  expect(button("Continue to test checkout").disabled).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("cancels the old request when StrictMode replays effects", async () => {
  const responses: Array<(response: Response) => void> = [];
  fetcher.mockImplementation(() => new Promise<Response>(resolve => { responses.push(resolve); }));
  await act(async () => root.render(<StrictMode><SponsorDashboard initial={stale} /></StrictMode>));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(false);
  await act(async () => responses[1](Response.json({ ok: true, value: saved })));
  await act(async () => responses[0](Response.json({ ok: true, value: stale })));
  expect(button("Continue to test checkout").disabled).toBe(false);
});

it("starts a fresh request when returning while the previous dashboard read is pending", async () => {
  const responses: Array<(response: Response) => void> = [];
  fetcher.mockImplementation(() => new Promise<Response>(resolve => { responses.push(resolve); }));
  const dashboard = (mode: "visible" | "hidden") => <Activity mode={mode}><SponsorDashboard initial={stale} /></Activity>;
  await act(async () => root.render(dashboard("visible")));
  await act(async () => root.render(dashboard("hidden")));
  await act(async () => root.render(dashboard("visible")));

  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => responses[1](Response.json({ ok: true, value: saved })));
  await act(async () => responses[0](Response.json({ ok: true, value: stale })));
  expect(button("Continue to test checkout").disabled).toBe(false);
  expect(container.querySelector("#campaigns")!.textContent).toContain("Saved campaign");
});

it("shows loading again when a completed dashboard is restored", async () => {
  let resolve!: (response: Response) => void;
  fetcher.mockResolvedValueOnce(Response.json({ ok: true, value: saved }))
    .mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
  const dashboard = (mode: "visible" | "hidden") => <Activity mode={mode}><SponsorDashboard initial={stale} /></Activity>;
  await act(async () => root.render(dashboard("visible")));
  expect(button("Continue to test checkout").disabled).toBe(false);
  await act(async () => root.render(dashboard("hidden")));
  await act(async () => root.render(dashboard("visible")));
  expect(button("Continue to test checkout").disabled).toBe(true);
  expect(button("Refreshing…").disabled).toBe(true);
  await act(async () => resolve(Response.json({ ok: true, value: saved })));
  expect(button("Continue to test checkout").disabled).toBe(false);
});
