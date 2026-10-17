// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalyticsOverview, DeliveryChart } from "./analytics-overview";
import { EMPTY_COUNTS, metricsFromCounts, type MetricsReport } from "@/analytics/first-party/query";

const metrics = metricsFromCounts({ ...EMPTY_COUNTS, impressions: 10, clicks: 2 });
const report: MetricsReport = { source: "Inspora accepted events", status: "available", asOf: "2026-10-17T12:00:00Z",
  start: "2026-10-10T00:00:00Z", end: "2026-10-13T00:00:00Z", range: "30d", summary: metrics,
  daily: [{ label: "2026-10-10 00:00:00", ...metrics }], placement: [], country: [], device: [], referrer: [], campaign: [], version: [], spend: null, cpc: null, cpm: null };
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
const dateInput = () => container.querySelector<HTMLInputElement>('input[aria-label="Performance date"]')!;
async function chooseDate(day: string) { await act(async () => {
  const input = dateInput();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, day);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}); }

it("selects a chart day from the calendar and keeps the arrows synchronized", async () => {
  await act(async () => root.render(<DeliveryChart rows={report.daily} start={report.start} end={report.end} />));
  expect(dateInput().value).toBe("2026-10-12");
  await chooseDate("2026-10-10");
  expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("10 impressions");
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Previous day"]')!.disabled).toBe(true);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next day"]')!.click());
  expect(dateInput().value).toBe("2026-10-11");
  expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain("0 impressions");
});
it("loads older dates outside the graph and blocks exporting the previous report while loading", async () => {
  await act(async () => root.render(<AnalyticsOverview />));
  let finish!: (value: Response) => void;
  fetcher.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
  await chooseDate("2026-10-01");
  expect(fetcher.mock.lastCall![0]).toContain("endDate=2026-10-01");
  expect(button("Export CSV").disabled).toBe(true);
  await act(async () => finish(Response.json({ data: { ...report, start: "2026-09-02T00:00:00Z", end: "2026-10-02T00:00:00Z", daily: [] } })));
  expect(dateInput().value).toBe("2026-10-01");
  expect(button("Export CSV").disabled).toBe(false);
  await act(async () => button("Back to recent activity").click());
  expect(fetcher.mock.lastCall![0]).not.toContain("endDate");
});
it("downloads the loaded report as CSV with a date-based filename", async () => {
  const downloads: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
  await act(async () => root.render(<AnalyticsOverview />));
  await act(async () => button("Export CSV").click());
  expect(downloads).toEqual(["inspora-performance-2026-10-10-2026-10-13.csv"]);
  expect(createUrl).toHaveBeenCalledTimes(1);
  const blob = createUrl.mock.calls[0][0] as Blob;
  expect(blob.type).toBe("text/csv;charset=utf-8");
  expect(await blob.text()).toContain('"Summary","All matching activity","10","2"');
});
it("keeps export disabled and reports an unavailable request instead of loading forever", async () => {
  fetcher.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => root.render(<AnalyticsOverview />));
  expect(button("Export CSV").disabled).toBe(true);
  expect(container.textContent).toContain("Performance is unavailable");
  expect(createUrl).not.toHaveBeenCalled();
});
