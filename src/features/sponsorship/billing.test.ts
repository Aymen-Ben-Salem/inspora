import { describe, expect, it } from "vitest";
import {
  billingDecision,
  validateSponsorPrice,
  type BillingObservation,
} from "./billing";

const start = Date.UTC(2026, 9, 10);
const end = start + 30 * 86400000;
const price = {
  id: "price_sponsor",
  livemode: false,
  active: true,
  currency: "usd",
  unitAmount: 50000,
  interval: "day",
  intervalCount: 30,
  taxBehavior: "exclusive",
};
const paid: BillingObservation = {
  subscriptionId: "sub_1",
  customerId: "cus_1",
  checkoutId: "checkout_1",
  livemode: false,
  price,
  status: "active",
  cancelAtPeriodEnd: false,
  invoices: [
    {
      id: "in_1",
      paid: true,
      amountPaid: 50000,
      currency: "usd",
      priceId: price.id,
      periodStart: start,
      periodEnd: end,
    },
  ],
};
describe("verified sponsor billing", () => {
  it("reconciles successive paid renewals after missed receipts without changing their anchor", () => {
    const day30 = 30 * 86400000;
    const invoices = [
      paid.invoices[0],
      {
        ...paid.invoices[0],
        id: "in_2",
        periodStart: end,
        periodEnd: end + day30,
        paidAt: end,
      },
      {
        ...paid.invoices[0],
        id: "in_3",
        periodStart: end + day30,
        periodEnd: end + 2 * day30,
        paidAt: end + day30,
      },
    ];
    expect(
      billingDecision(
        { ...paid, invoices },
        { paidThrough: end, periodStart: start },
        end + day30 + 1000,
        price.id,
      ),
    ).toMatchObject({ state: "active", paidThrough: end + 2 * day30 });
  });
  it("grants an exact paid period only from the current verified invoice", () => {
    expect(
      billingDecision(
        paid,
        { paidThrough: null, periodStart: null },
        start + 1000,
        price.id,
      ),
    ).toMatchObject({ state: "active", paidThrough: end, periodStart: start });
    expect(
      billingDecision(
        { ...paid, invoices: [] },
        { paidThrough: null, periodStart: null },
        start,
        price.id,
      ),
    ).toMatchObject({ state: "pending", paidThrough: null });
  });
  it("rejects live, wrong-price, monthly and wrong-amount billing", () => {
    for (const change of [
      { livemode: true },
      { id: "price_other" },
      { interval: "month", intervalCount: 1 },
      { unitAmount: 49999 },
      { currency: "eur" },
      { taxBehavior: "inclusive" },
    ]) {
      expect(() =>
        validateSponsorPrice({ ...price, ...change }, price.id),
      ).toThrow();
    }
  });
  it("preserves cancellation until expiry and holds failed renewal exactly 72 hours", () => {
    const previous = { paidThrough: end, periodStart: start };
    expect(
      billingDecision(
        { ...paid, cancelAtPeriodEnd: true },
        previous,
        end - 1,
        price.id,
      ).state,
    ).toBe("active");
    expect(
      billingDecision(
        { ...paid, cancelAtPeriodEnd: true },
        previous,
        end,
        price.id,
      ),
    ).toMatchObject({ state: "inactive", terminate: true });
    expect(
      billingDecision({ ...paid, status: "past_due" }, previous, end, price.id),
    ).toMatchObject({
      state: "recovery",
      recoveryDeadline: end + 72 * 3600000,
    });
    expect(
      billingDecision(
        { ...paid, status: "past_due" },
        previous,
        end + 72 * 3600000,
        price.id,
      ).terminate,
    ).toBe(true);
  });
  it("recovers the original billed period without moving the renewal date", () => {
    const renewed = {
      ...paid,
      invoices: [
        ...paid.invoices,
        {
          ...paid.invoices[0],
          id: "in_2",
          periodStart: end,
          periodEnd: end + 30 * 86400000,
        },
      ],
    };
    expect(
      billingDecision(
        renewed,
        { paidThrough: end, periodStart: start },
        end + 48 * 3600000,
        price.id,
      ),
    ).toMatchObject({
      state: "active",
      paidThrough: end + 30 * 86400000,
      periodStart: end,
    });
    // Reading an older invoice after a renewal must never rewind entitlement.
    expect(
      billingDecision(
        paid,
        { paidThrough: end + 30 * 86400000, periodStart: end },
        end + 48 * 3600000,
        price.id,
      ).paidThrough,
    ).toBe(end + 30 * 86400000);
  });
  it("never grants an unpaid, discounted, future or malformed invoice period", () => {
    for (const change of [
      { paid: false },
      { amountPaid: 49999 },
      { currency: "eur" },
      { priceId: "price_foreign" },
      { periodEnd: end - 1 },
      { periodStart: end, periodEnd: end + 30 * 86400000 },
    ]) {
      expect(
        billingDecision(
          { ...paid, invoices: [{ ...paid.invoices[0], ...change }] },
          { paidThrough: null, periodStart: null },
          start,
          price.id,
        ).state,
      ).toBe("pending");
    }
  });
  it("does not recover a renewal paid after the 72-hour recovery window", () => {
    const late = {
      ...paid.invoices[0],
      id: "in_late",
      periodStart: end,
      periodEnd: end + 30 * 86400000,
      paidAt: end + 73 * 3600000,
    };
    expect(
      billingDecision(
        { ...paid, invoices: [late] },
        { paidThrough: end, periodStart: start },
        end + 73 * 3600000,
        price.id,
      ),
    ).toMatchObject({ state: "inactive", terminate: true, paidThrough: end });
  });
});
