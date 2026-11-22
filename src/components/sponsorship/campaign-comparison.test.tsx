// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CampaignComparison } from "./campaign-comparison";
import { compareCampaigns } from "@/features/sponsorship/campaign-comparison-model";

it("shows one comparable row per campaign, marks the best and opens a campaign report", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const rows = compareCampaigns({
    now: new Date("2026-11-22T12:00:00Z"),
    campaigns: [{ id: "a", title: "Autumn launch", live: false }, { id: "b", title: "Dark launch", live: true }],
    intervals: [
      { campaignId: "a", startAt: new Date("2026-10-01T00:00:00Z"), endAt: new Date("2026-10-21T00:00:00Z") },
      { campaignId: "b", startAt: new Date("2026-11-12T12:00:00Z"), endAt: null },
    ],
    counts: {
      a: { impressions: 20000, clicks: 200, uniqueVisitors: 9000, previewStarts: 5000, completions: 1500 },
      b: { impressions: 15000, clicks: 300, uniqueVisitors: 7000, previewStarts: 4000, completions: 1000 },
    },
  });
  const onView = vi.fn();
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(<CampaignComparison rows={rows} onView={onView} />));
    const body = Array.from(container.querySelectorAll("tbody tr"), row => row.textContent);
    expect(body[0]).toContain("Dark launch");
    expect(body[0]).toContain("Live");
    expect(body[0]).toContain("12 Nov – now");
    expect(body[0]).toContain("1,500");
    expect(body[0]).toContain("2.00%Best");
    expect(body[1]).toContain("Ended");
    expect(body[1]).toContain("1 Oct – 21 Oct");
    expect(body[1]).toContain("20 days");
    expect(body[1]).toContain("30%Best");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="View Autumn launch report"]')!.click());
    expect(onView).toHaveBeenCalledWith(rows[1]);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
