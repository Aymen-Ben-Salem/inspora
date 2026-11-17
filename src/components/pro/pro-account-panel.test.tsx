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
  hasCustomer: true, includedResetsAt: "2027-04-01Z", balances: { included: 40, purchased: 500, available: 540 },
  autoRecharge: { enabled: false, capCents: null, spentCents: 0, notice: null, consentForCurrent: true },
  usage: [], purchases: [], checkout: null,
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

it("requires explicit consent before enabling automatic top-up with the chosen cap", async () => {
  await act(() => root.render(<ProAccountPanel view={view} />));
  expect(button("Turn on automatic top-up").disabled).toBe(true);
  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(() => checkbox.click());
  const select = container.querySelector("select")!;
  await act(() => { select.value = "2000"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button("Turn on automatic top-up").disabled).toBe(false);
  await act(() => button("Turn on automatic top-up").click());
  expect(external.fetch).toHaveBeenCalledWith("/api/account/pro/recharge", expect.objectContaining({ body: JSON.stringify({ enabled: true, capCents: 2000, acknowledged: true }) }));
  expect(external.refresh).toHaveBeenCalledOnce();
});

it("keeps preserved purchased credits visible while inactive and offers no credit purchase", async () => {
  await act(() => root.render(<ProAccountPanel view={{ ...view, active: false, reason: "no_active_subscription" }} />));
  expect(button("Subscribe")).toBeDefined();
  expect(container.textContent).toContain("500");
  expect([...container.querySelectorAll("button")].some(node => node.textContent?.startsWith("Buy "))).toBe(false);
  expect(container.querySelector('input[type="checkbox"]')).toBeNull();
});

it("shows the balance-loss warning and requires typed confirmation before personal deletion", async () => {
  await act(() => root.render(<ProAccountPanel view={view} />));
  expect(container.textContent).toContain("540 credits, including 500 purchased credits");
  expect(button("Permanently delete account").disabled).toBe(true);
  expect(external.deletion).not.toHaveBeenCalled();
});

it("keeps the account visible when a pack purchase is refused by the server", async () => {
  external.fetch.mockResolvedValueOnce(Response.json({ message: "An active Inspora Pro subscription is required." }, { status: 409 }));
  await act(() => root.render(<ProAccountPanel view={view} />));
  const pack = [...container.querySelectorAll("button")].find(node => node.textContent?.startsWith("Buy 500 credits"))!;
  await act(() => pack.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("An active Inspora Pro subscription is required.");
  expect(external.refresh).not.toHaveBeenCalled();
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
