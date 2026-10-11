import { calendarMonthEnd, type SponsorBillingMode } from "./purchase-mode";
export const SPONSOR_RECOVERY_MS = 72 * 3600000;
export type SponsorPrice = {
  id: string;
  livemode: boolean;
  active: boolean;
  currency: string;
  unitAmount: number | null;
  interval: string | null;
  intervalCount: number | null;
  taxBehavior: string;
  currencyOptions?: Record<string, { unitAmount: number | null; taxBehavior: string }>;
};
export type PaidInvoice = {
  id: string;
  paid: boolean;
  amountPaid: number;
  currency: string;
  priceId: string;
  periodStart: number;
  periodEnd: number;
  paidAt?: number;
  refunded?: boolean;
  /** Verified fee remaining after refunds, excluding tax; null means the split is unknown. */
  netBaseAmount?: number | null;
};
export type BillingObservation = {
  subscriptionId: string | null;
  billingMode?: SponsorBillingMode;
  customerId: string;
  checkoutId: string;
  livemode: boolean;
  price: SponsorPrice;
  status: string;
  cancelAtPeriodEnd: boolean;
  invoices: PaidInvoice[];
  billingAnchor?: number;
};
export type BillingDecision = {
  state: "active" | "recovery" | "inactive" | "pending";
  paidThrough: number | null;
  periodStart: number | null;
  recoveryDeadline: number | null;
  invoiceId: string | null;
  terminate: boolean;
};

export function validateSponsorPrice(
  price: SponsorPrice,
  expectedId: string,
  requireActive = true,
  billingMode: SponsorBillingMode = "subscription",
) {
  const monthly = price.interval === "month" && price.intervalCount === 1;
  const once = price.interval === null && price.intervalCount === null;
  // Existing pinned USD subscriptions keep their original terms. This path
  // cannot start a new checkout with the retired 30-day price.
  const legacy = !requireActive && price.currency === "usd" &&
    price.interval === "day" && price.intervalCount === 30;
  if (
    price.livemode ||
    price.id !== expectedId ||
    (requireActive && !price.active) ||
    !["usd", "eur"].includes(price.currency) ||
    price.unitAmount !== 50000 ||
    (billingMode === "one_time" ? !once : (!monthly && !legacy)) ||
    (requireActive && (price.currency !== "usd" ||
      !price.currencyOptions || Object.keys(price.currencyOptions).length !== 2 ||
      ["usd", "eur"].some(currency => price.currencyOptions?.[currency]?.unitAmount !== 50000 ||
        price.currencyOptions?.[currency]?.taxBehavior !== "exclusive"))) ||
    price.taxBehavior !== "exclusive"
  )
    throw new Error(
      "A test-mode USD 500 or EUR 500 price with matching payment terms is required.",
    );
}
function validPaidPeriod(invoice: PaidInvoice, observation: BillingObservation) {
  if (observation.billingMode === "one_time")
    return invoice.periodEnd === calendarMonthEnd(invoice.periodStart);
  if (observation.price.interval === "day")
    return invoice.periodEnd - invoice.periodStart === 30 * 86400000;
  if (!Number.isFinite(observation.billingAnchor)) return false;
  const anchor = new Date(observation.billingAnchor!), start = new Date(invoice.periodStart);
  const anchored = (month: number) => {
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), month + 1, 0)).getUTCDate();
    return Date.UTC(start.getUTCFullYear(), month, Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds());
  };
  return invoice.periodStart === anchored(start.getUTCMonth()) &&
    invoice.periodEnd === anchored(start.getUTCMonth() + 1);
}
// Current provider reads determine entitlement. Event timestamps never advance it.
export function billingDecision(
  observation: BillingObservation,
  previous: { paidThrough: number | null; periodStart: number | null },
  now: number,
  expectedPrice: string,
): BillingDecision {
  validateSponsorPrice(observation.price, expectedPrice, false, observation.billingMode);
  if (observation.livemode)
    throw new Error("Live billing is unavailable in preview.");
  const valid = observation.invoices.filter(
    (i) =>
      i.paid &&
      i.amountPaid >= 50000 &&
      i.currency === observation.price.currency &&
      i.priceId === expectedPrice &&
      validPaidPeriod(i, observation) &&
      i.periodStart <= now,
  );
  if (observation.billingMode === "one_time") {
    if (observation.subscriptionId || valid.length > 1) throw new Error("Unexpected single-payment billing.");
    const invoice = valid[0];
    const refunded = observation.invoices.find(i => i.refunded && i.priceId === expectedPrice &&
      i.currency === observation.price.currency && validPaidPeriod(i, observation));
    if (refunded) return { state: "inactive", paidThrough: previous.paidThrough ?? refunded.periodEnd,
      periodStart: previous.periodStart ?? refunded.periodStart, invoiceId: null, recoveryDeadline: null, terminate: true };
    if (invoice && previous.paidThrough && (invoice.periodEnd !== previous.paidThrough || invoice.periodStart !== previous.periodStart))
      throw new Error("A single payment cannot change its paid period.");
    const paidThrough = invoice?.periodEnd ?? previous.paidThrough;
    return { state: !paidThrough ? "pending" : paidThrough > now ? "active" : "inactive",
      paidThrough, periodStart: invoice?.periodStart ?? previous.periodStart,
      invoiceId: invoice?.id ?? null, recoveryDeadline: null, terminate: Boolean(paidThrough && paidThrough <= now) };
  }
  let paidThrough = previous.paidThrough,
    periodStart = previous.periodStart,
    invoiceId: string | null = null;
  for (const invoice of valid.sort((a, b) => a.periodStart - b.periodStart)) {
    if (paidThrough && invoice.periodEnd < paidThrough) continue;
    if (paidThrough && invoice.periodEnd === paidThrough) {
      invoiceId = invoice.id;
      continue;
    }
    if (
      paidThrough &&
      (invoice.periodStart !== paidThrough ||
        (invoice.paidAt ?? invoice.periodStart) >
          paidThrough + SPONSOR_RECOVERY_MS)
    )
      continue;
    paidThrough = invoice.periodEnd;
    periodStart = invoice.periodStart;
    invoiceId = invoice.id;
  }
  const base = {
    paidThrough,
    periodStart,
    invoiceId,
    recoveryDeadline: null,
    terminate: false,
  };
  if (paidThrough && paidThrough > now) return { ...base, state: "active" };
  if (!paidThrough) return { ...base, state: "pending" };
  if (
    observation.cancelAtPeriodEnd ||
    ["canceled", "unpaid", "incomplete_expired"].includes(observation.status)
  )
    return { ...base, state: "inactive", terminate: true };
  const recoveryDeadline = paidThrough + SPONSOR_RECOVERY_MS;
  return now < recoveryDeadline
    ? { ...base, state: "recovery", recoveryDeadline }
    : { ...base, state: "inactive", recoveryDeadline, terminate: true };
}
