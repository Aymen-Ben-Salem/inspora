import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { proAccounts, proCreditLedger, proPurchases } from "@/db/schema";
import { createProTestDatabase } from "./test-database";
import {
  applyPackRefund,
  applyPaidSubscriptionInvoice,
  attachPurchaseProviderIds,
  beginAutomaticCharge,
  attachSubscriptionCheckout,
  claimSubscriptionCheckout,
  clearSubscriptionCheckout,
  closeProAccount,
  completeReservation,
  configureAutoRecharge,
  createManualPurchase,
  ensureProAccount,
  failPurchase,
  grantPurchase,
  markProviderClosureComplete,
  markProviderClosureAttempt,
  markManualCheckoutClosed,
  markAutomaticPurchaseClosed,
  pendingProviderClosures,
  pendingManualCheckoutSessions,
  pendingAutomaticClosurePurchases,
  proRecoverySchemaInstalled,
  readAccess,
  recordDispute,
  recordSubscription,
  reserveCredits,
} from "./repository";

const user = "user_alice1";
const day = 86_400_000;
const t0 = new Date("2026-12-01T00:00:00Z");
const at = (days: number, ms = 0) => new Date(t0.getTime() + days * day + ms);
let db: Awaited<ReturnType<typeof createProTestDatabase>>;
let key = 0;
const op = () => `op_${String(++key).padStart(20, "0")}`;

beforeAll(async () => { db = await createProTestDatabase(); }, 60_000);
beforeEach(async () => { await db.reset(); });
afterAll(async () => { await db.close(); });

async function subscribe(options: { sub?: string; invoice?: string; start?: Date; end?: Date; userId?: string } = {}) {
  const { sub = "sub_1", invoice = "in_1", start = t0, end = at(31), userId = user } = options;
  await db.transaction(async (tx) => {
    await recordSubscription(tx, { userId, stripeSubscriptionId: sub, status: "active", priceId: "price_pro", currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: false, endedAt: null }, start);
    await applyPaidSubscriptionInvoice(tx, { userId, stripeSubscriptionId: sub, invoiceId: invoice, periodStart: start, periodEnd: end, now: start });
  });
}
const reserve = (operationKey: string, now: Date, userId = user) => db.transaction((tx) => reserveCredits(tx, { userId, operationKey, feature: "mcp_search", now }));
const complete = (operationKey: string, resultCount: number, now: Date) => db.transaction((tx) => completeReservation(tx, { userId: user, operationKey, resultCount, now }));
async function account() { return (await db.db.select().from(proAccounts).where(eq(proAccounts.userId, user)))[0]; }
async function setBalances(included: number, purchased: number) {
  // Test fixture only: express a balance through the ledger so the invariant still holds.
  await db.transaction(async (tx) => {
    const current = (await tx.select().from(proAccounts).where(eq(proAccounts.userId, user)))[0];
    for (const [bucket, target, now] of [["included", included, current.includedBalance], ["purchased", purchased, current.purchasedBalance]] as const) {
      if (target === now) continue;
      await tx.insert(proCreditLedger).values({ userId: user, bucket, kind: "adjustment", amount: target - now, balanceAfter: target, idempotencyKey: `fixture:${bucket}:${key++}` });
    }
    await tx.update(proAccounts).set({ includedBalance: included, purchasedBalance: purchased }).where(eq(proAccounts.userId, user));
  });
}
async function expectLedgerMatchesBalances() {
  const rows = await db.db.select({ bucket: proCreditLedger.bucket, total: sql<string>`sum(${proCreditLedger.amount})` }).from(proCreditLedger).where(eq(proCreditLedger.userId, user)).groupBy(proCreditLedger.bucket);
  const totals = Object.fromEntries(rows.map((r) => [r.bucket, Number(r.total)]));
  const current = await account();
  expect(totals.included ?? 0).toBe(current.includedBalance);
  expect(totals.purchased ?? 0).toBe(current.purchasedBalance);
}

describe("credit reservations", () => {
  it("grants the monthly allowance, settles a nonempty search once and replays without a second charge", async () => {
    await subscribe();
    const key1 = op();
    const first = await reserve(key1, at(1));
    expect(first).toMatchObject({ status: "reserved", balances: { included: 999, purchased: 0, available: 999 } });
    expect(await reserve(key1, at(1, 500))).toMatchObject({ status: "in_progress" });
    expect(await complete(key1, 3, at(1, 900))).toMatchObject({ state: "settled" });
    expect(await complete(key1, 3, at(1, 950))).toMatchObject({ state: "settled" });
    expect(await reserve(key1, at(1, 1000))).toMatchObject({ status: "replay_settled", balances: { available: 999 } });
    // A deliberately new identical search carries a new operation key and is charged.
    expect(await reserve(op(), at(1, 2000))).toMatchObject({ status: "reserved", balances: { available: 998 } });
    await expectLedgerMatchesBalances();
  });

  it("releases empty results and failures, and a released replay is held again", async () => {
    await subscribe();
    const empty = op();
    await reserve(empty, at(1));
    expect(await complete(empty, 0, at(1, 10))).toMatchObject({ state: "released", balances: { available: 1000 } });
    expect(await reserve(empty, at(1, 20))).toMatchObject({ status: "reserved", balances: { available: 999 } });
    expect(await complete(empty, 2, at(1, 30))).toMatchObject({ state: "settled", balances: { available: 999 } });
    await expectLedgerMatchesBalances();
  });

  it("consumes included credits before purchased credits", async () => {
    await subscribe();
    await setBalances(1, 2);
    const a = op(), b = op();
    await reserve(a, at(1));
    await reserve(b, at(1));
    const reservations = await db.db.execute(sql`select included_amount, purchased_amount from pro_credit_reservations order by created_at, included_amount desc`);
    expect((reservations as unknown as { rows: unknown[] }).rows).toEqual([{ included_amount: 1, purchased_amount: 0 }, { included_amount: 0, purchased_amount: 1 }]);
    expect(await account()).toMatchObject({ includedBalance: 0, purchasedBalance: 1 });
    await expectLedgerMatchesBalances();
  });

  it("never overspends with many concurrent clients (serialized single-connection database)", async () => {
    await subscribe();
    await setBalances(3, 0);
    const results = await Promise.all(Array.from({ length: 10 }, () => reserve(op(), at(1))));
    expect(results.filter((r) => r.status === "reserved")).toHaveLength(3);
    expect(results.filter((r) => r.status === "denied" && r.reason === "insufficient_credits")).toHaveLength(7);
    expect(await account()).toMatchObject({ includedBalance: 0, purchasedBalance: 0 });
    await expectLedgerMatchesBalances();
  });

  it("releases abandoned reservations after their expiry on the next reservation", async () => {
    await subscribe();
    await setBalances(1, 0);
    await reserve(op(), at(1));
    expect(await reserve(op(), at(1, 60_000))).toMatchObject({ status: "denied", reason: "insufficient_credits" });
    expect(await reserve(op(), at(1, 6 * 60_000))).toMatchObject({ status: "reserved" });
    await expectLedgerMatchesBalances();
  });

  it("denies accounts without verified Pro and keeps zero-credit access checks free", async () => {
    expect(await reserve(op(), at(1))).toMatchObject({ status: "denied", reason: "no_account" });
    await db.transaction((tx) => ensureProAccount(tx, user));
    expect(await reserve(op(), at(1))).toMatchObject({ status: "denied", reason: "no_active_subscription" });
    await subscribe();
    const access = await db.transaction((tx) => readAccess(tx, user, at(2)));
    expect(access).toMatchObject({ entitlement: { active: true }, balances: { available: 1000 } });
  });

  it("rechecks current entitlement before returning a settled replay", async () => {
    await subscribe();
    const k = op();
    await reserve(k, at(1));
    await complete(k, 1, at(1));
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_replay", status: "needs_response", now: at(2) }));
    expect(await reserve(k, at(3))).toMatchObject({ status: "denied", reason: "payment_review" });
    expect(await reserve(k, at(32))).toMatchObject({ status: "denied", reason: "no_active_subscription" });
    await db.transaction((tx) => closeProAccount(tx, { userId: user, now: at(33) }));
    expect(await reserve(k, at(34))).toMatchObject({ status: "denied", reason: "closed" });
    await expectLedgerMatchesBalances();
  });
});

describe("subscription Checkout claims", () => {
  it("reuses one persistent claim and refuses a second independently payable subscription", async () => {
    const first = await db.transaction((tx) => claimSubscriptionCheckout(tx, { userId: user, now: at(1) }));
    expect(first.status).toBe("claimed");
    if (first.status !== "claimed") throw new Error("Expected claim");
    await db.transaction((tx) => attachSubscriptionCheckout(tx, { userId: user, attemptId: first.attemptId, sessionId: "cs_1", now: at(1) }));
    expect(await db.transaction((tx) => claimSubscriptionCheckout(tx, { userId: user, now: at(2) }))).toMatchObject({ status: "claimed", attemptId: first.attemptId, sessionId: "cs_1" });
    expect(await db.transaction((tx) => clearSubscriptionCheckout(tx, { userId: user, attemptId: "wrong", now: at(2) }))).toBe(false);
    await db.transaction((tx) => clearSubscriptionCheckout(tx, { userId: user, attemptId: first.attemptId, now: at(2) }));
    const next = await db.transaction((tx) => claimSubscriptionCheckout(tx, { userId: user, now: at(2) }));
    expect(next.status === "claimed" && next.attemptId).not.toBe(first.attemptId);
    await subscribe();
    expect(await db.transaction((tx) => claimSubscriptionCheckout(tx, { userId: user, now: at(3) }))).toMatchObject({ status: "already_subscribed" });
  });

  it("keeps provider closure pending for an in-flight Checkout or a late subscription", async () => {
    await db.transaction((tx) => claimSubscriptionCheckout(tx, { userId: user, now: at(1) }));
    expect(await db.transaction((tx) => closeProAccount(tx, { userId: user, now: at(2) }))).toMatchObject({ providerClosurePending: true });
    await db.transaction((tx) => markProviderClosureComplete(tx, user, at(2)));
    expect(await account()).toMatchObject({ providerClosurePending: true });
    const current = await account();
    await db.transaction((tx) => clearSubscriptionCheckout(tx, { userId: user, attemptId: current.subscriptionCheckoutAttemptId!, now: at(3) }));
    await db.transaction((tx) => markProviderClosureComplete(tx, user, at(3)));
    expect(await account()).toMatchObject({ providerClosurePending: false });
    await db.transaction((tx) => recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_late", status: "active", priceId: "price_pro", currentPeriodStart: at(3), currentPeriodEnd: at(34), cancelAtPeriodEnd: false, endedAt: null }, at(3)));
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: true });
    await db.transaction((tx) => markProviderClosureComplete(tx, user, at(3)));
    expect(await account()).toMatchObject({ providerClosurePending: true });
  });
});

describe("subscription lifecycle", () => {
  it("resets included credits on each paid renewal without rollover and ignores duplicate or older invoices", async () => {
    await subscribe();
    const k = op();
    await reserve(k, at(1));
    await complete(k, 1, at(1));
    await setBalances(400, 120);
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", invoiceId: "in_2", periodStart: at(31), periodEnd: at(62), paidAt: at(31), now: at(31) }));
    expect(await account()).toMatchObject({ includedBalance: 1000, purchasedBalance: 120, includedPeriodKey: "in_2" });
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", invoiceId: "in_2", periodStart: at(31), periodEnd: at(62), now: at(32) }));
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", invoiceId: "in_1", periodStart: t0, periodEnd: at(31), now: at(33) }));
    expect(await account()).toMatchObject({ includedBalance: 1000, includedPeriodKey: "in_2" });
    await expectLedgerMatchesBalances();
  });

  it("does not restore included credits from a previous period when a reservation releases after renewal", async () => {
    await subscribe();
    const pending = op();
    await reserve(pending, at(30, 23 * 3_600_000));
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", invoiceId: "in_2", periodStart: at(31), periodEnd: at(62), now: at(31) }));
    await complete(pending, 0, at(31, 1000));
    expect(await account()).toMatchObject({ includedBalance: 1000 });
    await expectLedgerMatchesBalances();
  });

  it("pauses at the paid-through boundary after a failed renewal, preserves purchased credits and recovers on payment", async () => {
    await subscribe();
    await setBalances(10, 300);
    expect(await reserve(op(), at(32))).toMatchObject({ status: "denied", reason: "no_active_subscription" });
    expect(await account()).toMatchObject({ purchasedBalance: 300 });
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", invoiceId: "in_2", periodStart: at(31), periodEnd: at(62), now: at(34) }));
    expect(await reserve(op(), at(34))).toMatchObject({ status: "reserved", balances: { included: 999, purchased: 300 } });
  });

  it("keeps access through the paid period after cancellation and immediately ends it for an ended subscription", async () => {
    await subscribe();
    await db.transaction((tx) => recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_1", status: "active", priceId: "price_pro", currentPeriodStart: t0, currentPeriodEnd: at(31), cancelAtPeriodEnd: true, endedAt: null }, at(5)));
    expect(await reserve(op(), at(30))).toMatchObject({ status: "reserved" });
    expect(await reserve(op(), at(31, 1))).toMatchObject({ status: "denied", reason: "no_active_subscription" });
    await db.transaction((tx) => recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_1", status: "canceled", priceId: "price_pro", currentPeriodStart: t0, currentPeriodEnd: at(31), cancelAtPeriodEnd: false, endedAt: at(10) }, at(10)));
    expect(await reserve(op(), at(11))).toMatchObject({ status: "denied", reason: "no_active_subscription" });
  });

  it("pauses usage during a formal dispute and restores it when won or after a later valid payment", async () => {
    await subscribe();
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_1", status: "needs_response", now: at(2) }));
    expect(await reserve(op(), at(3))).toMatchObject({ status: "denied", reason: "payment_review" });
    expect(await account()).toMatchObject({ includedBalance: 1000 });
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_1", status: "won", now: at(4) }));
    expect(await reserve(op(), at(4))).toMatchObject({ status: "reserved" });
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_2", status: "lost", now: at(5) }));
    expect(await reserve(op(), at(6))).toMatchObject({ status: "denied", reason: "payment_review" });
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", invoiceId: "in_2", periodStart: at(31), periodEnd: at(62), paidAt: at(31), now: at(31) }));
    expect(await reserve(op(), at(31, 10))).toMatchObject({ status: "reserved" });
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_2", status: "lost", now: at(32) }));
    expect(await reserve(op(), at(32, 10))).toMatchObject({ status: "reserved" });
  });

  it("does not treat delivery of an old paid invoice as new funding after a lost dispute", async () => {
    await subscribe();
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_old", status: "lost", now: at(5) }));
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", invoiceId: "in_1", periodStart: t0, periodEnd: at(31), paidAt: t0, now: at(7) }));
    expect(await reserve(op(), at(7))).toMatchObject({ status: "denied", reason: "payment_review" });
    // A verified payment made after the loss can release the hold even if its
    // delayed invoice belongs to the same already-granted period.
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", invoiceId: "in_recovery", periodStart: t0, periodEnd: at(31), paidAt: at(8), now: at(9) }));
    expect(await reserve(op(), at(9))).toMatchObject({ status: "reserved" });
  });
});

describe("purchased credits", () => {
  it("requires active Pro for a manual pack and grants credits exactly once after verified payment", async () => {
    await db.transaction((tx) => ensureProAccount(tx, user));
    expect(await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(1) }))).toBeNull();
    await subscribe();
    const purchase = (await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(1) })))!;
    expect(await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: 595, now: at(1) }))).toMatchObject({ granted: true });
    expect(await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: 595, now: at(1) }))).toMatchObject({ granted: false });
    expect(await account()).toMatchObject({ purchasedBalance: 500 });
    await expectLedgerMatchesBalances();
  });

  it("grants nothing for a failed pack and keeps existing balance and access", async () => {
    await subscribe();
    const purchase = (await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(1) })))!;
    expect(await db.transaction((tx) => failPurchase(tx, { purchaseId: purchase.id, code: "checkout_expired", now: at(1) }))).toBe(true);
    expect(await account()).toMatchObject({ includedBalance: 1000, purchasedBalance: 0 });
    expect(await reserve(op(), at(2))).toMatchObject({ status: "reserved" });
  });

  it("reverses only unspent refunded pack credits and never claws back later", async () => {
    await subscribe();
    const purchase = (await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(1) })))!;
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: 500, now: at(1) }));
    await setBalances(0, 200);
    expect(await db.transaction((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: 500, chargedCents: 500, now: at(2) }))).toEqual({ reversed: 200 });
    await setBalances(0, 50);
    expect(await db.transaction((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: 500, chargedCents: 500, now: at(3) }))).toEqual({ reversed: 0 });
    expect(await account()).toMatchObject({ purchasedBalance: 50 });
    await expectLedgerMatchesBalances();
  });

  it("records a refund with no remaining credits and never claws back a later pack on redelivery", async () => {
    await subscribe();
    const purchase = (await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(1) })))!;
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: 500, now: at(1) }));
    await setBalances(0, 0);
    expect(await db.transaction((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: 500, chargedCents: 500, now: at(2) }))).toEqual({ reversed: 0 });
    const later = (await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(3) })))!;
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: later.id, chargedCents: 500, now: at(3) }));
    expect(await db.transaction((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: 500, chargedCents: 500, now: at(4) }))).toEqual({ reversed: 0 });
    expect(await account()).toMatchObject({ purchasedBalance: 500 });
    await expectLedgerMatchesBalances();
  });

  it("preserves refund progress across reordered payment and refund delivery", async () => {
    await subscribe();
    const purchase = (await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(1) })))!;
    await db.transaction((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: 300, chargedCents: 500, now: at(2) }));
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: 500, now: at(3) }));
    expect(await account()).toMatchObject({ purchasedBalance: 200 });
    expect(await db.transaction((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: 100, chargedCents: 500, now: at(4) }))).toEqual({ reversed: 0 });
    expect((await db.db.select().from(proPurchases).where(eq(proPurchases.id, purchase.id)))[0]).toMatchObject({ refundedAmountCents: 300, refundProcessedCredits: 300 });
    await expectLedgerMatchesBalances();
  });

  it("does not restore refunded purchased credits from unfinished search holds", async () => {
    await subscribe();
    const purchase = (await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(1) })))!;
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: 500, now: at(1) }));
    await setBalances(0, 3);
    const held = [op(), op(), op()];
    for (const k of held) await reserve(k, at(1));
    await db.transaction((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: 500, chargedCents: 500, now: at(2) }));
    for (const k of held) expect(await complete(k, 0, at(2))).toMatchObject({ state: "released" });
    expect(await account()).toMatchObject({ purchasedBalance: 0 });
    const audit = await db.db.select().from(proCreditLedger).where(eq(proCreditLedger.sourceRef, "refund_canceled_reservation"));
    expect(audit).toHaveLength(3);
    expect(audit.every((entry) => entry.purchaseId === purchase.id && entry.reservationId && entry.amount === -1)).toBe(true);
    await expectLedgerMatchesBalances();
  });

  it("purchased credits survive inactivity and become usable after reactivation", async () => {
    await subscribe();
    await setBalances(0, 40);
    expect(await reserve(op(), at(40))).toMatchObject({ status: "denied", reason: "no_active_subscription" });
    await subscribe({ sub: "sub_2", invoice: "in_9", start: at(45), end: at(76) });
    expect(await reserve(op(), at(46))).toMatchObject({ status: "reserved", balances: { included: 999, purchased: 40 } });
  });
});

describe("automatic recharge", () => {
  const enable = (capCents: number, now = at(1)) => db.transaction((tx) => configureAutoRecharge(tx, { userId: user, enabled: true, capCents, now }));
  const purchases = () => db.db.select().from(proPurchases).where(eq(proPurchases.userId, user));

  it("is off by default, enabling alone buys nothing, and it triggers only on a new search below 50 credits", async () => {
    await subscribe();
    await setBalances(49, 0);
    await reserve(op(), at(1));
    expect(await purchases()).toHaveLength(0);
    expect(await enable(1000)).toMatchObject({ ok: true });
    expect(await purchases()).toHaveLength(0);
    await setBalances(60, 0);
    await reserve(op(), at(1));
    expect(await purchases()).toHaveLength(0);
    await setBalances(49, 0);
    const result = await reserve(op(), at(1));
    expect(result).toMatchObject({ status: "reserved" });
    expect(result.status === "reserved" && result.rechargePurchaseId).toBeTruthy();
    // A second qualifying search while the first pack is pending never starts another.
    expect(await reserve(op(), at(1))).toMatchObject({ status: "reserved", rechargePurchaseId: null });
    expect(await purchases()).toHaveLength(1);
  });

  it("re-checks the tax-inclusive total against the remaining monthly cap before charging", async () => {
    await subscribe();
    await enable(1000);
    await setBalances(10, 0);
    const first = await reserve(op(), at(1));
    const firstId = first.status === "reserved" ? first.rechargePurchaseId! : "";
    expect(await db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId: firstId, grossCents: 595, now: at(1) }))).toMatchObject({ ok: true });
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: firstId, chargedCents: 595, now: at(1) }));
    await setBalances(10, 0);
    // Remaining cap 405 cents cannot fund a 595-cent pack: no purchase, visible notice.
    expect(await reserve(op(), at(2))).toMatchObject({ status: "reserved", rechargePurchaseId: null });
    expect(await account()).toMatchObject({ autoRechargeNotice: "cap_insufficient" });
    expect(await purchases()).toHaveLength(1);
  });

  it("blocks a charge whose real total exceeds the cap and records failed payments without credits", async () => {
    await subscribe();
    await enable(500);
    await setBalances(10, 0);
    const r = await reserve(op(), at(1));
    const id = r.status === "reserved" ? r.rechargePurchaseId! : "";
    expect(await db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId: id, grossCents: 595, now: at(1) }))).toMatchObject({ ok: false, reason: "cap_insufficient" });
    expect(await account()).toMatchObject({ autoRechargeNotice: "cap_insufficient", purchasedBalance: 0 });
    await enable(1000, at(2));
    const again = await reserve(op(), at(2));
    const second = again.status === "reserved" ? again.rechargePurchaseId! : "";
    expect(await db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId: second, grossCents: 500, now: at(2) }))).toMatchObject({ ok: true });
    await db.transaction((tx) => failPurchase(tx, { purchaseId: second, code: "card_declined", now: at(2) }));
    expect(await account()).toMatchObject({ autoRechargeNotice: "payment_failed", purchasedBalance: 0 });
  });

  it("starts a recharge even when the search itself is refused for zero credits", async () => {
    await subscribe();
    await enable(1000);
    await setBalances(0, 0);
    expect(await reserve(op(), at(1))).toMatchObject({ status: "denied", reason: "insufficient_credits", rechargePending: true });
    expect(await reserve(op(), at(1))).toMatchObject({ status: "denied", reason: "insufficient_credits", rechargePending: true });
    expect(await purchases()).toHaveLength(1);
  });

  it("disabling cancels a not-yet-started pack and consent does not carry to a new subscription", async () => {
    await subscribe();
    await enable(1000);
    await setBalances(10, 0);
    await reserve(op(), at(1));
    await db.transaction((tx) => configureAutoRecharge(tx, { userId: user, enabled: false, now: at(1) }));
    expect((await purchases())[0]).toMatchObject({ state: "canceled" });
    await enable(1000, at(2));
    await subscribe({ sub: "sub_2", invoice: "in_5", start: at(40), end: at(71) });
    await setBalances(10, 0);
    await reserve(op(), at(41));
    expect((await purchases()).filter((p) => p.state === "pending")).toHaveLength(0);
  });

  it("does not charge when entitlement lapses between reservation and payment", async () => {
    await subscribe();
    await enable(1000);
    await setBalances(10, 0);
    const r = await reserve(op(), at(30));
    const id = r.status === "reserved" ? r.rechargePurchaseId! : "";
    expect(await db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId: id, grossCents: 500, now: at(32) }))).toMatchObject({ ok: false, reason: "recharge_not_permitted" });
  });

  it("recovers a processing charge with its reserved total but refuses an expired idempotency window", async () => {
    await subscribe();
    await enable(1000);
    await setBalances(10, 0);
    const r = await reserve(op(), at(2));
    const id = r.status === "reserved" ? r.rechargePurchaseId! : "";
    expect(await db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId: id, grossCents: 595, now: at(2) }))).toMatchObject({ ok: true });
    expect(await db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId: id, grossCents: 595, now: at(2, 5 * 60_000) }))).toMatchObject({ ok: true });
    await expect(db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId: id, grossCents: 500, now: at(2, 10 * 60_000) }))).rejects.toThrow("reserved total");
    expect(await db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId: id, grossCents: 595, now: at(3) }))).toMatchObject({ ok: false, reason: "reconciliation_required" });
    expect((await purchases())[0]).toMatchObject({ state: "processing", failureCode: "reconciliation_required", reservedAmountCents: 595 });
  });
});

describe("permanent deletion", () => {
  it("forfeits balances with an auditable record, releases holds and refuses later grants", async () => {
    await subscribe();
    await setBalances(700, 300);
    const purchase = (await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(1) })))!;
    await reserve(op(), at(1));
    expect(await db.transaction((tx) => closeProAccount(tx, { userId: user, now: at(2) }))).toEqual({ closed: true, providerClosurePending: true });
    expect(await account()).toMatchObject({ state: "closed", includedBalance: 0, purchasedBalance: 0, autoRechargeEnabled: false });
    expect(await reserve(op(), at(2))).toMatchObject({ status: "denied", reason: "closed" });
    expect(await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: 500, now: at(3) }))).toMatchObject({ granted: false, reason: "account_closed" });
    await expectLedgerMatchesBalances();
  });

  it("retains every unpaid manual Checkout for closure beyond the display-history limit", async () => {
    await subscribe();
    await db.transaction((tx) => tx.insert(proPurchases).values(Array.from({ length: 35 }, (_, i) => ({ userId: user, kind: "manual", credits: 500, baseAmountCents: 500, stripeCheckoutSessionId: `cs_close_${i}` }))));
    await db.transaction((tx) => closeProAccount(tx, { userId: user, now: at(2) }));
    const sessions = await db.transaction((tx) => pendingManualCheckoutSessions(tx, user));
    expect(sessions).toHaveLength(35);
    await db.transaction(async (tx) => {
      await recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_1", status: "canceled", priceId: "price_pro", currentPeriodStart: t0, currentPeriodEnd: at(31), cancelAtPeriodEnd: false, endedAt: at(2) }, at(2));
      await markProviderClosureComplete(tx, user, at(2));
    });
    expect(await account()).toMatchObject({ providerClosurePending: true });
    for (const session of sessions) await db.transaction((tx) => markManualCheckoutClosed(tx, { purchaseId: session.purchaseId, now: at(2) }));
    await db.transaction((tx) => markProviderClosureComplete(tx, user, at(2)));
    expect(await db.transaction((tx) => pendingManualCheckoutSessions(tx, user))).toHaveLength(0);
    expect(await account()).toMatchObject({ providerClosurePending: false });
  });

  it("queues provider recovery for a manual Checkout ID attached after closure", async () => {
    await subscribe();
    const purchase = (await db.transaction((tx) => createManualPurchase(tx, { userId: user, now: at(1) })))!;
    await db.transaction((tx) => closeProAccount(tx, { userId: user, now: at(2) }));
    await db.transaction((tx) => attachPurchaseProviderIds(tx, purchase.id, { stripeCheckoutSessionId: "cs_late_pack" }, at(3)));
    expect(await db.transaction((tx) => pendingManualCheckoutSessions(tx, user))).toEqual([{ purchaseId: purchase.id, sessionId: "cs_late_pack" }]);
    expect(await account()).toMatchObject({ providerClosurePending: true });
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: 500, now: at(4) }));
    expect(await db.transaction((tx) => markManualCheckoutClosed(tx, { purchaseId: purchase.id, now: at(4) }))).toBe(false);
    expect((await db.db.select().from(proPurchases).where(eq(proPurchases.id, purchase.id)))[0]).toMatchObject({ state: "succeeded", failureCode: "account_closed_review", stripeCheckoutSessionId: "cs_late_pack" });
  });

  it("keeps unknown processing automatic payments pending and queues late invoice attachment", async () => {
    await subscribe();
    await db.transaction((tx) => configureAutoRecharge(tx, { userId: user, enabled: true, capCents: 1000, now: at(1) }));
    await setBalances(10, 0);
    const result = await reserve(op(), at(1));
    const purchaseId = result.status === "reserved" ? result.rechargePurchaseId! : "";
    await db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId, grossCents: 500, now: at(1) }));
    await db.transaction((tx) => closeProAccount(tx, { userId: user, now: at(2) }));
    expect(await db.transaction((tx) => pendingAutomaticClosurePurchases(tx, user))).toHaveLength(1);
    await db.transaction((tx) => markProviderClosureComplete(tx, user, at(2)));
    expect(await account()).toMatchObject({ providerClosurePending: true });
    await db.transaction((tx) => markAutomaticPurchaseClosed(tx, { purchaseId, now: at(3) }));
    expect(await db.transaction((tx) => pendingAutomaticClosurePurchases(tx, user))).toHaveLength(0);
    await db.transaction((tx) => attachPurchaseProviderIds(tx, purchaseId, { stripeInvoiceId: "in_late_auto" }, at(4)));
    expect(await db.transaction((tx) => pendingAutomaticClosurePurchases(tx, user))).toHaveLength(1);
    expect(await account()).toMatchObject({ providerClosurePending: true });
  });

  it("rotates failed provider-closure attempts so a full batch cannot starve later accounts", async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({ userId: `user_fair${String(i).padStart(3, "0")}`, state: "closed", providerClosurePending: true, updatedAt: t0 }));
    await db.db.insert(proAccounts).values(rows);
    const first = await db.transaction(pendingProviderClosures);
    expect(first).toHaveLength(25);
    expect(first.some((row) => row.userId === "user_fair025")).toBe(false);
    // Even a frozen/repeated attempt timestamp must advance each record.
    for (const row of first) await db.transaction((tx) => markProviderClosureAttempt(tx, row.userId, t0));
    expect((await db.transaction(pendingProviderClosures))[0].userId).toBe("user_fair025");
    expect(await db.transaction(proRecoverySchemaInstalled)).toBe(true);
  });
});
