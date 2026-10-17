import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
import { SponsorDashboard, type SponsorDashboardData } from "./dashboard";
const initial: SponsorDashboardData = {
  ownerUserId: "owner",
  account: null,
  checkout: {
    id: "checkout",
    state: "reserved",
    billingMode: "subscription",
    paymentReceived: false,
    exceptionCode: null,
  },
  campaigns: [],
  checkoutEnabled: false,
  capacityAvailable: true,
};
it("shows waiting state and unavailable checkout without granting return-page entitlement", () => {
  const html = renderToStaticMarkup(<SponsorDashboard initial={initial} />);
  expect(html).toContain("Waiting for verified payment");
  expect(html).toContain("No public campaign yet");
  expect(html).toContain("Test checkout is not configured yet");
});
it("retains owner-scoped prepared campaigns before payment without granting paid editing", () => {
  const html = renderToStaticMarkup(<SponsorDashboard initial={{...initial, campaigns:[{id:"prepared",title:"My prepared creative",url:"https://example.com",state:"prepared"}]}} />);
  expect(html).toContain("Your prepared campaigns");
  expect(html).toContain("My prepared creative");
  expect(html).toContain("Private preparation");
  expect(html).not.toContain("/sponsor/campaigns/new");
  expect(html).not.toContain("Make public");
});
it("shows paid dates, finishing activation and former read-only billing", () => {
  const account = {
    state: "active",
    paidThrough: "2026-11-09T12:00:00Z",
    periodStart: "2026-10-10T12:00:00Z",
    recoveryDeadline: null,
    cancelAtPeriodEnd: true,
    billingAvailable: true,
    billingCurrency: "usd",
    billingMode: "subscription" as const,
    billingInterval: "day",
    billingIntervalCount: 30,
  };
  const html = renderToStaticMarkup(
    <SponsorDashboard
      initial={{
        ...initial,
        account,
        checkout: {
          ...initial.checkout!,
          paymentReceived: true,
          exceptionCode: "activation_pending",
        },
      }}
    />,
  );
  expect(html).toContain("Payment received. Finishing publication");
  expect(html).toContain("9 Nov 2026");
  expect(html).toContain("Manage billing");
  const former = renderToStaticMarkup(
    <SponsorDashboard
      initial={{ ...initial, account: { ...account, state: "inactive" } }}
    />,
  );
  expect(former).toContain("read-only");
  expect(former).not.toContain("Prepare campaign");
});
it("shows the billed EUR monthly terms while keeping original USD 30-day terms for existing accounts", () => {
  const account = {
    state: "active",
    paidThrough: "2026-11-10T12:00:00Z",
    periodStart: "2026-10-10T12:00:00Z",
    recoveryDeadline: null,
    cancelAtPeriodEnd: false,
    billingAvailable: true,
    billingCurrency: "eur",
    billingMode: "subscription" as const,
    billingInterval: "month",
    billingIntervalCount: 1,
  };
  const html = renderToStaticMarkup(
    <SponsorDashboard initial={{ ...initial, account }} />,
  );
  expect(html).toContain("EUR billing");
  expect(html).toContain("View your exact charges in Manage billing.");
  expect(html).toContain("monthly");
  expect(html.slice(html.indexOf('id="billing"'))).not.toContain("30 days");
  const legacy = renderToStaticMarkup(
    <SponsorDashboard
      initial={{
        ...initial,
        account: {
          ...account,
          billingCurrency: "usd",
          billingInterval: "day",
          billingIntervalCount: 30,
        },
      }}
    />,
  );
  expect(legacy).toContain("USD billing");
  expect(legacy).toContain("every 30 days");
});
it("disables purchase entry for a prepared owner when all four seats are held", () => {
  const html = renderToStaticMarkup(
    <SponsorDashboard
      initial={{
        ...initial,
        checkoutEnabled: true,
        capacityAvailable: false,
        checkout: { ...initial.checkout!, state: "ready" },
      }}
    />,
  );
  expect(html).toContain("All four seats are occupied or reserved");
  expect(html).toMatch(/disabled=""[^>]*>Continue to test checkout/);
});
