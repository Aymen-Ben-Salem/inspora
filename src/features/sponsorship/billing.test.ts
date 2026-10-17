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
  it("withdraws fully refunded monthly coverage while preserving a later independently paid month", () => {
    const refunded = {...paid.invoices[0],refunded:true,netBaseAmount:0};
    expect(billingDecision({...paid,invoices:[refunded]},{periodStart:start,paidThrough:end},start+1000,price.id)).toMatchObject({state:"inactive",terminate:true,invoiceId:null});
    const next = {...paid.invoices[0],id:"in_next",periodStart:end,periodEnd:end+30*86400000};
    expect(billingDecision({...paid,invoices:[refunded,next]},{periodStart:end,paidThrough:next.periodEnd},end+1000,price.id)).toMatchObject({state:"active",paidThrough:next.periodEnd});
  });
  it.each([45000, 50000])("reconciles pinned EUR %s terms and rejects underpayments", (amount) => {
    const observation: BillingObservation = { ...paid, billingMode: "one_time", subscriptionId: null,
      price: { ...price, currency: "eur", unitAmount: amount, interval: null, intervalCount: null },
      invoices: [{ ...paid.invoices[0], currency: "eur", amountPaid: amount, periodEnd: Date.UTC(2026, 10, 10) }] };
    expect(billingDecision(observation, { paidThrough: null, periodStart: null }, start, price.id).state).toBe("active");
    observation.invoices[0].amountPaid = amount - 1;
    expect(billingDecision(observation, { paidThrough: null, periodStart: null }, start, price.id).state).toBe("pending");
  });
  it.each(["one_time", "subscription"] as const)("pauses open %s disputes, resumes wins, and ends losses", (mode) => {
    const periodEnd = Date.UTC(2026, 10, 10);
    const observation: BillingObservation = { ...paid, billingMode: mode, billingAnchor: start,
      subscriptionId: mode === "one_time" ? null : "sub_1",
      price: { ...price, currency: "eur", unitAmount: 45000, interval: mode === "one_time" ? null : "month", intervalCount: mode === "one_time" ? null : 1 },
      invoices: [{ ...paid.invoices[0], currency: "eur", amountPaid: 45000, periodEnd, disputeState: "open" }] };
    const previous = { paidThrough: periodEnd, periodStart: start };
    expect(billingDecision(observation, previous, start, price.id)).toMatchObject({ state: "recovery", terminate: false, paidThrough: periodEnd });
    observation.invoices[0].disputeState = undefined;
    expect(billingDecision(observation, previous, start, price.id).state).toBe("active");
    observation.invoices[0].disputeState = "lost";
    expect(billingDecision(observation, previous, start, price.id)).toMatchObject({ state: "inactive", terminate: true });
  });
  it("does not let an old disputed invoice revoke a later paid period", () => {
    const observation: BillingObservation = { ...paid, invoices: [
      { ...paid.invoices[0], disputeState: "lost" },
      { ...paid.invoices[0], id: "in_next", periodStart: end, periodEnd: end + 30 * 86400000 },
    ] };
    expect(billingDecision(observation, { paidThrough: end, periodStart: start }, end, price.id).state).toBe("active");
  });
  it("expires a single payment at one calendar month without renewal recovery", () => {
    const monthEnd = Date.UTC(2026, 10, 10);
    const once = { ...paid, billingMode: "one_time" as const, subscriptionId: null,
      price: { ...price, interval: null, intervalCount: null },
      invoices: [{ ...paid.invoices[0], periodEnd: monthEnd }] };
    expect(billingDecision(once, { paidThrough: null, periodStart: null }, start, price.id))
      .toMatchObject({ state: "active", paidThrough: monthEnd });
    expect(billingDecision(once, { paidThrough: monthEnd, periodStart: start }, monthEnd, price.id))
      .toMatchObject({ state: "inactive", terminate: true, recoveryDeadline: null });
  });
  it.each([
    ["usd", Date.UTC(2026, 0, 31), Date.UTC(2026, 1, 28), Date.UTC(2026, 0, 31)],
    ["eur", Date.UTC(2026, 1, 28), Date.UTC(2026, 2, 31), Date.UTC(2026, 0, 31)],
    ["eur", Date.UTC(2028, 0, 31), Date.UTC(2028, 1, 29), Date.UTC(2028, 0, 31)],
    ["usd", Date.UTC(2026, 3, 10), Date.UTC(2026, 4, 10), Date.UTC(2026, 3, 10)],
  ])("grants the Stripe calendar month in %s including short months", (currency, periodStart, periodEnd, billingAnchor) => {
    const monthly = {
      ...paid,
      billingAnchor,
      price: { ...price, currency, interval: "month", intervalCount: 1 },
      invoices: [{ ...paid.invoices[0], currency, periodStart, periodEnd }],
    };
    expect(billingDecision(monthly, { paidThrough: null, periodStart: null }, periodStart + 1000, price.id))
      .toMatchObject({ state: "active", periodStart, paidThrough: periodEnd });
  });
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
  it("rejects live, wrong-price, unsupported currencies and wrong-amount billing", () => {
    for (const change of [
      { livemode: true },
      { id: "price_other" },
      { interval: "week", intervalCount: 1 },
      { unitAmount: 49999 },
      { currency: "gbp" },
      { taxBehavior: "inclusive" },
    ]) {
      expect(() =>
        validateSponsorPrice({ ...price, ...change }, price.id, false),
      ).toThrow();
    }
  });
  it("starts only the monthly USD/EUR price and preserves retired USD terms for reconciliation", () => {
    expect(() => validateSponsorPrice(price, price.id)).toThrow();
    expect(() => validateSponsorPrice(price, price.id, false)).not.toThrow();
    const monthly = { ...price, interval: "month", intervalCount: 1,
      currencyOptions: { usd: { unitAmount: 50000, taxBehavior: "exclusive" }, eur: { unitAmount: 45000, taxBehavior: "exclusive" } } };
    expect(() => validateSponsorPrice(monthly, price.id)).not.toThrow();
    expect(() => validateSponsorPrice({ ...monthly, currencyOptions: { ...monthly.currencyOptions, eur: { unitAmount: 50000, taxBehavior: "exclusive" } } }, price.id)).toThrow();
    for (const currencyOptions of [undefined, { eur: { unitAmount: 49900, taxBehavior: "exclusive" } },
      { ...monthly.currencyOptions, gbp: { unitAmount: 50000, taxBehavior: "exclusive" } }])
      expect(() => validateSponsorPrice({ ...monthly, currencyOptions }, price.id)).toThrow();
  });
  it("rejects mixed invoice currencies and a malformed calendar-month end", () => {
    const monthly = { ...paid, billingAnchor: start, price: { ...price, interval: "month", intervalCount: 1 },
      invoices: [{ ...paid.invoices[0], periodEnd: Date.UTC(2026, 10, 10) }] };
    for (const change of [{ currency: "eur" }, { periodEnd: Date.UTC(2026, 10, 10) - 1 }])
      expect(billingDecision({ ...monthly, invoices: [{ ...monthly.invoices[0], ...change }] },
        { paidThrough: null, periodStart: null }, start, price.id).state).toBe("pending");
  });
  it("recovers a February renewal in EUR without shifting the January 31 anchor", () => {
    const february = Date.UTC(2026, 1, 28), march = Date.UTC(2026, 2, 31);
    const monthly = { ...paid, billingAnchor: Date.UTC(2026, 0, 31),
      price: { ...price, currency: "eur", interval: "month", intervalCount: 1 },
      invoices: [{ ...paid.invoices[0], currency: "eur", periodStart: february, periodEnd: march, paidAt: february + 48 * 3600000 }] };
    expect(billingDecision(monthly, { paidThrough: february, periodStart: Date.UTC(2026, 0, 31) },
      february + 48 * 3600000, price.id)).toMatchObject({ state: "active", periodStart: february, paidThrough: march });
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
