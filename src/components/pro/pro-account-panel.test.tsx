// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProAccountPanel, type ProAccountView } from "./pro-account-panel";

const external = vi.hoisted(() => ({ refresh: vi.fn(), deletion: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: external.refresh }) }));
vi.mock("@clerk/nextjs", () => ({ useReverification: (action: unknown) => action }));
vi.mock("@clerk/nextjs/errors", () => ({ isReverificationCancelledError: () => false }));
vi.mock("@/features/profiles/actions", () => ({ requestOwnAccountDeletion: external.deletion }));

const view: ProAccountView = {
  active: true, reason: null, closed: false, paidThrough: "2027-04-01Z", cancelAtPeriodEnd: false,
  hasCustomer: true, subscribed: true, checkout: null,
};
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", external.fetch.mockResolvedValue(Response.json({ ok: true })));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const button = (text: string) => [...container.querySelectorAll("button")].find(node => node.textContent === text)!;

it("shows the plan, plugin setup and fair-use limits without any credits", async () => {
  await act(() => root.render(<ProAccountPanel view={view} />));
  expect(container.textContent).toContain("US$7 per month");
  expect(container.textContent).toContain("claude plugin install inspora@inspora-team");
  expect(container.textContent).toContain("codex plugin add inspora@inspora-team");
  expect(container.textContent).toContain("30 tool calls a minute, 500 a day and 3,000 searches a month");
  expect(container.textContent?.toLowerCase()).not.toContain("credits");
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
});

it("cancels renewal through the account action and refreshes", async () => {
  await act(() => root.render(<ProAccountPanel view={view} />));
  await act(() => button("Cancel renewal").click());
  expect(external.fetch).toHaveBeenCalledWith("/api/account/pro/cancel-renewal", { method: "POST" });
  expect(external.refresh).toHaveBeenCalledOnce();
});

it("offers subscription when inactive and keeps a refused action visible", async () => {
  external.fetch.mockResolvedValueOnce(Response.json({ message: "Billing is temporarily unavailable. Try again." }, { status: 503 }));
  await act(() => root.render(<ProAccountPanel view={{ ...view, active: false, reason: "no_active_subscription", subscribed: false }} />));
  await act(() => button("Subscribe").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Billing is temporarily unavailable");
  expect(external.refresh).not.toHaveBeenCalled();
  expect(container.textContent).toContain("The plugin works while your Pro subscription is active.");
});

it("warns that deletion cancels Pro and requires typed confirmation", async () => {
  await act(() => root.render(<ProAccountPanel view={view} />));
  expect(container.textContent).toContain("cancels Pro immediately");
  expect(container.textContent).toContain("cancel your renewal instead");
  expect(button("Permanently delete account").disabled).toBe(true);
  expect(external.deletion).not.toHaveBeenCalled();
});

it("refreshes a pending Checkout return and stops once payment activates Pro", async () => {
  vi.useFakeTimers();
  await act(() => root.render(<ProAccountPanel view={{ ...view, active: false, checkout: "subscribed" }} />));
  expect(button("Refresh payment status")).toBeDefined();
  await act(() => vi.advanceTimersByTime(3000));
  expect(external.refresh).toHaveBeenCalledOnce();
  await act(() => root.render(<ProAccountPanel view={{ ...view, checkout: "subscribed" }} />));
  await act(() => vi.advanceTimersByTime(6000));
  expect(external.refresh).toHaveBeenCalledOnce();
  expect(external.fetch).not.toHaveBeenCalled();
});
