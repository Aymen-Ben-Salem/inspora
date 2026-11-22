// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReportDateRange } from "./report-date-range";
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
function Fixture({ initial = { range: "30d" } }: { initial?: MetricsFilter }) {
  const [filter, setFilter] = useState(initial);
  return <ReportDateRange filter={filter} onChange={next => { changed(next); setFilter(next); }} />;
}
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
