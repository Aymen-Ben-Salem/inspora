// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReportDateRange, type ReportCampaignRun } from "./report-date-range";
import type { MetricsFilter } from "@/analytics/first-party/query";
let container: HTMLDivElement, root: Root;
const changed = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  changed.mockReset();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const button = (label: string) => Array.from(container.querySelectorAll("button")).find(item => item.textContent === label)!;
const day = (value: string) => container.querySelector<HTMLButtonElement>(`[data-day="${value}"]`)!;
function Fixture({ initial = { range: "30d" }, runs }: { initial?: MetricsFilter; runs?: ReportCampaignRun[] }) {
  const [filter, setFilter] = useState(initial);
  return <ReportDateRange filter={filter} runs={runs} onChange={next => { changed(next); setFilter(next); }} />;
}
const runs: ReportCampaignRun[] = [
  { campaignId: "dark", title: "Dark launch", start: "2026-10-12T14:00:00.000Z", end: null },
  { campaignId: "light", title: "Light launch", start: "2026-10-02T09:30:00.000Z", end: "2026-10-12T14:00:00.000Z" },
  { campaignId: "old", title: "Summer", start: "2026-06-01T00:00:00.000Z", end: "2026-07-01T00:00:00.000Z" },
];
it("fills the start, end or both dates from a campaign run before Apply", async () => {
  await act(async () => root.render(<Fixture runs={runs} initial={{ range: "30d", placement: "feed" }} />));
  await open();
  const runItems = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
  const chooseRun = async (index: number) => {
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label^="Campaign dates:"]')!.click());
    await act(async () => runItems()[index].click());
  };
  expect(container.querySelector('button[aria-label^="Campaign dates:"]')?.getAttribute("aria-haspopup")).toBe("menu");
  expect(runItems().map(item => item.querySelector("span")!.textContent)).toEqual(["Dark launch · 12 Oct – live now", "Light launch · 2 Oct – 12 Oct", "Summer · 1 Jun – 30 Jun"]);
  expect(day("2026-10-12").hasAttribute("data-campaign-mark")).toBe(true);
  await act(async () => button("Use start").click());
  expect(container.querySelector<HTMLInputElement>('[aria-label="Start date"]')?.value).toBe("2026-10-12");
  expect(container.querySelector<HTMLInputElement>('[aria-label="End date"]')?.value).toBe("2026-10-17");
  await chooseRun(1);
  expect(runItems()[1].getAttribute("aria-checked")).toBe("true");
  await act(async () => button("Use both").click());
  await act(async () => button("Apply range").click());
  expect(changed).toHaveBeenLastCalledWith({ range: "30d", placement: "feed", startDate: "2026-10-02", endDate: "2026-10-12", periodId: undefined });
  await open();
  await act(async () => button("Use end").click());
  expect(container.querySelector<HTMLInputElement>('[aria-label="End date"]')?.value).toBe("2026-10-17");
  await chooseRun(2);
  expect(button("Use both").disabled).toBe(true);
  expect(container.textContent).toContain("no longer available");
});
async function open() { await act(async () => container.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!.click()); }
it("applies an inclusive custom range only after Apply, preserving other filters", async () => {
  await act(async () => root.render(<Fixture initial={{ range: "7d", placement: "feed", country: "TN", campaignId: "campaign", periodId: "closed" }} />));
  await open();
  await act(async () => day("2026-10-05").click());
  await act(async () => day("2026-10-10").click());
  expect(day("2026-10-07").getAttribute("aria-pressed")).toBe("true");
  expect(changed).not.toHaveBeenCalled();
  await act(async () => button("Apply range").click());
  expect(changed).toHaveBeenLastCalledWith({ range: "7d", startDate: "2026-10-05", endDate: "2026-10-10", placement: "feed", country: "TN", campaignId: "campaign", periodId: undefined });
  expect(container.querySelector("dialog")).toBeNull();
  await open();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Start date"]')?.value).toBe("2026-10-05");
  expect(container.querySelector<HTMLInputElement>('[aria-label="End date"]')?.value).toBe("2026-10-10");
});
it("supports reverse selection and cancel without committing a draft", async () => {
  await act(async () => root.render(<Fixture />)); await open();
  await act(async () => day("2026-10-10").click());
  await act(async () => day("2026-10-05").click());
  expect(container.querySelector<HTMLInputElement>('[aria-label="Start date"]')?.value).toBe("2026-10-05");
  await act(async () => button("Cancel").click());
  expect(changed).not.toHaveBeenCalled();
  await open();
  expect(container.querySelector<HTMLInputElement>('[aria-label="Start date"]')?.value).toBe("2026-09-17");
  expect(day("2026-10-18").disabled).toBe(true);
});
it("clears custom and archived dates when choosing a quick preset", async () => {
  await act(async () => root.render(<Fixture initial={{ range: "30d", startDate: "2026-10-01", endDate: "2026-10-05", placement: "header" }} />));
  await act(async () => button("Yesterday").click());
  expect(changed.mock.lastCall![0]).toEqual({ range: "1d", placement: "header", startDate: undefined, endDate: "2026-10-16", periodId: undefined });
  await act(async () => button("7 days").click());
  expect(changed.mock.lastCall![0]).toEqual({ range: "7d", placement: "header", startDate: undefined, endDate: undefined, periodId: undefined });
  expect(button("7 days").getAttribute("aria-pressed")).toBe("true");
});
it("lets an overnight tab replace a range that has just expired from retention", async () => {
  await act(async () => root.render(<Fixture initial={{ range: "30d", startDate: "2026-07-20", endDate: "2026-10-10" }} />));
  vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
  await open();
  expect(button("Apply range").disabled).toBe(true);
  expect(container.textContent).toContain("Choose a valid range in the last 90 days.");
  await act(async () => day("2026-10-05").click());
  await act(async () => day("2026-10-10").click());
  await act(async () => button("Apply range").click());
  expect(changed.mock.lastCall![0].startDate).toBe("2026-10-05");
  expect(document.activeElement).toBe(container.querySelector('[aria-haspopup="dialog"]'));
});
it("closes only the campaign menu on Escape, keeping the picker open", async () => {
  await act(async () => root.render(<Fixture runs={runs} />));
  await open();
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label^="Campaign dates:"]')!;
  await act(async () => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }));
  });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector("dialog")).not.toBeNull();
  await act(async () => { container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })); });
  expect(container.querySelector("dialog")).toBeNull();
});
