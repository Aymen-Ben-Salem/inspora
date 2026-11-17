import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import {
  proAccounts,
  proCreditLedger,
  proCreditReservations,
  proDisputes,
  proPurchases,
  proSubscriptions,
} from "@/db/schema";
import { PRO_FEATURE_CREDITS, PRO_PACK, PRO_PLAN, RESERVATION_TTL_MS, isAutoRechargeCap, type ProFeature } from "./config";
import {
  autoRechargeDecision,
  disputeHoldActive,
  evaluateEntitlement,
  refundReversalTarget,
  spendableBalances,
  splitCharge,
  type Entitlement,
  type InactiveReason,
  type RechargeDecision,
} from "./entitlement";

/** Any Drizzle Postgres transaction over the application schema (Neon at runtime, PGlite in tests). */
export type ProTx = PgDatabase<PgQueryResultHKT, typeof schema>;
type Account = typeof proAccounts.$inferSelect;
type Reservation = typeof proCreditReservations.$inferSelect;
type Bucket = "included" | "purchased";
type LedgerKind = (typeof proCreditLedger.$inferInsert)["kind"];

export type Balances = { included: number; purchased: number; available: number };

async function lockAccount(tx: ProTx, userId: string) {
  const [account] = await tx.select().from(proAccounts).where(eq(proAccounts.userId, userId)).for("update");
  return account ?? null;
}

export async function ensureProAccount(tx: ProTx, userId: string) {
  if (!/^user_[A-Za-z0-9]{1,100}$/.test(userId)) throw new Error("A verified account identity is required.");
  await tx.insert(proAccounts).values({ userId }).onConflictDoNothing();
  return (await lockAccount(tx, userId))!;
}

async function facts(tx: ProTx, account: Account | null, now: Date) {
  if (!account) return { entitlement: evaluateEntitlement({ account: null, subscriptions: [], paymentReviewHold: false, now }), subscriptions: [] };
  const subscriptions = await tx.select().from(proSubscriptions).where(eq(proSubscriptions.userId, account.userId));
  const [hold] = await tx
    .select({ id: proDisputes.stripeDisputeId })
    .from(proDisputes)
    .where(and(eq(proDisputes.userId, account.userId), eq(proDisputes.holdActive, true)))
    .limit(1);
  return { entitlement: evaluateEntitlement({ account, subscriptions, paymentReviewHold: Boolean(hold), now }), subscriptions };
}

async function post(
  tx: ProTx,
  account: Account,
  entries: { bucket: Bucket; kind: LedgerKind; amount: number; key: string; reservationId?: string; purchaseId?: string; sourceRef?: string }[],
) {
  const next = { included: account.includedBalance, purchased: account.purchasedBalance };
  for (const entry of entries) {
    if (entry.amount === 0) continue;
    next[entry.bucket] += entry.amount;
    if (next[entry.bucket] < 0) throw new Error("Credit balance cannot become negative.");
    await tx.insert(proCreditLedger).values({
      userId: account.userId,
      bucket: entry.bucket,
      kind: entry.kind,
      amount: entry.amount,
      balanceAfter: next[entry.bucket],
      reservationId: entry.reservationId,
      purchaseId: entry.purchaseId,
      sourceRef: entry.sourceRef,
      idempotencyKey: entry.key,
    });
  }
  account.includedBalance = next.included;
  account.purchasedBalance = next.purchased;
}

async function saveBalances(tx: ProTx, account: Account, now: Date, extra: Partial<typeof proAccounts.$inferInsert> = {}) {
  await tx
    .update(proAccounts)
    .set({ includedBalance: account.includedBalance, purchasedBalance: account.purchasedBalance, updatedAt: now, ...extra })
    .where(eq(proAccounts.userId, account.userId));
}

/** Return a reservation's held credits. Included credits from an earlier period are not restored. */
async function releaseHeld(tx: ProTx, account: Account, reservation: Reservation, now: Date, restore = true) {
  const includedCurrent =
    reservation.includedPeriodKey !== null &&
    reservation.includedPeriodKey === account.includedPeriodKey &&
    Boolean(account.includedPeriodEnd && account.includedPeriodEnd > now);
  if (restore) {
    const tag = randomUUID();
    await post(tx, account, [
      { bucket: "included", kind: "usage_release", amount: includedCurrent ? reservation.includedAmount : 0, key: `usage_release:${reservation.id}:${tag}:i`, reservationId: reservation.id },
      { bucket: "purchased", kind: "usage_release", amount: reservation.purchasedAmount, key: `usage_release:${reservation.id}:${tag}:p`, reservationId: reservation.id },
    ]);
  }
  await tx
    .update(proCreditReservations)
    .set({ state: "released", releasedAt: now, updatedAt: now })
    .where(eq(proCreditReservations.id, reservation.id));
}

async function releaseExpired(tx: ProTx, account: Account, now: Date) {
  const expired = await tx
    .select()
    .from(proCreditReservations)
    .where(and(eq(proCreditReservations.userId, account.userId), eq(proCreditReservations.state, "reserved"), lt(proCreditReservations.expiresAt, now)))
    .for("update");
  for (const reservation of expired) await releaseHeld(tx, account, reservation, now);
  return expired.length;
}

async function capSpentCents(tx: ProTx, userId: string, windowStart: Date, excludePurchaseId?: string) {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(coalesce(${proPurchases.chargedAmountCents}, ${proPurchases.reservedAmountCents})), 0)` })
    .from(proPurchases)
    .where(and(
      eq(proPurchases.userId, userId),
      eq(proPurchases.kind, "automatic"),
      eq(proPurchases.capPeriodStart, windowStart),
      inArray(proPurchases.state, ["pending", "processing", "succeeded"]),
      excludePurchaseId ? ne(proPurchases.id, excludePurchaseId) : undefined,
    ));
  return Number(row?.total ?? 0);
}

/** Tax may make the real charge exceed the base price; the last real automatic charge is the best estimate. */
async function estimatedAutomaticCharge(tx: ProTx, userId: string) {
  const [last] = await tx
    .select({ charged: proPurchases.chargedAmountCents })
    .from(proPurchases)
    .where(and(eq(proPurchases.userId, userId), eq(proPurchases.kind, "automatic"), eq(proPurchases.state, "succeeded")))
    .orderBy(desc(proPurchases.createdAt))
    .limit(1);
  return Math.max(PRO_PACK.baseAmountCents, last?.charged ?? 0);
}

async function considerAutomaticRecharge(tx: ProTx, account: Account, entitlement: Entitlement, availableBefore: number, now: Date) {
  if (!account.autoRechargeEnabled || !account.includedPeriodStart) return { decision: { start: false, reason: "not_enabled" } as RechargeDecision, purchaseId: null };
  const [open] = await tx
    .select({ id: proPurchases.id })
    .from(proPurchases)
    .where(and(eq(proPurchases.userId, account.userId), eq(proPurchases.kind, "automatic"), inArray(proPurchases.state, ["pending", "processing"])))
    .limit(1);
  const estimate = await estimatedAutomaticCharge(tx, account.userId);
  const decision = autoRechargeDecision({
    account,
    entitlement,
    availableBefore,
    openAutomaticPurchase: Boolean(open),
    capSpentCents: await capSpentCents(tx, account.userId, account.includedPeriodStart),
    estimatedChargeCents: estimate,
  });
  if (!decision.start) {
    if (decision.reason === "cap_insufficient" && account.autoRechargeNotice !== "cap_insufficient") {
      account.autoRechargeNotice = "cap_insufficient";
      await tx.update(proAccounts).set({ autoRechargeNotice: "cap_insufficient", updatedAt: now }).where(eq(proAccounts.userId, account.userId));
    }
    return { decision, purchaseId: null };
  }
  const [purchase] = await tx
    .insert(proPurchases)
    .values({
      userId: account.userId,
      kind: "automatic",
      credits: PRO_PACK.credits,
      baseAmountCents: PRO_PACK.baseAmountCents,
      reservedAmountCents: estimate,
      capPeriodStart: account.includedPeriodStart,
      createdAt: now,
    })
    .returning({ id: proPurchases.id });
  return { decision, purchaseId: purchase.id };
}

export type ReserveResult =
  | { status: "reserved"; reservationId: string; balances: Balances; rechargePurchaseId: string | null }
  | { status: "replay_settled" | "in_progress"; balances: Balances }
  | { status: "denied"; reason: InactiveReason | "insufficient_credits"; balances: Balances | null; rechargePurchaseId: string | null; rechargePending: boolean };

/**
 * Reserve credits for one fresh billable operation under the account row lock.
 * The operation key makes a replayed request return the earlier outcome rather
 * than charge twice; a deliberately new identical search carries a new key.
 */
export async function reserveCredits(tx: ProTx, input: { userId: string; operationKey: string; feature: ProFeature; now: Date }): Promise<ReserveResult> {
  const { userId, operationKey, now } = input;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(operationKey)) throw new Error("A bounded operation key is required.");
  const credits = PRO_FEATURE_CREDITS[input.feature];
  const account = await lockAccount(tx, userId);
  const { entitlement } = await facts(tx, account, now);
  if (!account) return { status: "denied", reason: "no_account", balances: null, rechargePurchaseId: null, rechargePending: false };
  const released = await releaseExpired(tx, account, now);
  const [existing] = await tx
    .select()
    .from(proCreditReservations)
    .where(and(eq(proCreditReservations.userId, userId), eq(proCreditReservations.operationKey, operationKey)))
    .for("update");
  const finish = async () => { if (released) await saveBalances(tx, account, now); return spendableBalances(account, now); };
  if (!entitlement.active) {
    return { status: "denied", reason: entitlement.reason, balances: await finish(), rechargePurchaseId: null, rechargePending: false };
  }
  if (existing?.state === "settled") return { status: "replay_settled", balances: await finish() };
  if (existing?.state === "reserved") return { status: "in_progress", balances: await finish() };
  const before = spendableBalances(account, now);
  const recharge = await considerAutomaticRecharge(tx, account, entitlement, before.available, now);
  const split = splitCharge(before, credits);
  if (!split) {
    return {
      status: "denied",
      reason: "insufficient_credits",
      balances: await finish(),
      rechargePurchaseId: recharge.purchaseId,
      rechargePending: recharge.purchaseId !== null || (!recharge.decision.start && recharge.decision.reason === "in_progress"),
    };
  }
  const values = {
    userId,
    operationKey,
    feature: input.feature,
    credits,
    includedAmount: split.included,
    purchasedAmount: split.purchased,
    includedPeriodKey: split.included ? account.includedPeriodKey : null,
    state: "reserved" as const,
    expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
    resultCount: null,
    settledAt: null,
    releasedAt: null,
    updatedAt: now,
  };
  // A released attempt that is replayed is a retry of the same operation; it is held again.
  const [reservation] = existing
    ? await tx.update(proCreditReservations).set(values).where(eq(proCreditReservations.id, existing.id)).returning()
    : await tx.insert(proCreditReservations).values(values).returning();
  const tag = randomUUID();
  await post(tx, account, [
    { bucket: "included", kind: "usage_hold", amount: -split.included, key: `usage_hold:${reservation.id}:${tag}:i`, reservationId: reservation.id },
    { bucket: "purchased", kind: "usage_hold", amount: -split.purchased, key: `usage_hold:${reservation.id}:${tag}:p`, reservationId: reservation.id },
  ]);
  await saveBalances(tx, account, now);
  return { status: "reserved", reservationId: reservation.id, balances: spendableBalances(account, now), rechargePurchaseId: recharge.purchaseId };
}

/** Settle once when the operation returned at least one work; otherwise release. */
export async function completeReservation(tx: ProTx, input: { userId: string; operationKey: string; resultCount: number; now: Date }) {
  const { userId, operationKey, now } = input;
  if (!Number.isSafeInteger(input.resultCount) || input.resultCount < 0) throw new Error("A result count is required.");
  const account = await lockAccount(tx, userId);
  if (!account) return { state: "missing" as const, balances: null };
  const [reservation] = await tx
    .select()
    .from(proCreditReservations)
    .where(and(eq(proCreditReservations.userId, userId), eq(proCreditReservations.operationKey, operationKey)))
    .for("update");
  if (!reservation) return { state: "missing" as const, balances: spendableBalances(account, now) };
  // Already settled or released (for example after expiry): never charge again.
  if (reservation.state !== "reserved") return { state: reservation.state, balances: spendableBalances(account, now) };
  if (input.resultCount > 0) {
    await tx
      .update(proCreditReservations)
      .set({ state: "settled", resultCount: input.resultCount, settledAt: now, updatedAt: now })
      .where(eq(proCreditReservations.id, reservation.id));
    return { state: "settled" as const, balances: spendableBalances(account, now) };
  }
  await releaseHeld(tx, account, reservation, now);
  await tx.update(proCreditReservations).set({ resultCount: 0 }).where(eq(proCreditReservations.id, reservation.id));
  await saveBalances(tx, account, now);
  return { state: "released" as const, balances: spendableBalances(account, now) };
}

export async function readAccess(tx: ProTx, userId: string, now: Date) {
  const [account] = await tx.select().from(proAccounts).where(eq(proAccounts.userId, userId));
  const { entitlement } = await facts(tx, account ?? null, now);
  return { entitlement, balances: account ? spendableBalances(account, now) : null };
}

export type SubscriptionSnapshot = {
  userId: string;
  stripeSubscriptionId: string;
  status: string;
  priceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
};

/** Mirror authoritative Stripe subscription state. Paid-through time is never derived from it. */
export async function recordSubscription(tx: ProTx, snapshot: SubscriptionSnapshot, now: Date) {
  const account = await ensureProAccount(tx, snapshot.userId);
  const [existing] = await tx.select().from(proSubscriptions).where(eq(proSubscriptions.stripeSubscriptionId, snapshot.stripeSubscriptionId)).for("update");
  if (existing && existing.userId !== snapshot.userId) throw new Error("Subscription ownership conflict.");
  const values = { ...snapshot, updatedAt: now };
  if (existing) await tx.update(proSubscriptions).set(values).where(eq(proSubscriptions.stripeSubscriptionId, snapshot.stripeSubscriptionId));
  else await tx.insert(proSubscriptions).values(values);
  // A Checkout opened before deletion can complete afterwards. Keep cancellation
  // work durable rather than leaving a deleted customer's late subscription live.
  if (account.state === "closed" && !snapshot.endedAt && !["canceled", "incomplete_expired"].includes(snapshot.status))
    await tx.update(proAccounts).set({ providerClosurePending: true, updatedAt: now }).where(eq(proAccounts.userId, snapshot.userId));
}

/** One persistent Checkout attempt per account, reused through network retries. */
export async function claimSubscriptionCheckout(tx: ProTx, input: { userId: string; now: Date }) {
  const account = await ensureProAccount(tx, input.userId);
  if (account.state !== "open") return { status: "closed" as const };
  const live = await liveSubscriptionIds(tx, input.userId);
  if (live.length) return { status: "already_subscribed" as const };
  if (account.subscriptionCheckoutAttemptId)
    return { status: "claimed" as const, attemptId: account.subscriptionCheckoutAttemptId, sessionId: account.stripeCheckoutSessionId, createdAt: account.subscriptionCheckoutAttemptCreatedAt! };
  const attemptId = randomUUID();
  await tx.update(proAccounts).set({ subscriptionCheckoutAttemptId: attemptId, stripeCheckoutSessionId: null, subscriptionCheckoutAttemptCreatedAt: input.now, updatedAt: input.now }).where(eq(proAccounts.userId, input.userId));
  return { status: "claimed" as const, attemptId, sessionId: null, createdAt: input.now };
}

export async function attachSubscriptionCheckout(tx: ProTx, input: { userId: string; attemptId: string; sessionId: string; now: Date }) {
  const account = await lockAccount(tx, input.userId);
  if (!account || account.subscriptionCheckoutAttemptId !== input.attemptId) return false;
  if (account.stripeCheckoutSessionId && account.stripeCheckoutSessionId !== input.sessionId) throw new Error("Subscription Checkout conflict.");
  await tx.update(proAccounts).set({ stripeCheckoutSessionId: input.sessionId, updatedAt: input.now, ...(account.state === "closed" ? { providerClosurePending: true } : {}) }).where(eq(proAccounts.userId, input.userId));
  return true;
}

/** Only clear an attempt after its provider session is confirmed resolved. */
export async function clearSubscriptionCheckout(tx: ProTx, input: { userId: string; attemptId: string; now: Date }) {
  const account = await lockAccount(tx, input.userId);
  if (!account || account.subscriptionCheckoutAttemptId !== input.attemptId) return false;
  await tx.update(proAccounts).set({ subscriptionCheckoutAttemptId: null, stripeCheckoutSessionId: null, subscriptionCheckoutAttemptCreatedAt: null, updatedAt: input.now }).where(eq(proAccounts.userId, input.userId));
  return true;
}

/** A verified paid invoice extends paid-through time and resets included credits once per period. */
export async function applyPaidSubscriptionInvoice(
  tx: ProTx,
  input: { userId: string; stripeSubscriptionId: string; invoiceId: string; periodStart: Date; periodEnd: Date; paidAt?: Date | null; now: Date },
) {
  const { userId, now } = input;
  if (!(input.periodEnd > input.periodStart)) throw new Error("A paid billing period is required.");
  const account = await lockAccount(tx, userId);
  if (!account) throw new Error("Pro account is required.");
  const [subscription] = await tx.select().from(proSubscriptions).where(eq(proSubscriptions.stripeSubscriptionId, input.stripeSubscriptionId)).for("update");
  if (!subscription || subscription.userId !== userId) throw new Error("Subscription ownership conflict.");
  if (!subscription.paidThrough || subscription.paidThrough < input.periodEnd)
    await tx.update(proSubscriptions).set({ paidThrough: input.periodEnd, updatedAt: now }).where(eq(proSubscriptions.stripeSubscriptionId, input.stripeSubscriptionId));
  if (input.paidAt) await clearResolvedPaymentReview(tx, userId, input.paidAt, now);
  // Out-of-order or duplicate older invoices never reset a newer period.
  if (account.state !== "open" || (account.includedPeriodStart && input.periodStart <= account.includedPeriodStart)) return { granted: false };
  await post(tx, account, [
    { bucket: "included", kind: "monthly_expiry", amount: -account.includedBalance, key: `monthly_expiry:${input.invoiceId}`, sourceRef: account.includedPeriodKey ?? undefined },
    { bucket: "included", kind: "monthly_grant", amount: PRO_PLAN.includedCredits, key: `monthly_grant:${input.invoiceId}`, sourceRef: input.invoiceId },
  ]);
  account.includedPeriodKey = input.invoiceId;
  await saveBalances(tx, account, now, { includedPeriodKey: input.invoiceId, includedPeriodStart: input.periodStart, includedPeriodEnd: input.periodEnd });
  return { granted: true };
}

/** A lost dispute keeps its hold until a later valid payment is confirmed. */
async function clearResolvedPaymentReview(tx: ProTx, userId: string, paidAt: Date, now: Date) {
  await tx
    .update(proDisputes)
    .set({ holdActive: false, updatedAt: now })
    .where(and(eq(proDisputes.userId, userId), eq(proDisputes.holdActive, true), eq(proDisputes.status, "lost"), lt(proDisputes.closedAt, paidAt)));
}

export async function createManualPurchase(tx: ProTx, input: { userId: string; now: Date }) {
  const account = await lockAccount(tx, input.userId);
  const { entitlement } = await facts(tx, account, input.now);
  if (!account || !entitlement.active) return null;
  const [purchase] = await tx
    .insert(proPurchases)
    .values({ userId: input.userId, kind: "manual", credits: PRO_PACK.credits, baseAmountCents: PRO_PACK.baseAmountCents, createdAt: input.now })
    .returning();
  return purchase;
}

export async function attachPurchaseProviderIds(tx: ProTx, purchaseId: string, ids: { stripeCheckoutSessionId?: string; stripeInvoiceId?: string; stripePaymentIntentId?: string }, now: Date) {
  const locked = await lockPurchase(tx, purchaseId);
  if (!locked) throw new Error("Purchase not found.");
  const { account, purchase } = locked;
  await tx.update(proPurchases).set({ ...ids, updatedAt: now }).where(eq(proPurchases.id, purchaseId));
  if (account.state === "closed" && purchase.kind === "manual" && !purchase.grantedAt && purchase.state !== "succeeded" && ids.stripeCheckoutSessionId && (purchase.stripeCheckoutSessionId !== ids.stripeCheckoutSessionId || purchase.failureCode !== "account_closed_checkout_resolved")) {
    // A pack Checkout can be created while account closure is in flight. Keep
    // its provider cleanup durable even when its ID arrives after closure.
    await tx.update(proPurchases).set({ state: "canceled", failureCode: "account_closed_checkout_pending", updatedAt: now }).where(eq(proPurchases.id, purchaseId));
    await tx.update(proAccounts).set({ providerClosurePending: true, updatedAt: now }).where(eq(proAccounts.userId, account.userId));
  }
  if (account.state === "closed" && purchase.kind === "automatic" && !purchase.grantedAt && purchase.state !== "succeeded" && ids.stripeInvoiceId && (purchase.stripeInvoiceId !== ids.stripeInvoiceId || purchase.failureCode !== "account_closed_invoice_resolved")) {
    await tx.update(proPurchases).set({ state: "processing", failureCode: "account_closed_invoice_pending", updatedAt: now }).where(eq(proPurchases.id, purchaseId));
    await tx.update(proAccounts).set({ providerClosurePending: true, updatedAt: now }).where(eq(proAccounts.userId, account.userId));
  }
}

export async function findPurchase(tx: ProTx, where: { id?: string; stripeCheckoutSessionId?: string; stripeInvoiceId?: string; stripePaymentIntentId?: string }) {
  const condition = where.id ? eq(proPurchases.id, where.id)
    : where.stripeCheckoutSessionId ? eq(proPurchases.stripeCheckoutSessionId, where.stripeCheckoutSessionId)
    : where.stripeInvoiceId ? eq(proPurchases.stripeInvoiceId, where.stripeInvoiceId)
    : where.stripePaymentIntentId ? eq(proPurchases.stripePaymentIntentId, where.stripePaymentIntentId)
    : undefined;
  if (!condition) return null;
  const [purchase] = await tx.select().from(proPurchases).where(condition);
  return purchase ?? null;
}

async function lockPurchase(tx: ProTx, purchaseId: string) {
  const [peek] = await tx.select({ userId: proPurchases.userId }).from(proPurchases).where(eq(proPurchases.id, purchaseId));
  if (!peek) return null;
  // Account lock first, matching every other writer, then the purchase row.
  const account = (await lockAccount(tx, peek.userId))!;
  const [purchase] = await tx.select().from(proPurchases).where(eq(proPurchases.id, purchaseId)).for("update");
  return { account, purchase };
}

/** Grant pack credits exactly once, only after a server-verified successful payment. */
export async function grantPurchase(tx: ProTx, input: { purchaseId: string; chargedCents: number; now: Date; paidAt?: Date | null; stripePaymentIntentId?: string | null }) {
  const { now } = input;
  if (!Number.isSafeInteger(input.chargedCents) || input.chargedCents <= 0) throw new Error("A verified charge amount is required.");
  const locked = await lockPurchase(tx, input.purchaseId);
  if (!locked) throw new Error("Purchase not found.");
  const { account, purchase } = locked;
  if (purchase.grantedAt) return { granted: false, reason: "already_granted" as const };
  const ids = input.stripePaymentIntentId ? { stripePaymentIntentId: input.stripePaymentIntentId } : {};
  if (account.state !== "open") {
    await tx.update(proPurchases).set({ state: "succeeded", chargedAmountCents: input.chargedCents, failureCode: "account_closed_review", updatedAt: now, ...ids }).where(eq(proPurchases.id, purchase.id));
    return { granted: false, reason: "account_closed" as const };
  }
  await post(tx, account, [{ bucket: "purchased", kind: "pack_grant", amount: purchase.credits, key: `pack_grant:${purchase.id}`, purchaseId: purchase.id }]);
  // Refund delivery may precede payment delivery. Never re-grant refunded value.
  const refundTarget = refundReversalTarget({ credits: purchase.credits, chargedCents: input.chargedCents, refundedCents: purchase.refundedAmountCents });
  if (refundTarget) await post(tx, account, [{ bucket: "purchased", kind: "refund_reversal", amount: -refundTarget, key: `refund_reversal:${purchase.id}:${purchase.refundedAmountCents}`, purchaseId: purchase.id }]);
  await tx.update(proPurchases).set({ state: "succeeded", chargedAmountCents: input.chargedCents, grantedAt: now, refundProcessedCredits: refundTarget, failureCode: null, updatedAt: now, ...ids }).where(eq(proPurchases.id, purchase.id));
  await saveBalances(tx, account, now, purchase.kind === "automatic" && account.autoRechargeNotice === "payment_failed" ? { autoRechargeNotice: null } : {});
  if (input.paidAt && purchase.refundedAmountCents === 0) await clearResolvedPaymentReview(tx, account.userId, input.paidAt, now);
  return { granted: true as const };
}

/** A failed or abandoned payment grants nothing and keeps existing balances and access. */
export async function failPurchase(tx: ProTx, input: { purchaseId: string; code: string; now: Date; state?: "failed" | "canceled" | "cap_blocked" }) {
  const locked = await lockPurchase(tx, input.purchaseId);
  if (!locked || !["pending", "processing"].includes(locked.purchase.state)) return false;
  const state = input.state ?? "failed";
  await tx.update(proPurchases).set({ state, failureCode: input.code.slice(0, 60), updatedAt: input.now }).where(eq(proPurchases.id, input.purchaseId));
  if (locked.purchase.kind === "automatic") {
    const notice = state === "cap_blocked" ? "cap_insufficient" : input.code === "payment_method_missing" ? "payment_method_missing" : state === "failed" ? "payment_failed" : null;
    if (notice) await tx.update(proAccounts).set({ autoRechargeNotice: notice, updatedAt: input.now }).where(eq(proAccounts.userId, locked.account.userId));
  }
  return true;
}

/**
 * Second automatic-recharge gate, after the real tax-inclusive total is known
 * and immediately before charging. Re-checks entitlement, consent and cap.
 */
export async function beginAutomaticCharge(tx: ProTx, input: { purchaseId: string; grossCents: number; now: Date }) {
  const { now } = input;
  if (!Number.isSafeInteger(input.grossCents) || input.grossCents < PRO_PACK.baseAmountCents) throw new Error("A verified pack total is required.");
  const locked = await lockPurchase(tx, input.purchaseId);
  if (!locked || locked.purchase.kind !== "automatic" || !["pending", "processing"].includes(locked.purchase.state)) return { ok: false as const, reason: "not_pending" };
  const { account, purchase } = locked;
  // Provider idempotency keys have a finite lifetime. Unknown old attempts need
  // reconciliation, never a blind second charge under an expired key.
  if (purchase.state === "processing" && now.getTime() - purchase.createdAt.getTime() >= 23 * 3_600_000) {
    await tx.update(proPurchases).set({ failureCode: "reconciliation_required", updatedAt: now }).where(eq(proPurchases.id, purchase.id));
    return { ok: false as const, reason: "reconciliation_required" };
  }
  if (purchase.state === "processing" && input.grossCents !== purchase.reservedAmountCents) throw new Error("A processing charge must retain its reserved total.");
  const { entitlement } = await facts(tx, account, now);
  const stop = async (reason: string, state: "canceled" | "cap_blocked") => {
    await failPurchase(tx, { purchaseId: purchase.id, code: reason, now, state });
    return { ok: false as const, reason };
  };
  if (!entitlement.active || !account.autoRechargeEnabled || account.autoRechargeCapCents === null || account.autoRechargeSubscriptionId !== entitlement.subscription.stripeSubscriptionId)
    return stop("recharge_not_permitted", "canceled");
  if (purchase.capPeriodStart?.getTime() !== account.includedPeriodStart?.getTime()) return stop("cap_period_changed", "canceled");
  const spent = await capSpentCents(tx, account.userId, purchase.capPeriodStart!, purchase.id);
  if (spent + input.grossCents > account.autoRechargeCapCents) return stop("cap_insufficient", "cap_blocked");
  await tx.update(proPurchases).set({ state: "processing", reservedAmountCents: input.grossCents, updatedAt: now }).where(eq(proPurchases.id, purchase.id));
  return { ok: true as const, customerId: account.stripeCustomerId, subscriptionId: entitlement.subscription.stripeSubscriptionId, userId: account.userId };
}

export async function configureAutoRecharge(tx: ProTx, input: { userId: string; enabled: boolean; capCents?: number; now: Date }) {
  const { now } = input;
  const account = await lockAccount(tx, input.userId);
  if (!account || account.state !== "open") return { ok: false as const, reason: "no_account" };
  if (!input.enabled) {
    await tx.update(proAccounts).set({ autoRechargeEnabled: false, autoRechargeNotice: null, updatedAt: now }).where(eq(proAccounts.userId, input.userId));
    // A not-yet-started automatic charge is abandoned; one already at the provider settles normally.
    await tx.update(proPurchases).set({ state: "canceled", failureCode: "recharge_disabled", updatedAt: now }).where(and(eq(proPurchases.userId, input.userId), eq(proPurchases.kind, "automatic"), eq(proPurchases.state, "pending")));
    return { ok: true as const };
  }
  if (!isAutoRechargeCap(input.capCents)) return { ok: false as const, reason: "invalid_cap" };
  const { entitlement } = await facts(tx, account, now);
  if (!entitlement.active) return { ok: false as const, reason: entitlement.reason };
  // Enabling never triggers a purchase by itself; the next qualifying search does.
  await tx
    .update(proAccounts)
    .set({ autoRechargeEnabled: true, autoRechargeCapCents: input.capCents, autoRechargeConsentedAt: now, autoRechargeSubscriptionId: entitlement.subscription.stripeSubscriptionId, autoRechargeNotice: null, updatedAt: now })
    .where(eq(proAccounts.userId, input.userId));
  return { ok: true as const };
}

export async function recordDispute(tx: ProTx, input: { userId: string; disputeId: string; status: string; now: Date }) {
  const { now } = input;
  await ensureProAccount(tx, input.userId);
  const closed = ["won", "lost", "warning_closed"].includes(input.status);
  const values = { userId: input.userId, status: input.status.slice(0, 40), holdActive: disputeHoldActive(input.status), closedAt: closed ? now : null, updatedAt: now };
  const [existing] = await tx.select().from(proDisputes).where(eq(proDisputes.stripeDisputeId, input.disputeId)).for("update");
  if (existing) {
    // A lost dispute already released by a later payment stays released.
    if (existing.status === "lost" && !existing.holdActive && input.status === "lost") return;
    await tx.update(proDisputes).set({ ...values, closedAt: closed ? existing.closedAt ?? now : null }).where(eq(proDisputes.stripeDisputeId, input.disputeId));
  } else await tx.insert(proDisputes).values({ stripeDisputeId: input.disputeId, ...values });
}

/** Reverse unspent purchased credits for a refunded pack. Spent credits are never clawed back later. */
export async function applyPackRefund(tx: ProTx, input: { purchaseId: string; refundedCents: number; chargedCents: number; now: Date }) {
  const locked = await lockPurchase(tx, input.purchaseId);
  if (!locked) return { reversed: 0 };
  const { account, purchase } = locked;
  const refundedCents = Math.max(purchase.refundedAmountCents, input.refundedCents);
  const chargedCents = purchase.chargedAmountCents ?? input.chargedCents;
  const target = refundReversalTarget({ credits: purchase.credits, chargedCents, refundedCents });
  // Persist processed coverage even for a zero reversal. Otherwise redelivery
  // after a new pack purchase would claw back unrelated, newly bought credits.
  await tx.update(proPurchases).set({ refundedAmountCents: refundedCents, chargedAmountCents: chargedCents, refundProcessedCredits: purchase.grantedAt ? Math.max(target, purchase.refundProcessedCredits) : purchase.refundProcessedCredits, updatedAt: input.now }).where(eq(proPurchases.id, purchase.id));
  if (!purchase.grantedAt) return { reversed: 0 };
  const key = `refund_reversal:${purchase.id}:${refundedCents}`;
  const newlyCovered = Math.max(0, target - purchase.refundProcessedCredits);
  const reversed = Math.min(newlyCovered, account.purchasedBalance);
  // A hold is not spent yet. Retire purchased-only holds covered by the refund
  // so a later empty/error/expiry cannot restore refunded value. Each currently
  // supported search reserves one credit, so these are whole reservations.
  let heldCoverage = newlyCovered - reversed;
  let retiredHeld = 0;
  if (heldCoverage > 0) {
    const held = await tx.select().from(proCreditReservations).where(and(eq(proCreditReservations.userId, account.userId), eq(proCreditReservations.state, "reserved"), eq(proCreditReservations.includedAmount, 0), sql`${proCreditReservations.purchasedAmount} > 0`)).orderBy(proCreditReservations.createdAt).for("update");
    for (const reservation of held) {
      if (reservation.purchasedAmount > heldCoverage) continue;
      await releaseHeld(tx, account, reservation, input.now);
      await post(tx, account, [{ bucket: "purchased", kind: "refund_reversal", amount: -reservation.purchasedAmount, key: `refund_hold_reversal:${purchase.id}:${reservation.id}:${refundedCents}`, reservationId: reservation.id, purchaseId: purchase.id, sourceRef: "refund_canceled_reservation" }]);
      heldCoverage -= reservation.purchasedAmount;
      retiredHeld += reservation.purchasedAmount;
      if (!heldCoverage) break;
    }
  }
  if (reversed > 0) {
    await post(tx, account, [{ bucket: "purchased", kind: "refund_reversal", amount: -reversed, key, purchaseId: purchase.id }]);
    await saveBalances(tx, account, input.now);
  }
  return { reversed: reversed + retiredHeld };
}

/**
 * Confirmed permanent deletion forfeits remaining credits (mandatory-law
 * remedies are handled separately), stops recharge and marks the provider
 * subscription for immediate cancellation. Financial records are retained.
 */
export async function closeProAccount(tx: ProTx, input: { userId: string; now: Date }) {
  const { now } = input;
  const account = await lockAccount(tx, input.userId);
  if (!account) return { closed: false, providerClosurePending: false };
  if (account.state === "closed") {
    const pending = account.providerClosurePending || Boolean(account.subscriptionCheckoutAttemptId) || (await liveSubscriptionIds(tx, input.userId)).length > 0 || (await pendingManualCheckoutSessions(tx, input.userId)).length > 0 || (await pendingAutomaticClosurePurchases(tx, input.userId)).length > 0;
    if (pending !== account.providerClosurePending) await tx.update(proAccounts).set({ providerClosurePending: pending, updatedAt: now }).where(eq(proAccounts.userId, input.userId));
    return { closed: true, providerClosurePending: pending };
  }
  const reserved = await tx.select().from(proCreditReservations).where(and(eq(proCreditReservations.userId, input.userId), eq(proCreditReservations.state, "reserved"))).for("update");
  for (const reservation of reserved) await releaseHeld(tx, account, reservation, now, false);
  await post(tx, account, [
    { bucket: "included", kind: "closure_forfeit", amount: -account.includedBalance, key: `closure_forfeit:${account.userId}:i` },
    { bucket: "purchased", kind: "closure_forfeit", amount: -account.purchasedBalance, key: `closure_forfeit:${account.userId}:p` },
  ]);
  await tx.update(proPurchases).set({ state: "canceled", failureCode: "account_closed", updatedAt: now }).where(and(eq(proPurchases.userId, input.userId), eq(proPurchases.state, "pending")));
  const live = await tx.select({ id: proSubscriptions.stripeSubscriptionId }).from(proSubscriptions).where(and(eq(proSubscriptions.userId, input.userId), sql`${proSubscriptions.endedAt} is null`));
  const manual = await pendingManualCheckoutSessions(tx, input.userId);
  if (manual.length) await tx.update(proPurchases).set({ state: "canceled", failureCode: "account_closed_checkout_pending", updatedAt: now }).where(inArray(proPurchases.id, manual.map((purchase) => purchase.purchaseId)));
  const providerClosurePending = live.length > 0 || Boolean(account.subscriptionCheckoutAttemptId) || manual.length > 0 || (await pendingAutomaticClosurePurchases(tx, input.userId)).length > 0;
  await saveBalances(tx, account, now, { state: "closed", autoRechargeEnabled: false, closureRequestedAt: now, providerClosurePending });
  return { closed: true, providerClosurePending };
}

export async function markProviderClosureComplete(tx: ProTx, userId: string, now: Date) {
  const account = await lockAccount(tx, userId);
  if (!account) return;
  const providerClosurePending = Boolean(account.subscriptionCheckoutAttemptId) || (await liveSubscriptionIds(tx, userId)).length > 0 || (await pendingManualCheckoutSessions(tx, userId)).length > 0 || (await pendingAutomaticClosurePurchases(tx, userId)).length > 0;
  await tx.update(proAccounts).set({ providerClosurePending, updatedAt: now }).where(eq(proAccounts.userId, userId));
}

export async function setStripeCustomer(tx: ProTx, userId: string, customerId: string, now: Date) {
  const account = await ensureProAccount(tx, userId);
  if (account.stripeCustomerId && account.stripeCustomerId !== customerId) throw new Error("Pro customer conflict.");
  if (!account.stripeCustomerId) await tx.update(proAccounts).set({ stripeCustomerId: customerId, updatedAt: now }).where(eq(proAccounts.userId, userId));
}

export async function accountByCustomer(tx: ProTx, customerId: string) {
  const [account] = await tx.select().from(proAccounts).where(eq(proAccounts.stripeCustomerId, customerId));
  return account ?? null;
}

export async function readAccountSummary(tx: ProTx, userId: string, now: Date) {
  const [account] = await tx.select().from(proAccounts).where(eq(proAccounts.userId, userId));
  const { entitlement, subscriptions } = await facts(tx, account ?? null, now);
  if (!account) return { account: null, entitlement, subscriptions, balances: null, usage: [], purchases: [], capSpentCents: 0 };
  const usage = await tx
    .select({ id: proCreditReservations.id, feature: proCreditReservations.feature, credits: proCreditReservations.credits, includedAmount: proCreditReservations.includedAmount, purchasedAmount: proCreditReservations.purchasedAmount, resultCount: proCreditReservations.resultCount, at: proCreditReservations.settledAt })
    .from(proCreditReservations)
    .where(and(eq(proCreditReservations.userId, userId), eq(proCreditReservations.state, "settled")))
    .orderBy(desc(proCreditReservations.settledAt))
    .limit(25);
  const purchases = await tx
    .select({ id: proPurchases.id, kind: proPurchases.kind, state: proPurchases.state, credits: proPurchases.credits, chargedAmountCents: proPurchases.chargedAmountCents, refundedAmountCents: proPurchases.refundedAmountCents, createdAt: proPurchases.createdAt })
    .from(proPurchases)
    .where(eq(proPurchases.userId, userId))
    .orderBy(desc(proPurchases.createdAt))
    .limit(10);
  const capSpent = account.includedPeriodStart ? await capSpentCents(tx, userId, account.includedPeriodStart) : 0;
  return { account, entitlement, subscriptions, balances: spendableBalances(account, now), usage, purchases, capSpentCents: capSpent };
}

export async function pendingProviderClosures(tx: ProTx) {
  return tx.select({ userId: proAccounts.userId, customerId: proAccounts.stripeCustomerId }).from(proAccounts).where(eq(proAccounts.providerClosurePending, true)).orderBy(asc(proAccounts.updatedAt), asc(proAccounts.userId)).limit(25);
}

/** Rotate attempted closures before provider I/O, including attempts that fail. */
export async function markProviderClosureAttempt(tx: ProTx, userId: string, now: Date) {
  await tx.update(proAccounts).set({ updatedAt: sql`greatest(${proAccounts.updatedAt} + interval '1 millisecond', ${now})` }).where(and(eq(proAccounts.userId, userId), eq(proAccounts.providerClosurePending, true)));
}

/** No display-history limit: every unresolved payable pack URL must be closed. */
export async function pendingManualCheckoutSessions(tx: ProTx, userId: string) {
  const rows = await tx.select({ purchaseId: proPurchases.id, sessionId: proPurchases.stripeCheckoutSessionId }).from(proPurchases).where(and(eq(proPurchases.userId, userId), eq(proPurchases.kind, "manual"), ne(proPurchases.state, "succeeded"), sql`${proPurchases.grantedAt} is null`, sql`${proPurchases.stripeCheckoutSessionId} is not null`, sql`coalesce(${proPurchases.failureCode}, '') <> 'account_closed_checkout_resolved'`)).orderBy(asc(proPurchases.createdAt), asc(proPurchases.id));
  return rows.map((row) => ({ purchaseId: row.purchaseId, sessionId: row.sessionId! }));
}

export async function markManualCheckoutClosed(tx: ProTx, input: { purchaseId: string; now: Date }) {
  const locked = await lockPurchase(tx, input.purchaseId);
  if (!locked || locked.account.state !== "closed" || locked.purchase.kind !== "manual" || locked.purchase.grantedAt || locked.purchase.state === "succeeded" || locked.purchase.failureCode === "account_closed_review") return false;
  await tx.update(proPurchases).set({ state: "canceled", failureCode: "account_closed_checkout_resolved", updatedAt: input.now }).where(eq(proPurchases.id, input.purchaseId));
  return true;
}

/** Unknown in-flight automatic payments keep identity deletion pending. */
export async function pendingAutomaticClosurePurchases(tx: ProTx, userId: string) {
  return tx.select().from(proPurchases).where(and(eq(proPurchases.userId, userId), eq(proPurchases.kind, "automatic"), eq(proPurchases.state, "processing"))).orderBy(asc(proPurchases.createdAt), asc(proPurchases.id));
}

export async function markAutomaticPurchaseClosed(tx: ProTx, input: { purchaseId: string; now: Date }) {
  const locked = await lockPurchase(tx, input.purchaseId);
  if (!locked || locked.account.state !== "closed" || locked.purchase.kind !== "automatic" || locked.purchase.grantedAt || locked.purchase.state === "succeeded" || locked.purchase.failureCode === "account_closed_review") return false;
  await tx.update(proPurchases).set({ state: "canceled", failureCode: "account_closed_invoice_resolved", updatedAt: input.now }).where(eq(proPurchases.id, input.purchaseId));
  return true;
}

/** Private recovery must be safe before the transactional Pro migration exists. */
export async function proRecoverySchemaInstalled(tx: ProTx) {
  const result = await tx.execute(sql`select to_regclass('public.pro_accounts') is not null and to_regclass('public.pro_subscriptions') is not null and to_regclass('public.pro_purchases') is not null and to_regclass('public.pro_credit_reservations') is not null and to_regclass('public.pro_credit_ledger') is not null and to_regclass('public.pro_disputes') is not null and to_regclass('public.pro_stripe_events') is not null as installed`);
  return (result as unknown as { rows: { installed: boolean }[] }).rows[0]?.installed === true;
}

export async function liveSubscriptionIds(tx: ProTx, userId: string) {
  const rows = await tx.select({ id: proSubscriptions.stripeSubscriptionId }).from(proSubscriptions).where(and(eq(proSubscriptions.userId, userId), sql`${proSubscriptions.endedAt} is null`, sql`${proSubscriptions.status} not in ('canceled','incomplete_expired')`));
  return rows.map((row) => row.id);
}

export async function stalePurchases(tx: ProTx, olderThan: Date) {
  return tx.select().from(proPurchases).where(and(inArray(proPurchases.state, ["pending", "processing"]), lt(proPurchases.updatedAt, olderThan))).limit(25);
}
