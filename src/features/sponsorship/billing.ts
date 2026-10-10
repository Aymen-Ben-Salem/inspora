export const SPONSOR_PERIOD_MS = 30 * 86400000;
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
  if (
    price.livemode ||
    price.id !== expectedId ||
    (requireActive && !price.active) ||
    price.currency !== "usd" ||
    price.unitAmount !== 50000 ||
    price.interval !== "day" ||
    price.intervalCount !== 30 ||
    price.taxBehavior !== "exclusive"
  )
    throw new Error(
      "A test-mode USD 500 price recurring every exact 30 days is required.",
    );
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
      i.currency === "usd" &&
      i.priceId === expectedPrice &&
      i.periodEnd - i.periodStart === SPONSOR_PERIOD_MS &&
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
