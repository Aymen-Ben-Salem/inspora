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
};
export type BillingObservation = {
  subscriptionId: string;
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
) {
  const monthly = price.interval === "month" && price.intervalCount === 1;
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
    (!monthly && !legacy) ||
    (requireActive && (price.currency !== "usd" ||
      !price.currencyOptions || Object.keys(price.currencyOptions).length !== 2 ||
      ["usd", "eur"].some(currency => price.currencyOptions?.[currency]?.unitAmount !== 50000 ||
        price.currencyOptions?.[currency]?.taxBehavior !== "exclusive"))) ||
    price.taxBehavior !== "exclusive"
  )
    throw new Error(
      "A test-mode USD 500 or EUR 500 monthly price is required.",
    );
}
function validPaidPeriod(invoice: PaidInvoice, observation: BillingObservation) {
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
  validateSponsorPrice(observation.price, expectedPrice, false);
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
