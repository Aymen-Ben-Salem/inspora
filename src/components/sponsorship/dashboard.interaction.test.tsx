// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ search: "", listeners: new Set<() => void>() }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(useSyncExternalStore(
    (listener) => { navigation.listeners.add(listener); return () => navigation.listeners.delete(listener); },
    () => navigation.search, () => navigation.search,
  )) };
});
const updateBrowserHistory = window.history.replaceState.bind(window.history);
function navigate(search: string) {
  updateBrowserHistory(null, "", `http://localhost:3000/sponsor/dashboard${search}`);
  navigation.search = search;
  for (const listener of navigation.listeners) listener();
}
beforeEach(() => {
  navigate("");
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
    paidAt: "2026-10-10T20:35:20Z",
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

it("switches three dashboard sections while preserving payment choice and hiding unrelated panels", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/dashboard") ? {ok:true,value:initial} : url.endsWith("/campaigns") ? {ok:true,value:{ownerUserId:"owner",campaigns:[],readonly:false}} : { data: { status: "unavailable", source: "Inspora accepted events" } })));
  navigate("?billing=subscription");
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={initial} />));
    const nav = container.querySelector('nav[aria-label="Sponsorship sections"]')!;
    expect(nav).not.toBeNull();
    const select = (label: string) => Array.from(nav.querySelectorAll("button")).find(b => b.textContent === label)!;
    expect(select("Overview").getAttribute("aria-current")).toBe("page");
    expect(container.querySelector<HTMLElement>('#billing')!.hidden).toBe(true);
    await act(async () => select("Billing").click());
    expect(container.querySelector<HTMLElement>('#billing')!.hidden).toBe(false);
    expect(container.querySelector<HTMLElement>('#overview')!.hidden).toBe(true);
    expect(new URLSearchParams(navigation.search).get("billing")).toBe("subscription");
    expect(new URLSearchParams(navigation.search).get("section")).toBe("billing");
    await act(async () => select("Campaigns").click());
    expect(container.querySelector<HTMLElement>('#campaigns')!.hidden).toBe(false);
    expect(container.querySelector<HTMLElement>('#billing')!.hidden).toBe(true);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("reuses loaded sections when switching tabs and keeps the selected overview range", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetcher = vi.fn(async (url: string) => Response.json(url.endsWith("/dashboard") ? {ok:true,value:initial} : url.endsWith("/campaigns") ? {ok:true,value:{ownerUserId:"owner",campaigns:[],readonly:false}} : { data: { status: "unavailable", source: "Inspora accepted events" } }));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={initial} />));
    const nav = container.querySelector('nav[aria-label="Sponsorship sections"]')!;
    const select = (label: string) => Array.from(nav.querySelectorAll("button")).find(b => b.textContent === label)!;
    const overview = container.querySelector('#overview')!;
    await act(async () => Array.from(overview.querySelectorAll("button")).find(b => b.textContent === "7 days")!.click());
    await act(async () => select("Campaigns").click());
    await act(async () => select("Billing").click());
    await act(async () => select("Overview").click());
    await act(async () => select("Campaigns").click());
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/campaigns"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => url.includes("/analytics"))).toHaveLength(2);
    expect(Array.from(overview.querySelectorAll("button")).find(b => b.textContent === "7 days")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('#campaigns')!.textContent).not.toContain("Loading campaigns");
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("reviews monthly billing in a toast without blocking the page and only opens checkout after confirmation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const data = { ...initial, account:{ ...initial.account!, billingMode:"one_time" as const, monthlyAvailable:true } };
  let finish!: (response: Response) => void;
  const fetcher=vi.fn((url:string)=>url.endsWith("/monthly") ? new Promise<Response>(resolve=>{finish=resolve;}) : Promise.resolve(Response.json(url.endsWith("/dashboard")?{ok:true,value:data}:{data:{status:"unavailable",source:"Inspora accepted events"}})));
  vi.stubGlobal("fetch",fetcher);
  const container=document.createElement("div"),root=createRoot(container);
  document.body.append(container);
  try {
    await act(async()=>root.render(<SponsorDashboard initial={data}/>));
    const click=(text:string)=>Array.from(container.querySelectorAll("button")).find(b=>b.textContent===text)!.click();
    await act(async()=>click("Billing"));
    expect(container.querySelectorAll('#billing > dl > div')).toHaveLength(1);
    expect(container.querySelector('#billing')!.textContent).not.toContain("Paid on");
    const trigger = Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Switch to monthly")!;
    trigger.focus();
    await act(async()=>trigger.click());
    const toast = container.querySelector<HTMLElement>('[aria-label="Monthly billing confirmation"]')!;
    expect(container.querySelector('dialog')).toBeNull();
    expect(toast.textContent).toContain("current paid time stays covered");
    expect(toast.textContent).toContain("$500");
    expect(toast.textContent).toContain("9 Nov 2026, 20:31 UTC");
    expect(toast.querySelector('[role="status"]')).not.toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.documentElement.style.overflow).not.toBe("hidden");
    expect(trigger.isConnected).toBe(true);
    expect(container.querySelector('#monthly-plan-title')!.closest('section')!.contains(toast)).toBe(false);
    const tab = new KeyboardEvent("keydown", {key:"Tab",bubbles:true,cancelable:true});
    toast.querySelector('[aria-label="Continue to monthly checkout"]')!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(fetcher.mock.calls.some(([url])=>url.endsWith("/monthly"))).toBe(false);
    await act(async()=>click("Cancel"));
    expect(container.querySelector('[aria-label="Monthly billing confirmation"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.documentElement.style.overflow).not.toBe("hidden");
    await act(async()=>click("Switch to monthly"));
    const confirm=container.querySelector<HTMLButtonElement>('[aria-label="Continue to monthly checkout"]')!;
    await act(async()=>{confirm.click();confirm.click();});
    expect(fetcher.mock.calls.filter(([url])=>url.endsWith("/monthly"))).toHaveLength(1);
    await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",cancelable:true})));
    expect(container.querySelector('[aria-label="Monthly billing confirmation"]')).not.toBeNull();
    await act(async()=>finish(Response.json({ok:false,message:"Checkout unavailable"},{status:503})));
    expect(container.querySelector('[aria-label="Monthly billing confirmation"] [role="alert"]')!.textContent).toBe("Checkout unavailable");
    expect(confirm.disabled).toBe(false);
    await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",cancelable:true})));
    expect(container.querySelector('[aria-label="Monthly billing confirmation"]')).toBeNull();
    await act(async()=>trigger.click());
    expect(container.querySelector('[aria-label="Monthly billing confirmation"] [role="alert"]')).toBeNull();
    container.querySelector<HTMLButtonElement>('[aria-label="Close monthly billing review"]')!.focus();
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Close monthly billing review"]')!.click());
    expect(container.querySelector('[aria-label="Monthly billing confirmation"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await act(async()=>trigger.click());
    await act(async()=>click("Overview"));
    await act(async()=>click("Billing"));
    expect(container.querySelector('[aria-label="Monthly billing confirmation"]')).toBeNull();
    expect(fetcher.mock.calls.filter(([url])=>url.endsWith("/monthly"))).toHaveLength(1);
  }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});

it("defaults to a single calendar month and sends the explicit monthly choice to checkout", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const data = { ...initial, account: null,
    checkout: { ...initial.checkout!, state: "ready", paymentReceived: false } };
  const fetcher = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async (url) => Response.json(
    url === "/api/sponsorship/dashboard" ? { ok: true, value: data } : { ok: false, message: "Review captured" },
  ));
  vi.stubGlobal("fetch", fetcher);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={data} />));
    const once = container.querySelector<HTMLInputElement>('input[value="one_time"]');
    expect(once?.checked).toBe(true);
    expect(container.textContent).toContain("1 calendar month");
    const checkout = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Continue to test checkout")!;
    await act(async () => checkout.click());
    expect(JSON.parse(String(fetcher.mock.calls.filter(([url]) => url === "/api/sponsorship/checkout")[0][1].body))).toEqual({ checkoutId: "checkout", billingMode: "one_time", currency: "usd" });
    const monthly = container.querySelector<HTMLInputElement>('input[value="subscription"]')!;
    await act(async () => monthly.click());
    await act(async () => checkout.click());
    expect(JSON.parse(String(fetcher.mock.calls.filter(([url]) => url === "/api/sponsorship/checkout")[1][1].body))).toEqual({ checkoutId: "checkout", billingMode: "subscription", currency: "usd" });
  } finally {
    await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});

it("displays pinned monthly terms despite a one-time review query", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const data = { ...initial, account: null,
    checkout: { ...initial.checkout!, state: "reserved", paymentReceived: false } };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, value: data })));
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={data} initialMode="one_time" />));
    const once = container.querySelector<HTMLInputElement>('input[value="one_time"]')!,
      monthly = container.querySelector<HTMLInputElement>('input[value="subscription"]')!;
    expect(monthly.checked).toBe(true); expect(once.closest("fieldset")!.disabled).toBe(true);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("updates a revisited review to the choice carried from the campaign editor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  const data = { ...initial, account: null, checkout: { ...initial.checkout!, state: "ready" } };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, value: data })));
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
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, value: data })));
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
  const dashboardRequests = vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, value: initial }))
    .mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal("fetch", vi.fn((url: string) => url === "/api/sponsorship/dashboard"
    ? dashboardRequests()
    : Promise.resolve(Response.json({ data: { status: "unavailable", source: "Inspora accepted events" } }))));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={initial} />));
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>('nav button')).find(button => button.textContent === "Billing")!.click());
    const refresh = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Refresh")!;
    await act(async () => refresh.click());
    expect(refresh.textContent).toBe("Refreshing…");
    expect(refresh.disabled).toBe(true);
    expect(refresh.getAttribute("aria-busy")).toBe("true");
    await act(async () => resolve(Response.json({ ok: true, value: { ...initial, account: { ...initial.account, cancelAtPeriodEnd: true } } })));
    expect(refresh.disabled).toBe(false);
    expect(refresh.textContent).toBe("Refresh");
    expect(container.textContent).toContain("Cancellation");
    expect(container.textContent).toContain("No automatic renewal");
    expect(container.querySelector('#billing')!.textContent).not.toContain("Paid on");
    const period = Array.from(container.querySelectorAll('#billing > dl > div')).find(card => card.querySelector('dt')?.textContent === "Subscription")!;
    expect(Array.from(period.querySelectorAll('time')).map(time => time.dateTime)).toEqual([initial.account!.periodStart, initial.account!.paidThrough]);
    expect(container.querySelector('#billing')!.textContent).not.toContain("Paid through");
    expect(container.textContent).not.toContain("Promotion is paused");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("releases the refresh loading state after a failed request and keeps the saved billing view", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const dashboardRequests = vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, value: initial }))
    .mockRejectedValueOnce(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", vi.fn((url: string) => url === "/api/sponsorship/dashboard"
    ? dashboardRequests()
    : Promise.resolve(Response.json({ data: { status: "unavailable", source: "Inspora accepted events" } }))));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<SponsorDashboard initial={initial} />));
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>('nav button')).find(button => button.textContent === "Billing")!.click());
    const refresh = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Refresh")!;
    await act(async () => refresh.click());
    expect(refresh.disabled).toBe(false);
    expect(refresh.textContent).toBe("Refresh");
    expect(container.textContent).toContain("Your latest billing state could not be loaded.");
    expect(container.textContent).not.toContain("Promotion is paused");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
