import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { proAccounts } from "@/db/schema";
import { createProTestDatabase } from "./test-database";
import { createFakeProvider } from "./fake-provider";
import { ProBillingError, createProService } from "./service";

const user = "user_bob1";
const day = 86_400_000;
const t0 = new Date("2027-01-01T00:00:00Z");
const period = (n: number) => ({ start: new Date(t0.getTime() + n * 31 * day), end: new Date(t0.getTime() + (n + 1) * 31 * day) });
let db: Awaited<ReturnType<typeof createProTestDatabase>>;
let fake: ReturnType<typeof createFakeProvider>;
let clock: Date;
let service: ReturnType<typeof createProService>;

beforeAll(async () => { db = await createProTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.reset();
  fake = createFakeProvider();
  clock = new Date(t0.getTime() + day);
  service = createProService({ withTx: db.transaction, provider: () => fake.provider, now: () => clock, siteOrigin: () => "https://preview.test" });
});

async function subscribed() {
  const session = await service.startSubscription(user);
  const { subscriptionId, invoiceId } = fake.completeSubscription(session.id, period(0));
  return { session, subscriptionId, invoiceId };
}
const account = async () => (await db.db.select().from(proAccounts).where(eq(proAccounts.userId, user)))[0];

describe("payment events", () => {
  it("prepares the personal identity before creating or reusing a payable Checkout", async () => {
    const prepared: string[] = [];
    const create = fake.provider.subscriptionCheckout;
    fake.provider.subscriptionCheckout = async (input) => {
      expect(prepared).toEqual([user]);
      return create(input);
    };
    const guarded = createProService({ withTx: db.transaction, provider: () => fake.provider, now: () => clock, siteOrigin: () => "https://preview.test", prepareIdentity: async (userId) => { prepared.push(userId); } });
    const first = await guarded.startSubscription(user);
    expect(await guarded.startSubscription(user)).toEqual(first);
    expect(prepared).toEqual([user, user]);
    // This personal user has no creator/profile fixture or dependency.
  });

  it("does not create a Stripe customer or Checkout when the identity safeguard fails", async () => {
    const prepareIdentity = vi.fn(async () => { throw new Error("Identity safeguard unavailable"); });
    const guarded = createProService({ withTx: db.transaction, provider: () => fake.provider, now: () => clock, siteOrigin: () => "https://preview.test", prepareIdentity });
    await expect(guarded.startSubscription(user)).rejects.toThrow("Identity safeguard unavailable");
    expect(prepareIdentity).toHaveBeenCalledWith(user);
    expect(fake.state.calls).not.toContain("ensureCustomer");
    expect(fake.state.customers.size).toBe(0);
    expect(fake.state.checkouts.size).toBe(0);
    expect((await account()).stripeCustomerId).toBeNull();
  });

  it("reuses one payable subscription checkout across concurrent starts and retries", async () => {
    const sessions = await Promise.all([service.startSubscription(user), service.startSubscription(user)]);
    expect(sessions[0]).toEqual(sessions[1]);
    expect(fake.state.checkouts.size).toBe(1);
    expect(await service.startSubscription(user)).toEqual(sessions[0]);
  });

  it("recovers a lost checkout creation response without creating a second session", async () => {
    const create = fake.provider.subscriptionCheckout;
    fake.provider.subscriptionCheckout = async (input) => { await create(input); throw new Error("Response lost"); };
    await expect(service.startSubscription(user)).rejects.toThrow("Response lost");
    fake.provider.subscriptionCheckout = create;
    const recovered = await service.startSubscription(user);
    expect(fake.state.checkouts.size).toBe(1);
    expect(fake.state.checkouts.has(recovered.id)).toBe(true);
  });

  it("starts a fresh attempt only after the previous checkout is confirmed expired", async () => {
    const first = await service.startSubscription(user);
    fake.state.checkouts.get(first.id)!.status = "expired";
    const second = await service.startSubscription(user);
    expect(second.id).not.toBe(first.id);
    expect(fake.state.checkouts.size).toBe(2);
  });

  it("does not blindly retry an unknown checkout after the provider idempotency window", async () => {
    const create = fake.provider.subscriptionCheckout;
    fake.provider.subscriptionCheckout = async () => { throw new Error("Response unknown"); };
    await expect(service.startSubscription(user)).rejects.toThrow("Response unknown");
    fake.provider.subscriptionCheckout = create;
    clock = new Date(clock.getTime() + day);
    await expect(service.startSubscription(user)).rejects.toEqual(new ProBillingError("unavailable"));
    expect(fake.state.checkouts.size).toBe(0);
  });

  it("grants Pro only from server-verified paid invoices, tolerating reordered and duplicate events", async () => {
    const { session, subscriptionId, invoiceId } = await subscribed();
    // Return URL alone grants nothing.
    expect((await service.summary(user)).entitlement.active).toBe(false);
    // Invoice before the subscription/checkout events.
    await service.handleEvent("invoice.paid", invoiceId);
    await service.handleEvent("customer.subscription.created", subscriptionId);
    await service.handleEvent("checkout.session.completed", session.id);
    await service.handleEvent("invoice.paid", invoiceId);
    expect((await service.summary(user)).entitlement).toMatchObject({ active: true, paidThrough: period(0).end });
  });

  it("refuses a second subscription while one is active", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    await expect(service.startSubscription(user)).rejects.toEqual(new ProBillingError("already_active"));
  });

  it("can resubscribe after an ordinary cancellation resolves the previous checkout", async () => {
    const { subscriptionId, invoiceId, session } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    await service.handleEvent("checkout.session.completed", session.id);
    await fake.provider.cancelImmediately(subscriptionId);
    await service.handleEvent("customer.subscription.deleted", subscriptionId);
    const next = await service.startSubscription(user);
    expect(next.id).not.toBe(session.id);
  });

  it("does not extend access for an unpaid renewal and restores it once a recovered payment succeeds", async () => {
    const { subscriptionId, invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const failed = fake.payRenewal(subscriptionId, period(1), false);
    clock = new Date(period(1).start.getTime() + day);
    await service.handleEvent("invoice.payment_failed", failed);
    expect((await service.summary(user)).entitlement).toMatchObject({ active: false, reason: "no_active_subscription" });
    Object.assign(fake.state.invoices.get(failed)!, { status: "paid", paid: true });
    await service.handleEvent("invoice.paid", failed);
    expect((await service.summary(user)).entitlement).toMatchObject({ active: true, paidThrough: period(1).end });
  });

  it("ignores events for non-Pro customers such as sponsorship billing", async () => {
    fake.state.subscriptions.set("sub_sponsor", { id: "sub_sponsor", customerId: "cus_sponsor", userId: null, status: "active", priceId: "price_sponsor", currentPeriodStart: t0, currentPeriodEnd: period(0).end, cancelAtPeriodEnd: false, endedAt: null });
    expect(await service.handleEvent("customer.subscription.updated", "sub_sponsor")).toBe("ignored");
    fake.state.checkouts.set("cs_sponsor", { id: "cs_sponsor", mode: "subscription", status: "complete", customerId: "cus_sponsor", subscriptionId: "sub_sponsor", userId: null });
    expect(await service.handleEvent("checkout.session.completed", "cs_sponsor")).toBe("ignored");
  });

  it("ignores an unrelated subscription even when the Stripe customer has Pro history", async () => {
    const { subscriptionId } = await subscribed();
    fake.state.subscriptions.get(subscriptionId)!.isPro = false;
    expect(await service.handleEvent("customer.subscription.updated", subscriptionId)).toBe("ignored");
    expect((await service.summary(user)).subscriptions).toHaveLength(0);
  });

  it("pauses Pro during a formal dispute and restores it when the dispute is won", async () => {
    const { invoiceId, subscriptionId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const charge = fake.chargeFor(subscriptionId);
    fake.state.disputes.set("dp_1", { id: "dp_1", status: "needs_response", chargeId: charge });
    await service.handleEvent("charge.dispute.created", "dp_1");
    expect((await service.summary(user)).entitlement).toMatchObject({ active: false, reason: "payment_review" });
    fake.state.disputes.get("dp_1")!.status = "won";
    await service.handleEvent("charge.dispute.closed", "dp_1");
    expect((await service.summary(user)).entitlement.active).toBe(true);
  });

  it("cancels renewal at period end, keeping access through the paid period", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    await service.setRenewal(user, true);
    expect((await service.summary(user)).subscriptions[0]).toMatchObject({ cancelAtPeriodEnd: true });
    expect((await service.summary(user)).entitlement.active).toBe(true);
    clock = new Date(period(0).end.getTime() + 1);
    expect((await service.summary(user)).entitlement.active).toBe(false);
  });

  it("acknowledges credit pack and refund events without acting on them", async () => {
    expect(await service.handleEvent("payment_intent.succeeded", "pi_1")).toBe("ignored");
    expect(await service.handleEvent("charge.refunded", "ch_1")).toBe("ignored");
  });
});

describe("permanent deletion", () => {
  it("keeps backend Pro closure available even when identity preparation cannot run", async () => {
    const { invoiceId, subscriptionId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const prepareIdentity = vi.fn(async () => { throw new Error("Standalone self deletion is disabled"); });
    const guarded = createProService({ withTx: db.transaction, provider: () => fake.provider, now: () => clock, siteOrigin: () => "https://preview.test", prepareIdentity });
    await guarded.closeAccount(user);
    expect(prepareIdentity).not.toHaveBeenCalled();
    expect(fake.state.canceled).toContain(subscriptionId);
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: false });
  });

  it("expires an unpaid subscription checkout before completing account closure", async () => {
    const session = await service.startSubscription(user);
    await service.closeAccount(user);
    expect(fake.state.checkouts.get(session.id)!.status).toBe("expired");
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: false });
  });

  it("cancels a late completed subscription before closing its pending checkout", async () => {
    const { subscriptionId, invoiceId } = await subscribed();
    // The customer has paid but no webhook has mirrored the subscription yet.
    await service.closeAccount(user);
    expect(fake.state.canceled).toEqual([subscriptionId]);
    await service.handleEvent("invoice.paid", invoiceId);
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: false });
  });

  it("cancels a newly observed subscription on an already closed account", async () => {
    const { subscriptionId, invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    await service.closeAccount(user);
    const original = fake.state.subscriptions.get(subscriptionId)!;
    fake.state.subscriptions.set("sub_late", { ...original, id: "sub_late", status: "active", endedAt: null });
    await service.handleEvent("customer.subscription.created", "sub_late");
    expect(fake.state.canceled).toContain("sub_late");
    expect((await service.summary(user)).entitlement.active).toBe(false);
  });

  it("cancels the provider subscription immediately and blocks new checkout", async () => {
    const { invoiceId, subscriptionId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    expect(await service.closeAccount(user)).toEqual({ closed: true, providerClosurePending: true });
    expect(fake.state.canceled).toEqual([subscriptionId]);
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: false });
    await expect(service.startSubscription(user)).rejects.toEqual(new ProBillingError("closed"));
  });

  it("retries an unfinished provider closure from maintenance", async () => {
    const { invoiceId, subscriptionId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const cancel = fake.provider.cancelImmediately;
    fake.provider.cancelImmediately = async () => { throw new Error("Provider unavailable"); };
    await expect(service.closeAccount(user)).rejects.toThrow("Provider unavailable");
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: true });
    fake.provider.cancelImmediately = cancel;
    await service.maintenance();
    expect(fake.state.canceled).toEqual([subscriptionId]);
    expect(await account()).toMatchObject({ providerClosurePending: false });
  });
});
