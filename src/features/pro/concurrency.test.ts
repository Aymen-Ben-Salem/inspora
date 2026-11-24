import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { cleanupJobs, creators, profileAccounts, proAccounts } from "@/db/schema";
import type { WriteTx } from "@/db/write-client";
import { createProTestDatabase } from "./test-database";
import { applyPaidSubscriptionInvoice, claimSubscriptionCheckout, closeProAccount, recordSubscription } from "./repository";

vi.mock("server-only", () => ({}));

/** This suite intentionally proves behavior that single-connection PGlite cannot. */
describe.skipIf(process.env.PRO_TEST_BACKEND !== "neon")("real PostgreSQL concurrency", () => {
  let db: Awaited<ReturnType<typeof createProTestDatabase>>;
  const userId = "user_neonfixture1";
  const start = new Date("2026-12-01T00:00:00Z");
  const end = new Date("2027-01-01T00:00:00Z");
  const now = new Date("2026-12-03T00:00:00Z");
  const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };
  const account = async () => (await db.db.select().from(proAccounts).where(eq(proAccounts.userId, userId)))[0];

  beforeAll(async () => { db = await createProTestDatabase(); });
  beforeEach(async () => {
    await db.reset();
    await db.transaction(async (tx) => {
      await recordSubscription(tx, { userId, stripeSubscriptionId: "sub_neon", status: "active", priceId: "price_pro", currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: false, endedAt: null }, now);
      await applyPaidSubscriptionInvoice(tx, { userId, stripeSubscriptionId: "sub_neon", periodStart: start, periodEnd: end, paidAt: start, now });
    });
  });
  afterAll(async () => { await db?.close(); });

  it("blocks a second physical connection on the account row lock", async () => {
    if (!db.pool) throw new Error("Real PostgreSQL pool required");
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
      return closeProAccount(tx, { userId, now });
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
    expect(await waiter).toEqual({ closed: true, providerClosurePending: true });
    expect(await account()).toMatchObject({ state: "closed" });
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
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: true });
    expect(await db.db.select().from(cleanupJobs).where(eq(cleanupJobs.idempotencyKey, `account:${userId}`))).toHaveLength(1);
    // Remove only this test's non-Pro fixture rows, preserving every copied
    // production record. Never invoke the cleanup worker or Clerk.
    await db.db.delete(cleanupJobs).where(eq(cleanupJobs.idempotencyKey, `account:${userId}`));
    await db.db.delete(profileAccounts).where(eq(profileAccounts.userId, userId));
  });
});
