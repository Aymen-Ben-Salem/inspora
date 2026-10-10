import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SponsorDashboard, type SponsorDashboardData } from "./dashboard";
const initial: SponsorDashboardData = {
  account: null,
  checkout: {
    id: "checkout",
    state: "reserved",
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
it("shows paid dates, finishing activation and former read-only billing", () => {
  const account = {
    state: "active",
    paidThrough: "2026-11-09T12:00:00Z",
    periodStart: "2026-10-10T12:00:00Z",
    recoveryDeadline: null,
    cancelAtPeriodEnd: true,
    billingAvailable: true,
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
