import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/analytics/posthog-repository", () => ({
  getAdminAnalytics: vi.fn(async () => null),
  getLiveVisitorAnalytics: vi.fn(async () => null),
  isPostHogAdminConfigured: () => true,
}));
vi.mock("@/analytics/first-party/admin", () => {
  throw new Error("General traffic must not load Neon analytics");
});

import AnalyticsPage from "./page";
import { getAdminAnalytics, getLiveVisitorAnalytics } from "@/analytics/posthog-repository";
beforeEach(() => vi.clearAllMocks());

it.each([["yesterday", "yesterday"], ["90", 90], [undefined, 30]] as const)(
  "keeps the PostHog report and range for %s without the duplicate traffic section",
  async (days, expectedRange) => {
    const html = renderToStaticMarkup(await AnalyticsPage({
      searchParams: Promise.resolve({ days }),
    }));
    expect(getAdminAnalytics).toHaveBeenCalledWith(expectedRange);
    expect(getLiveVisitorAnalytics).toHaveBeenCalledOnce();
    expect(html).toContain('aria-label="PostHog date range"');
    expect(html).toContain('/admin/analytics?days=90"');
    expect(html).not.toContain("audience=");
    expect(html).not.toContain("Accepted-event date range");
    expect(html).not.toContain("Inspora accepted events");
  },
);
