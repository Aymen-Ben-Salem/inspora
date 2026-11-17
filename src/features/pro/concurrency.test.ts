import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { cleanupJobs, creators, profileAccounts, proAccounts, proCreditLedger, proPurchases } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { createProTestDatabase } from "./test-database";
import { applyPackRefund, applyPaidSubscriptionInvoice, beginAutomaticCharge, claimSubscriptionCheckout, completeReservation, configureAutoRecharge, createManualPurchase, grantPurchase, recordSubscription, reserveCredits } from "./repository";

vi.mock("server-only", () => ({}));

/** This suite intentionally proves behavior that single-connection PGlite cannot. */
describe.skipIf(process.env.PRO_TEST_BACKEND !== "neon")("real PostgreSQL concurrency", () => {
  let db: Awaited<ReturnType<typeof createProTestDatabase>>;
  const userId = "user_neonfixture1";
  const start = new Date("2026-12-01T00:00:00Z");
  const end = new Date("2027-01-01T00:00:00Z");
  const now = new Date("2026-12-03T00:00:00Z");
  let sequence = 0;
  const operation = () => `neon_operation_${String(++sequence).padStart(12, "0")}`;
  const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };
  const reserve = (operationKey: string) => db.transaction((tx) => reserveCredits(tx, { userId, operationKey, feature: "mcp_search", now }));
  const finish = (operationKey: string, resultCount: number) => db.transaction((tx) => completeReservation(tx, { userId, operationKey, resultCount, now }));
  const account = async () => (await db.db.select().from(proAccounts).where(eq(proAccounts.userId, userId)))[0];

  async function balances(included: number, purchased = 0) {
    await db.transaction(async (tx) => {
      const current = await account();
      for (const [bucket, target, before] of [["included", included, current.includedBalance], ["purchased", purchased, current.purchasedBalance]] as const) {
        if (target !== before) await tx.insert(proCreditLedger).values({ userId, bucket, kind: "adjustment", amount: target - before, balanceAfter: target, idempotencyKey: operation() });
      }
      await tx.update(proAccounts).set({ includedBalance: included, purchasedBalance: purchased }).where(eq(proAccounts.userId, userId));
    });
  }
  async function ledgerMatches() {
    const rows = await db.db.select({ bucket: proCreditLedger.bucket, total: sql<string>`sum(${proCreditLedger.amount})` }).from(proCreditLedger).where(eq(proCreditLedger.userId, userId)).groupBy(proCreditLedger.bucket);
    const totals = Object.fromEntries(rows.map((row) => [row.bucket, Number(row.total)]));
    const current = await account();
    expect(totals.included ?? 0).toBe(current.includedBalance);
    expect(totals.purchased ?? 0).toBe(current.purchasedBalance);
  }

  beforeAll(async () => { db = await createProTestDatabase(); });
  beforeEach(async () => {
    await db.reset();
    await db.transaction(async (tx) => {
      await recordSubscription(tx, { userId, stripeSubscriptionId: "sub_neon", status: "active", priceId: "price_pro", currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: false, endedAt: null }, now);
      await applyPaidSubscriptionInvoice(tx, { userId, stripeSubscriptionId: "sub_neon", invoiceId: "in_neon", periodStart: start, periodEnd: end, paidAt: start, now });
    });
  });
  afterAll(async () => { await db?.close(); });

  it("blocks a second physical connection on the account row lock", async () => {
    if (!db.pool) throw new Error("Real PostgreSQL pool required");
    await balances(2);
    const entered = deferred(), release = deferred(), waiting = deferred();
    let ownerPid = 0, waiterPid = 0;
    const owner = db.transaction(async (tx) => {
      ownerPid = Number((await tx.execute(sql`select pg_backend_pid() as pid`) as unknown as { rows: { pid: number }[] }).rows[0].pid);
      await tx.select().from(proAccounts).where(eq(proAccounts.userId, userId)).for("update");
      entered.resolve(); await release.promise;
    });
    await entered.promise;
    const waiter = db.transaction(async (tx) => {
      waiterPid = Number((await tx.execute(sql`select pg_backend_pid() as pid`) as unknown as { rows: { pid: number }[] }).rows[0].pid);
      waiting.resolve();
      return reserveCredits(tx, { userId, operationKey: operation(), feature: "mcp_search", now });
    });
    try {
      await waiting.promise;
      expect(waiterPid).not.toBe(ownerPid);
      let blocked = false;
      for (let i = 0; i < 12 && !blocked; i++) {
        const result = await db.pool.query("select $1::int = any(pg_blocking_pids($2::int)) as blocked", [ownerPid, waiterPid]);
        blocked = result.rows[0].blocked;
      }
      expect(blocked).toBe(true);
    } finally { release.resolve(); await owner; }
    expect(await waiter).toMatchObject({ status: "reserved" });
    expect(await account()).toMatchObject({ includedBalance: 1 });
    await ledgerMatches();
  });

  it("never overspends the last three credits across ten concurrent connections", async () => {
    await balances(3);
    const results = await Promise.all(Array.from({ length: 10 }, () => reserve(operation())));
    expect(results.filter((r) => r.status === "reserved")).toHaveLength(3);
    expect(results.filter((r) => r.status === "denied" && r.reason === "insufficient_credits")).toHaveLength(7);
    expect(await account()).toMatchObject({ includedBalance: 0 });
    await ledgerMatches();
  });

  it("deduplicates reservation and completion races for the same operation", async () => {
    const key = operation();
    const results = await Promise.all(Array.from({ length: 8 }, () => reserve(key)));
    expect(results.filter((r) => r.status === "reserved")).toHaveLength(1);
    expect(results.filter((r) => r.status === "in_progress")).toHaveLength(7);
    expect((await Promise.all(Array.from({ length: 8 }, () => finish(key, 2)))).every((r) => r.state === "settled")).toBe(true);
    expect(await account()).toMatchObject({ includedBalance: 999 });
    await ledgerMatches();
  });

  it("creates one automatic pack across concurrent low-balance searches", async () => {
    await balances(20);
    await db.transaction((tx) => configureAutoRecharge(tx, { userId, enabled: true, capCents: 1000, now }));
    const results = await Promise.all(Array.from({ length: 8 }, () => reserve(operation())));
    const purchaseIds = results.flatMap((r) => r.status === "reserved" && r.rechargePurchaseId ? [r.rechargePurchaseId] : []);
    expect(purchaseIds).toHaveLength(1);
    expect(await db.db.select().from(proPurchases)).toHaveLength(1);
    expect(await db.transaction((tx) => beginAutomaticCharge(tx, { purchaseId: purchaseIds[0], grossCents: 595, now }))).toMatchObject({ ok: true });
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchaseIds[0], chargedCents: 595, paidAt: now, now }));
    await balances(20);
    const next = await reserve(operation());
    expect(next).toMatchObject({ status: "reserved", rechargePurchaseId: null });
    expect(await account()).toMatchObject({ autoRechargeNotice: "cap_insufficient" });
    await ledgerMatches();
  });

  it("does not restore an old allowance when renewal races a held-search release", async () => {
    const key = operation();
    await reserve(key);
    const renewed = new Date("2027-01-02T00:00:00Z"), nextEnd = new Date("2027-02-01T00:00:00Z");
    await Promise.all([
      db.transaction((tx) => applyPaidSubscriptionInvoice(tx, { userId, stripeSubscriptionId: "sub_neon", invoiceId: "in_neon_renewed", periodStart: end, periodEnd: nextEnd, paidAt: end, now: renewed })),
      db.transaction((tx) => completeReservation(tx, { userId, operationKey: key, resultCount: 0, now: renewed })),
    ]);
    expect(await account()).toMatchObject({ includedBalance: 1000, includedPeriodKey: "in_neon_renewed" });
    await ledgerMatches();
  });

  it("never claws back a later pack when simultaneous refund redeliveries originally reversed zero", async () => {
    const purchase = (await db.transaction((tx) => createManualPurchase(tx, { userId, now })))!;
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: 500, now }));
    await balances(0, 0);
    await Promise.all(Array.from({ length: 8 }, () => db.transaction((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: 500, chargedCents: 500, now }))));
    const later = (await db.transaction((tx) => createManualPurchase(tx, { userId, now })))!;
    await db.transaction((tx) => grantPurchase(tx, { purchaseId: later.id, chargedCents: 500, now }));
    await Promise.all(Array.from({ length: 8 }, () => db.transaction((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: 500, chargedCents: 500, now }))));
    expect(await account()).toMatchObject({ purchasedBalance: 500 });
    await ledgerMatches();
  });

  it("reuses one persistent Checkout claim across concurrent subscription requests", async () => {
    const freshUser = "user_neoncheckout1";
    const claims = await Promise.all(Array.from({ length: 8 }, () => db.transaction((tx) => claimSubscriptionCheckout(tx, { userId: freshUser, now }))));
    expect(claims.every((claim) => claim.status === "claimed")).toBe(true);
    expect(new Set(claims.map((claim) => claim.status === "claimed" && claim.attemptId)).size).toBe(1);
  });

  it("queues personal Pro deletion without creating a creator or calling Clerk", async () => {
    const { queueAccountDeletion } = await import("@/features/profiles/account-lifecycle");
    expect(await db.db.select().from(profileAccounts).where(eq(profileAccounts.userId, userId))).toHaveLength(0);
    const result = await db.transaction((tx) => queueAccountDeletion(tx as unknown as WriteTx, userId, { personalAccount: true }));
    expect(result?.state).toBe("pending");
    expect((await db.db.select().from(profileAccounts).where(eq(profileAccounts.userId, userId)))[0]).toMatchObject({ status: "deleting" });
    expect(await db.db.select().from(creators).where(eq(creators.ownerUserId, userId))).toHaveLength(0);
    expect(await account()).toMatchObject({ state: "closed", includedBalance: 0, purchasedBalance: 0 });
    expect(await db.db.select().from(cleanupJobs).where(eq(cleanupJobs.idempotencyKey, `account:${userId}`))).toHaveLength(1);
    // Remove only this test's non-Pro fixture rows, preserving every copied
    // production record. Never invoke the cleanup worker or Clerk.
    await db.db.delete(cleanupJobs).where(eq(cleanupJobs.idempotencyKey, `account:${userId}`));
    await db.db.delete(profileAccounts).where(eq(profileAccounts.userId, userId));
  });
});
