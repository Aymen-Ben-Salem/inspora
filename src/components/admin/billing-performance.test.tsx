import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), report: vi.fn(), campaigns: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/features/sponsorship/admin-billing", () => ({ readSponsorBillingAdministration: mocks.read, readAdminSponsorCampaigns: mocks.campaigns }));
vi.mock("@/components/sponsorship/admin-billing-controls", () => ({ AdminBillingControls: () => null }));
vi.mock("@/components/sponsorship/analytics-overview", () => ({ AnalyticsOverview: ({ adminAccountId }: { adminAccountId: string }) => { mocks.report(adminAccountId); return <p>Report</p>; } }));
import Page from "@/app/admin/sponsorship/page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.campaigns.mockResolvedValue([]);
  mocks.read.mockImplementation(async ({ accountId }) => ({
    selectedAccount: accountId === "missing" ? undefined : { id: accountId ?? "account-a", campaignTitle: "affectUI", state: "active", billingMode: "one_time" },
    seats: [{ slot: 1, state: "occupied", accountId: "account-a", campaignTitle: "affectUI", published: true }, { slot: 2, state: "free" }], jobs: [], exceptions: [],
    accounts: [{ id: "account-a", state: "active", paidThrough: null, cancelAtPeriodEnd: false }, { id: "account-b", state: "active", paidThrough: null, cancelAtPeriodEnd: false }],
    accountPagination: { page: 1, totalPages: 2 }, exceptionPagination: { page: 1, totalPages: 1 }, jobPagination: { page: 1, totalPages: 1 },
  }));
});
it("links to individual sponsor dashboards and shows occupied seat owners without loading reports in the directory", async () => {
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ section: "sponsors" }) }));
  expect(html).toContain("affectUI");
  expect(html).toContain("1 of 2 occupied");
  expect(html).toContain("section=overview&amp;account=account-b");
  expect(mocks.report).not.toHaveBeenCalled();
});
it.each([undefined, "account-b"])("loads just the default or selected account in Overview", async account => {
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ account }) }));
  expect(mocks.report).toHaveBeenCalledExactlyOnceWith(account ?? "account-a");
  expect(html).toContain("On this report");
  expect(html).toContain("Sponsorship sections");
});
it("keeps the campaign library and billing separate from analytics", async () => {
  renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ section: "campaigns", account: "account-b" }) }));
  expect(mocks.campaigns).toHaveBeenCalledExactlyOnceWith("account-b");
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ section: "billing" }) }));
  expect(html).toContain("Payment exceptions");
  expect(mocks.report).not.toHaveBeenCalled();
});
it("does not substitute another account when an explicit account is missing", async () => {
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ account: "missing" }) }));
  expect(html).toContain("Sponsor account unavailable.");
  expect(mocks.report).not.toHaveBeenCalled();
});
