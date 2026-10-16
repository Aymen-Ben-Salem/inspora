import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminAnalyticsSources } from "@/components/sponsorship/admin-analytics";

vi.mock("@/analytics/posthog-repository", () => ({
  getAdminAnalytics: vi.fn(),
  getLiveVisitorAnalytics: vi.fn(),
  isPostHogAdminConfigured: () => false,
}));
vi.mock("@/components/sponsorship/admin-analytics", () => ({
  AdminAnalyticsSources: vi.fn(({ range }: { range: string }) => <p>Source range: {range}</p>),
}));

import AnalyticsPage from "./page";
beforeEach(() => vi.clearAllMocks());

it("lets accepted-event and PostHog date controls keep their independent selections", async () => {
  const html = renderToStaticMarkup(await AnalyticsPage({
    searchParams: Promise.resolve({ days: "yesterday", audience: "7d" }),
  }));
  expect(vi.mocked(AdminAnalyticsSources).mock.calls[0][0].range).toBe("7d");
  expect(html).toContain('aria-label="Accepted-event date range"');
  expect(html).toContain('aria-label="PostHog date range"');
  expect(html).toContain("/admin/analytics?days=90&amp;audience=7d");
  expect(html).toContain("/admin/analytics?days=yesterday&amp;audience=1d");
});

it.each(["yesterday", "90"])("does not substitute the PostHog %s range for accepted-event reporting", async days => {
  renderToStaticMarkup(await AnalyticsPage({ searchParams: Promise.resolve({ days }) }));
  expect(vi.mocked(AdminAnalyticsSources).mock.calls[0][0].range).toBe("30d");
});
