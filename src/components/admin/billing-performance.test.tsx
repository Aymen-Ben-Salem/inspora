import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), report: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/features/sponsorship/admin-billing", () => ({ readSponsorBillingAdministration: mocks.read }));
vi.mock("@/components/sponsorship/admin-billing-controls", () => ({ AdminBillingControls: () => null }));
vi.mock("@/components/sponsorship/admin-analytics", () => ({ AdminSponsorAnalytics: ({ accountId }: { accountId: string }) => { mocks.report(accountId); return <p>Report</p>; } }));
import Page from "@/app/admin/sponsorship/page";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ seats: [], jobs: [], exceptions: [],
    accounts: [{ id: "account-a", state: "active", paidThrough: null, cancelAtPeriodEnd: false }, { id: "account-b", state: "active", paidThrough: null, cancelAtPeriodEnd: false }],
    accountPagination: { page: 1, totalPages: 2 }, exceptionPagination: { page: 1, totalPages: 1 }, jobPagination: { page: 1, totalPages: 1 },
  });
});
it("does not fan out analytics requests for every sponsor when opening billing", async () => {
  const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("View performance");
  expect(mocks.report).not.toHaveBeenCalled();
});
it("loads only the selected sponsor report", async () => {
  renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ account: "account-b" }) }));
  expect(mocks.report).toHaveBeenCalledExactlyOnceWith("account-b");
});
