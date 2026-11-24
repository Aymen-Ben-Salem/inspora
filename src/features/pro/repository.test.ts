import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { proAccounts, proSubscriptions } from "@/db/schema";
import { createProTestDatabase } from "./test-database";
import {
  applyPaidSubscriptionInvoice,
  attachSubscriptionCheckout,
  claimSubscriptionCheckout,
  clearSubscriptionCheckout,
  closeProAccount,
  markProviderClosureComplete,
  markProviderClosureAttempt,
  pendingProviderClosures,
  proRecoverySchemaInstalled,
  readAccess,
  recordDispute,
  recordSubscription,
} from "./repository";

const user = "user_alice1";
const day = 86_400_000;
const t0 = new Date("2026-12-01T00:00:00Z");
const at = (days: number, ms = 0) => new Date(t0.getTime() + days * day + ms);
let db: Awaited<ReturnType<typeof createProTestDatabase>>;

beforeAll(async () => { db = await createProTestDatabase(); }, 60_000);
beforeEach(async () => { await db.reset(); });
afterAll(async () => { await db.close(); });

async function subscribe(options: { sub?: string; start?: Date; end?: Date; userId?: string } = {}) {
  const { sub = "sub_1", start = t0, end = at(31), userId = user } = options;
  await db.transaction(async (tx) => {
    await recordSubscription(tx, { userId, stripeSubscriptionId: sub, status: "active", priceId: "price_pro", currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: false, endedAt: null }, start);
    await applyPaidSubscriptionInvoice(tx, { userId, stripeSubscriptionId: sub, periodStart: start, periodEnd: end, now: start });
  });
}
const access = async (now: Date, userId = user) => (await db.transaction((tx) => readAccess(tx, userId, now))).entitlement;
async function account() { return (await db.db.select().from(proAccounts).where(eq(proAccounts.userId, user)))[0]; }
async function paidThrough(sub = "sub_1") { return (await db.db.select().from(proSubscriptions).where(eq(proSubscriptions.stripeSubscriptionId, sub)))[0].paidThrough; }

describe("entitlement", () => {
  it("denies accounts without verified Pro and admits a paid subscription", async () => {
    expect(await access(at(1))).toMatchObject({ active: false, reason: "no_account" });
    await db.transaction((tx) => recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_1", status: "active", priceId: "price_pro", currentPeriodStart: t0, currentPeriodEnd: at(31), cancelAtPeriodEnd: false, endedAt: null }, t0));
    // Stripe's own period is not payment: no access until a verified paid invoice.
    expect(await access(at(1))).toMatchObject({ active: false, reason: "no_active_subscription" });
    await subscribe();
    expect(await access(at(1))).toMatchObject({ active: true, paidThrough: at(31) });
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
  it("extends paid-through time on each paid renewal and ignores duplicate or older invoices", async () => {
    await subscribe();
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", periodStart: at(31), periodEnd: at(62), paidAt: at(31), now: at(31) }));
    expect(await paidThrough()).toEqual(at(62));
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", periodStart: at(31), periodEnd: at(62), now: at(32) }));
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", periodStart: t0, periodEnd: at(31), now: at(33) }));
    expect(await paidThrough()).toEqual(at(62));
  });

  it("pauses at the paid-through boundary after a failed renewal and recovers on payment", async () => {
    await subscribe();
    expect(await access(at(32))).toMatchObject({ active: false, reason: "no_active_subscription" });
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", periodStart: at(31), periodEnd: at(62), now: at(34) }));
    expect(await access(at(34))).toMatchObject({ active: true });
  });

  it("keeps access through the paid period after cancellation and immediately ends it for an ended subscription", async () => {
    await subscribe();
    await db.transaction((tx) => recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_1", status: "active", priceId: "price_pro", currentPeriodStart: t0, currentPeriodEnd: at(31), cancelAtPeriodEnd: true, endedAt: null }, at(5)));
    expect(await access(at(30))).toMatchObject({ active: true });
    expect(await access(at(31, 1))).toMatchObject({ active: false, reason: "no_active_subscription" });
    await db.transaction((tx) => recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_1", status: "canceled", priceId: "price_pro", currentPeriodStart: t0, currentPeriodEnd: at(31), cancelAtPeriodEnd: false, endedAt: at(10) }, at(10)));
    expect(await access(at(11))).toMatchObject({ active: false, reason: "no_active_subscription" });
  });

  it("pauses usage during a formal dispute and restores it when won or after a later valid payment", async () => {
    await subscribe();
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_1", status: "needs_response", now: at(2) }));
    expect(await access(at(3))).toMatchObject({ active: false, reason: "payment_review" });
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_1", status: "won", now: at(4) }));
    expect(await access(at(4))).toMatchObject({ active: true });
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_2", status: "lost", now: at(5) }));
    expect(await access(at(6))).toMatchObject({ active: false, reason: "payment_review" });
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", periodStart: at(31), periodEnd: at(62), paidAt: at(31), now: at(31) }));
    expect(await access(at(31, 10))).toMatchObject({ active: true });
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_2", status: "lost", now: at(32) }));
    expect(await access(at(32, 10))).toMatchObject({ active: true });
  });

  it("does not treat delivery of an old paid invoice as new funding after a lost dispute", async () => {
    await subscribe();
    await db.transaction((tx) => recordDispute(tx, { userId: user, disputeId: "dp_old", status: "lost", now: at(5) }));
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", periodStart: t0, periodEnd: at(31), paidAt: t0, now: at(7) }));
    expect(await access(at(7))).toMatchObject({ active: false, reason: "payment_review" });
    // A verified payment made after the loss releases the hold even if its
    // delayed invoice belongs to the same already-paid period.
    await db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", periodStart: t0, periodEnd: at(31), paidAt: at(8), now: at(9) }));
    expect(await access(at(9))).toMatchObject({ active: true });
  });
});

describe("permanent deletion", () => {
  it("closes the account, queues provider cancellation and ends access", async () => {
    await subscribe();
    expect(await db.transaction((tx) => closeProAccount(tx, { userId: user, now: at(2) }))).toEqual({ closed: true, providerClosurePending: true });
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: true, closureRequestedAt: at(2) });
    expect(await access(at(2))).toMatchObject({ active: false, reason: "closed" });
    expect(await db.transaction((tx) => claimSubscriptionCheckout(tx, { userId: user, now: at(3) }))).toEqual({ status: "closed" });
    await db.transaction(async (tx) => {
      await recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_1", status: "canceled", priceId: "price_pro", currentPeriodStart: t0, currentPeriodEnd: at(31), cancelAtPeriodEnd: false, endedAt: at(2) }, at(2));
      await markProviderClosureComplete(tx, user, at(2));
    });
    expect(await account()).toMatchObject({ providerClosurePending: false });
    expect(await db.transaction((tx) => closeProAccount(tx, { userId: user, now: at(4) }))).toEqual({ closed: true, providerClosurePending: false });
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
