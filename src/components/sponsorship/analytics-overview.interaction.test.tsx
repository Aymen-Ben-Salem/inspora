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
