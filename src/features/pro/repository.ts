import { randomUUID } from "node:crypto";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { proAccounts, proDisputes, proSubscriptions } from "@/db/schema";
import { disputeHoldActive, evaluateEntitlement } from "./entitlement";

/** Any Drizzle Postgres transaction over the application schema (Neon at runtime, PGlite in tests). */
export type ProTx = PgDatabase<PgQueryResultHKT, typeof schema>;
type Account = typeof proAccounts.$inferSelect;

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

export async function readAccess(tx: ProTx, userId: string, now: Date) {
  const [account] = await tx.select().from(proAccounts).where(eq(proAccounts.userId, userId));
  const { entitlement } = await facts(tx, account ?? null, now);
  return { entitlement };
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

/** A verified paid invoice extends paid-through time. Out-of-order older invoices never shorten it. */
export async function applyPaidSubscriptionInvoice(
  tx: ProTx,
  input: { userId: string; stripeSubscriptionId: string; periodStart: Date; periodEnd: Date; paidAt?: Date | null; now: Date },
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
}

/** A lost dispute keeps its hold until a later valid payment is confirmed. */
async function clearResolvedPaymentReview(tx: ProTx, userId: string, paidAt: Date, now: Date) {
  await tx
    .update(proDisputes)
    .set({ holdActive: false, updatedAt: now })
    .where(and(eq(proDisputes.userId, userId), eq(proDisputes.holdActive, true), eq(proDisputes.status, "lost"), lt(proDisputes.closedAt, paidAt)));
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

async function closurePending(tx: ProTx, account: Account) {
  return Boolean(account.subscriptionCheckoutAttemptId) || (await liveSubscriptionIds(tx, account.userId)).length > 0;
}

/**
 * Confirmed permanent deletion closes the Pro account and marks the provider
 * subscription and any open Checkout for immediate cancellation. Financial
 * records are retained.
 */
export async function closeProAccount(tx: ProTx, input: { userId: string; now: Date }) {
  const { now } = input;
  const account = await lockAccount(tx, input.userId);
  if (!account) return { closed: false, providerClosurePending: false };
  const providerClosurePending = account.providerClosurePending || (await closurePending(tx, account));
  if (account.state === "closed") {
    if (providerClosurePending !== account.providerClosurePending) await tx.update(proAccounts).set({ providerClosurePending, updatedAt: now }).where(eq(proAccounts.userId, input.userId));
    return { closed: true, providerClosurePending };
  }
  await tx.update(proAccounts).set({ state: "closed", closureRequestedAt: now, providerClosurePending, updatedAt: now }).where(eq(proAccounts.userId, input.userId));
  return { closed: true, providerClosurePending };
}

export async function markProviderClosureComplete(tx: ProTx, userId: string, now: Date) {
  const account = await lockAccount(tx, userId);
  if (!account) return;
  await tx.update(proAccounts).set({ providerClosurePending: await closurePending(tx, account), updatedAt: now }).where(eq(proAccounts.userId, userId));
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
  return { account: account ?? null, entitlement, subscriptions };
}

export async function pendingProviderClosures(tx: ProTx) {
  return tx.select({ userId: proAccounts.userId, customerId: proAccounts.stripeCustomerId }).from(proAccounts).where(eq(proAccounts.providerClosurePending, true)).orderBy(asc(proAccounts.updatedAt), asc(proAccounts.userId)).limit(25);
}

/** Rotate attempted closures before provider I/O, including attempts that fail. */
export async function markProviderClosureAttempt(tx: ProTx, userId: string, now: Date) {
  await tx.update(proAccounts).set({ updatedAt: sql`greatest(${proAccounts.updatedAt} + interval '1 millisecond', ${now})` }).where(and(eq(proAccounts.userId, userId), eq(proAccounts.providerClosurePending, true)));
}

/** Private recovery must be safe before the transactional Pro migration exists. */
export async function proRecoverySchemaInstalled(tx: ProTx) {
  const result = await tx.execute(sql`select to_regclass('public.pro_accounts') is not null and to_regclass('public.pro_subscriptions') is not null and to_regclass('public.pro_disputes') is not null and to_regclass('public.pro_stripe_events') is not null as installed`);
  return (result as unknown as { rows: { installed: boolean }[] }).rows[0]?.installed === true;
}

export async function liveSubscriptionIds(tx: ProTx, userId: string) {
  const rows = await tx.select({ id: proSubscriptions.stripeSubscriptionId }).from(proSubscriptions).where(and(eq(proSubscriptions.userId, userId), sql`${proSubscriptions.endedAt} is null`, sql`${proSubscriptions.status} not in ('canceled','incomplete_expired')`));
  return rows.map((row) => row.id);
}
