import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { createProTestDatabase } from "./test-database";
import { closeProAccountForDeletion, createProIdentityDeletionGuard, proAccountBlocksAdminDeletion, readProDeletionWarning, readProIdentityClosure } from "./deletion";
import { applyPaidSubscriptionInvoice, proRecoverySchemaInstalled, recordSubscription, type ProTx } from "./repository";

vi.mock("server-only", () => ({}));
const user = "user_dave1";
const start = new Date("2027-05-01T00:00:00Z"), end = new Date("2027-06-01T00:00:00Z"), now = new Date("2027-05-10T00:00:00Z");
let db: Awaited<ReturnType<typeof createProTestDatabase>>;
beforeAll(async () => { db = await createProTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.reset(); });

it("is a no-op before the Pro migration is applied", async () => {
  const bare = new PGlite();
  const tx = drizzle(bare, { schema }) as unknown as ProTx;
  expect(await closeProAccountForDeletion(tx, user, now)).toBe(false);
  expect(await proAccountBlocksAdminDeletion(tx, user)).toBe(false);
  expect(await readProIdentityClosure(tx, user)).toBeNull();
  expect(await proRecoverySchemaInstalled(tx)).toBe(false);
  await bare.close();
}, 60_000);

it("blocks admin-initiated removal while a Pro subscription exists and closes on the owner's confirmed deletion", async () => {
  expect(await db.transaction((tx) => proAccountBlocksAdminDeletion(tx, user))).toBe(false);
  await db.transaction(async (tx) => {
    await recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_1", status: "active", priceId: "price_pro", currentPeriodStart: start, currentPeriodEnd: end, cancelAtPeriodEnd: false, endedAt: null }, start);
    await applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", periodStart: start, periodEnd: end, now: start });
  });
  expect(await db.transaction((tx) => proAccountBlocksAdminDeletion(tx, user))).toBe(true);
  expect(await db.transaction((tx) => readProDeletionWarning(tx, user))).toEqual({ subscribed: true });
  expect(await db.transaction((tx) => closeProAccountForDeletion(tx, user, now))).toBe(true);
  expect(await db.transaction((tx) => proAccountBlocksAdminDeletion(tx, user))).toBe(false);
  expect(await db.transaction((tx) => readProDeletionWarning(tx, user))).toBeNull();
  expect(await db.transaction((tx) => readProIdentityClosure(tx, user))).toEqual({ state: "closed", providerClosurePending: true });
});

it("does not require provider setup for a missing Pro account or a completed closure", async () => {
  const close = vi.fn();
  const missing = createProIdentityDeletionGuard({ read: vi.fn().mockResolvedValue(null), close });
  await expect(missing(user)).resolves.toBeUndefined();
  const closed = createProIdentityDeletionGuard({ read: vi.fn().mockResolvedValue({ state: "closed", providerClosurePending: false }), close });
  await expect(closed(user)).resolves.toBeUndefined();
  expect(close).not.toHaveBeenCalled();
});

it("retries provider closure and verifies the durable pending flag before identity removal", async () => {
  const read = vi.fn().mockResolvedValueOnce({ state: "closed", providerClosurePending: true }).mockResolvedValueOnce({ state: "closed", providerClosurePending: false });
  const close = vi.fn().mockResolvedValue(undefined);
  await expect(createProIdentityDeletionGuard({ read, close })(user)).resolves.toBeUndefined();
  expect(close).toHaveBeenCalledWith(user);
  expect(read).toHaveBeenCalledTimes(2);
});

it("refuses identity removal when cancellation throws or durable recovery remains pending", async () => {
  const failure = new Error("Stripe unavailable");
  await expect(createProIdentityDeletionGuard({ read: vi.fn().mockResolvedValue({ state: "closed", providerClosurePending: true }), close: vi.fn().mockRejectedValue(failure) })(user)).rejects.toThrow("Stripe unavailable");
  const read = vi.fn().mockResolvedValue({ state: "closed", providerClosurePending: true });
  await expect(createProIdentityDeletionGuard({ read, close: vi.fn().mockResolvedValue(undefined) })(user)).rejects.toThrow("cancellation is pending");
});
