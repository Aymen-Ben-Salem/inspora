// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalyticsOverview, DeliveryChart } from "./analytics-overview";
import { EMPTY_COUNTS, metricsFromCounts, type MetricsReport } from "@/analytics/first-party/query";

const metrics = metricsFromCounts({ ...EMPTY_COUNTS, impressions: 10, clicks: 2 });
const report: MetricsReport = { source: "Inspora accepted events", status: "available", asOf: "2026-10-17T12:00:00Z",
  start: "2026-10-10T00:00:00Z", end: "2026-10-13T00:00:00Z", range: "30d", summary: metrics,
  daily: [{ label: "2026-10-10 00:00:00", ...metrics }], placement: [], country: [], device: [], referrer: [{ label: "referrer.example", ...metrics }], campaign: [], version: [{ label: "internal-version-id", ...metrics }], spend: null, cpc: null, cpm: null };
let container: HTMLDivElement, root: Root;
const fetcher = vi.fn(), createUrl = vi.fn(), revokeUrl = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  fetcher.mockReset().mockResolvedValue(Response.json({ data: report }));
  vi.stubGlobal("fetch", fetcher);
  createUrl.mockReset().mockReturnValue("blob:report"); revokeUrl.mockReset();
  const OriginalURL = URL;
  vi.stubGlobal("URL", class extends OriginalURL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl; });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === label)!;
const selectedDate = () => container.querySelector("time")?.dateTime;

it("opens grouped filters on hover and closes after the pointer leaves", async () => {
  await act(async () => root.render(<AnalyticsOverview />));
  const trigger = button("Filters");
  const group = container.querySelector('[aria-label="Report filters"]')!;
  expect(group.closest("[inert]")).not.toBeNull();
  await act(async () => trigger.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(group.closest("[inert]")).toBeNull();
  expect(group.querySelectorAll('button[aria-haspopup="menu"]')).toHaveLength(4);
  expect(group.querySelector("select")).toBeNull();
  await act(async () => trigger.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body })));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

it("applies grouped filters and supports tap, Escape, and outside dismissal", async () => {
  await act(async () => root.render(<AnalyticsOverview />));
  const trigger = button("Filters");
  await act(async () => trigger.click());
  const placement = container.querySelector<HTMLButtonElement>('button[aria-label="Placement report"]')!;
  await act(async () => placement.click());
  const options = container.querySelector('[role="menu"][aria-label="Placement report"]')!;
  await act(async () => Array.from(options.querySelectorAll("button")).find(option => option.textContent === "Feed")!.click());
  expect(fetcher.mock.lastCall![0]).toContain("placement=feed");
  expect(placement.textContent).toContain("Feed");
  expect(options.getAttribute("aria-hidden")).toBe("true");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  await act(async () => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});

it("dismisses an option menu before its parent and navigates options with the keyboard", async () => {
  await act(async () => root.render(<AnalyticsOverview />));
  const trigger = button("Filters");
  await act(async () => trigger.click());
  const placement = container.querySelector<HTMLButtonElement>('button[aria-label="Placement report"]')!;
  await act(async () => placement.click());
  const options = container.querySelector('[role="menu"][aria-label="Placement report"]')!;
  const first = options.querySelector<HTMLButtonElement>('button')!;
  await act(async () => first.focus());
  await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  expect(document.activeElement?.textContent).toBe("Navbar");
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(placement.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(placement);
  await act(async () => placement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});

it.each([["usd", "$"], ["eur", "€"]])("shows %s spend and cost metrics with currency symbols", async (currency, symbol) => {
  fetcher.mockResolvedValueOnce(Response.json({ data: { ...report, spend: { amount: 450, currency }, cpc: 0.61, cpm: 18.1 } }));
  await act(async () => root.render(<AnalyticsOverview />));
  const reach = container.querySelector("#report-reach-video")!;
  expect(reach.textContent).toContain(`${symbol}0.61`);
  expect(reach.textContent).toContain(`${symbol}18.10`);
  expect(reach.textContent).toContain(`${symbol}450.00`);
  expect(reach.textContent).not.toContain(currency.toUpperCase());
});

it("keeps daily figures synchronized with the chart arrows", async () => {
  await act(async () => root.render(<DeliveryChart rows={report.daily} start={report.start} end={report.end} />));
  expect(selectedDate()).toBe("2026-10-12");
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Previous day"]')!.click());
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Previous day"]')!.click());
  expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("10 impressions");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Previous day"]')!.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next day"]')!.click());
  expect(selectedDate()).toBe("2026-10-11");
  expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("0 impressions");
});
it("loads yesterday from the top controls and blocks exporting the previous report while loading", async () => {
  await act(async () => root.render(<AnalyticsOverview />));
  let finish!: (value: Response) => void;
  fetcher.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
  await act(async () => button("Yesterday").click());
  expect(fetcher.mock.lastCall![0]).toContain("endDate=2026-10-16");
  expect(fetcher.mock.lastCall![0]).toContain("range=1d");
  expect(button("Export CSV").disabled).toBe(true);
  await act(async () => finish(Response.json({ data: { ...report, start: "2026-10-16T00:00:00Z", end: "2026-10-17T00:00:00Z", daily: [] } })));
  expect(selectedDate()).toBe("2026-10-16");
  expect(button("Export CSV").disabled).toBe(false);
  await act(async () => button("Back to recent activity").click());
  expect(fetcher.mock.lastCall![0]).not.toContain("endDate");
});
it("downloads the loaded report as CSV with a date-based filename", async () => {
  const downloads: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
  await act(async () => root.render(<AnalyticsOverview />));
  await act(async () => button("Export CSV").click());
  expect(container.textContent).not.toContain("Referring sites");
  expect(container.textContent).not.toContain("Creative versions");
  expect(container.textContent).not.toContain("All versions");
  expect(downloads).toEqual(["inspora-performance-2026-10-10-2026-10-13.csv"]);
  expect(createUrl).toHaveBeenCalledTimes(1);
  const blob = createUrl.mock.calls[0][0] as Blob;
  expect(blob.type).toBe("text/csv;charset=utf-8");
  const csv = await blob.text();
  expect(csv).toContain('"Summary","All matching activity","10","2"');
  expect(csv).not.toContain("referrer.example");
  expect(csv).not.toContain("internal-version-id");
});
it("keeps export disabled and reports an unavailable request instead of loading forever", async () => {
  fetcher.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => root.render(<AnalyticsOverview />));
  expect(button("Export CSV").disabled).toBe(true);
  expect(container.textContent).toContain("Performance is unavailable");
  expect(createUrl).not.toHaveBeenCalled();
});
