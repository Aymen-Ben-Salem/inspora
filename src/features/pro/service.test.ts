import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { proAccounts, proPurchases } from "@/db/schema";
import { createProTestDatabase } from "./test-database";
import { createFakeProvider } from "./fake-provider";
import { ProBillingError, createProService } from "./service";
import { reserveCredits } from "./repository";

const user = "user_bob1";
const day = 86_400_000;
const t0 = new Date("2027-01-01T00:00:00Z");
const period = (n: number) => ({ start: new Date(t0.getTime() + n * 31 * day), end: new Date(t0.getTime() + (n + 1) * 31 * day) });
let db: Awaited<ReturnType<typeof createProTestDatabase>>;
let fake: ReturnType<typeof createFakeProvider>;
let clock: Date;
let service: ReturnType<typeof createProService>;
let seq = 0;

beforeAll(async () => { db = await createProTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.reset();
  fake = createFakeProvider();
  clock = new Date(t0.getTime() + day);
  service = createProService({ withTx: db.transaction, provider: () => fake.provider, now: () => clock, siteOrigin: () => "https://preview.test" });
});

async function subscribed(options: { paymentMethod?: string | null } = {}) {
  const session = await service.startSubscription(user);
  const { subscriptionId, invoiceId } = fake.completeSubscription(session.id, period(0), options);
  return { session, subscriptionId, invoiceId };
}
const account = async () => (await db.db.select().from(proAccounts).where(eq(proAccounts.userId, user)))[0];
const search = () => db.transaction((tx) => reserveCredits(tx, { userId: user, operationKey: `op_${String(++seq).padStart(20, "0")}`, feature: "mcp_search", now: clock }));

async function lowBalance() {
  const { invoiceId } = await subscribed();
  await service.handleEvent("invoice.paid", invoiceId);
  await service.configureRecharge(user, true, 1000);
  await db.transaction(async (tx) => {
    await tx.execute(`insert into pro_credit_ledger (user_id,bucket,kind,amount,balance_after,idempotency_key) values ('${user}','included','adjustment',-960,40,'fixture-low')` as never);
    await tx.update(proAccounts).set({ includedBalance: 40 }).where(eq(proAccounts.userId, user));
  });
  const result = await search();
  return result.status === "reserved" ? result.rechargePurchaseId! : "";
}

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

  it("does not create a pack purchase when an existing Pro buyer's identity safeguard fails", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const guarded = createProService({ withTx: db.transaction, provider: () => fake.provider, now: () => clock, siteOrigin: () => "https://preview.test", prepareIdentity: async () => { throw new Error("Identity safeguard unavailable"); } });
    await expect(guarded.startPack(user)).rejects.toThrow("Identity safeguard unavailable");
    expect(fake.state.checkouts.size).toBe(1);
    expect((await service.summary(user)).purchases).toHaveLength(0);
    expect(fake.state.calls.filter((call) => call === "ensureCustomer")).toHaveLength(1);
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
    const summary = await service.summary(user);
    expect(summary.entitlement.active).toBe(true);
    expect(summary.balances).toEqual({ included: 1000, purchased: 0, available: 1000 });
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

  it("does not grant an unpaid renewal and grants once a recovered payment succeeds", async () => {
    const { subscriptionId, invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const failed = fake.payRenewal(subscriptionId, period(1), false);
    clock = new Date(period(1).start.getTime() + day);
    await service.handleEvent("invoice.payment_failed", failed);
    expect((await service.summary(user)).entitlement).toMatchObject({ active: false, reason: "no_active_subscription" });
    Object.assign(fake.state.invoices.get(failed)!, { status: "paid", paid: true, amountPaid: 700 });
    await service.handleEvent("invoice.paid", failed);
    expect((await service.summary(user)).balances).toMatchObject({ included: 1000 });
  });

  it("ignores events for non-Pro customers such as sponsorship billing", async () => {
    fake.state.subscriptions.set("sub_sponsor", { id: "sub_sponsor", customerId: "cus_sponsor", userId: null, status: "active", priceId: "price_sponsor", currentPeriodStart: t0, currentPeriodEnd: period(0).end, cancelAtPeriodEnd: false, endedAt: null, defaultPaymentMethodId: null });
    expect(await service.handleEvent("customer.subscription.updated", "sub_sponsor")).toBe("ignored");
    fake.state.checkouts.set("cs_sponsor", { id: "cs_sponsor", mode: "subscription", status: "complete", paymentStatus: "paid", customerId: "cus_sponsor", subscriptionId: "sub_sponsor", paymentIntentId: null, amountTotal: 1000, userId: null, purchaseId: null });
    expect(await service.handleEvent("checkout.session.completed", "cs_sponsor")).toBe("ignored");
  });

  it("ignores an unrelated subscription even when the Stripe customer has Pro history", async () => {
    const { subscriptionId } = await subscribed();
    fake.state.subscriptions.get(subscriptionId)!.isPro = false;
    expect(await service.handleEvent("customer.subscription.updated", subscriptionId)).toBe("ignored");
    expect((await service.summary(user)).subscriptions).toHaveLength(0);
  });

  it("buys a manual pack through checkout and grants on completion exactly once", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    fake.state.packTotalCents = 595;
    const pack = await service.startPack(user);
    await service.handleEvent("checkout.session.completed", pack.id);
    expect((await service.summary(user)).balances).toMatchObject({ purchased: 0 });
    const { intent } = fake.completePack(pack.id);
    await service.handleEvent("checkout.session.completed", pack.id);
    await service.handleEvent("payment_intent.succeeded", intent);
    const summary = await service.summary(user);
    expect(summary.balances).toMatchObject({ purchased: 500 });
    expect(summary.purchases[0]).toMatchObject({ kind: "manual", state: "succeeded", chargedAmountCents: 595 });
  });

  it("refuses pack purchase without active Pro and records expired checkouts without credits", async () => {
    await expect(service.startPack(user)).rejects.toEqual(new ProBillingError("inactive"));
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const pack = await service.startPack(user);
    fake.state.checkouts.get(pack.id)!.status = "expired";
    await service.handleEvent("checkout.session.expired", pack.id);
    expect((await service.summary(user)).purchases[0]).toMatchObject({ state: "failed" });
  });

  it("reverses unspent credits for a refunded pack and pauses during a formal dispute", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const pack = await service.startPack(user);
    const { charge } = fake.completePack(pack.id);
    await service.handleEvent("checkout.session.completed", pack.id);
    fake.state.charges.get(charge)!.amountRefunded = 500;
    await service.handleEvent("charge.refunded", charge);
    expect((await service.summary(user)).balances).toMatchObject({ purchased: 0 });
    fake.state.disputes.set("dp_1", { id: "dp_1", status: "needs_response", chargeId: charge });
    await service.handleEvent("charge.dispute.created", "dp_1");
    expect((await service.summary(user)).entitlement).toMatchObject({ active: false, reason: "payment_review" });
    fake.state.disputes.get("dp_1")!.status = "won";
    await service.handleEvent("charge.dispute.closed", "dp_1");
    expect((await service.summary(user)).entitlement.active).toBe(true);
  });

  it("cancels renewal at period end, keeping access and purchased credits through the paid period", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    await service.setRenewal(user, true);
    expect((await service.summary(user)).subscriptions[0]).toMatchObject({ cancelAtPeriodEnd: true });
    expect((await service.summary(user)).entitlement.active).toBe(true);
    clock = new Date(period(0).end.getTime() + 1);
    expect((await service.summary(user)).entitlement.active).toBe(false);
  });
});

describe("automatic recharge execution", () => {
  it("enabling buys nothing; a qualifying search charges one tax-inclusive pack and grants after payment", async () => {
    fake.state.packTotalCents = 595;
    const purchaseId = await lowBalance();
    expect(fake.state.calls).not.toContain("chargePack");
    expect(await service.runAutomaticRecharge(purchaseId)).toBe("paid");
    expect(await service.runAutomaticRecharge(purchaseId)).toBe("skipped");
    const summary = await service.summary(user);
    expect(summary.balances).toMatchObject({ included: 39, purchased: 500 });
    expect(summary.capSpentCents).toBe(595);
    expect(fake.state.calls.filter((c) => c === "chargePack")).toHaveLength(1);
  });

  it("recovers a transient failure before invoice creation through maintenance", async () => {
    const purchaseId = await lowBalance();
    const charge = fake.provider.chargePack;
    fake.provider.chargePack = async () => { throw new Error("Temporary provider outage"); };
    await expect(service.runAutomaticRecharge(purchaseId)).rejects.toThrow("Temporary provider outage");
    fake.provider.chargePack = charge;
    clock = new Date(clock.getTime() + 16 * 60_000);
    await service.maintenance();
    expect((await service.summary(user)).balances).toMatchObject({ purchased: 500 });
    expect(fake.state.invoices.size).toBe(2); // Subscription invoice plus exactly one pack.
  });

  it("recovers a successful payment whose response was lost without a second charge", async () => {
    const purchaseId = await lowBalance();
    const charge = fake.provider.chargePack;
    fake.provider.chargePack = async (input) => { await charge(input); throw new Error("Paid response lost"); };
    await expect(service.runAutomaticRecharge(purchaseId)).rejects.toThrow("Paid response lost");
    fake.provider.chargePack = charge;
    expect(await service.runAutomaticRecharge(purchaseId)).toBe("paid");
    expect((await service.summary(user)).balances).toMatchObject({ purchased: 500 });
    expect(fake.state.invoices.size).toBe(2);
  });

  it("recovers an already-paid invoice after the idempotency window without a new charge", async () => {
    const purchaseId = await lowBalance();
    const charge = fake.provider.chargePack;
    fake.provider.chargePack = async (input) => { await charge(input); throw new Error("Paid response lost"); };
    await expect(service.runAutomaticRecharge(purchaseId)).rejects.toThrow("Paid response lost");
    fake.provider.chargePack = charge;
    clock = new Date(clock.getTime() + day);
    expect(await service.runAutomaticRecharge(purchaseId)).toBe("paid");
    expect(fake.state.calls.filter((call) => call === "chargePack")).toHaveLength(1);
    expect((await service.summary(user)).balances).toMatchObject({ purchased: 500 });
  });

  it("resumes payment of the same open invoice when the first process stopped before paying", async () => {
    fake.state.payOutcome = "requires_action";
    const purchaseId = await lowBalance();
    const charge = fake.provider.chargePack;
    fake.provider.chargePack = async (input) => { await charge(input); throw new Error("Stopped after invoice creation"); };
    await expect(service.runAutomaticRecharge(purchaseId)).rejects.toThrow("Stopped after invoice creation");
    fake.provider.chargePack = charge;
    fake.state.payOutcome = "paid";
    clock = new Date(clock.getTime() + 16 * 60_000);
    await service.maintenance();
    expect((await service.summary(user)).balances).toMatchObject({ purchased: 500 });
    expect(fake.state.invoices.size).toBe(2);
  });

  it("leaves an unresolved old charge for reconciliation instead of risking an expired idempotency key", async () => {
    const purchaseId = await lowBalance();
    const charge = fake.provider.chargePack;
    fake.provider.chargePack = async () => { throw new Error("Unknown outcome"); };
    await expect(service.runAutomaticRecharge(purchaseId)).rejects.toThrow("Unknown outcome");
    fake.provider.chargePack = charge;
    clock = new Date(clock.getTime() + day);
    expect(await service.runAutomaticRecharge(purchaseId)).toBe("blocked");
    expect(fake.state.calls).not.toContain("chargePack");
    expect((await service.summary(user)).balances).toMatchObject({ purchased: 0 });
  });

  it("does not charge when the previewed tax-inclusive total exceeds the cap", async () => {
    fake.state.packTotalCents = 1100;
    const purchaseId = await lowBalance();
    expect(await service.runAutomaticRecharge(purchaseId)).toBe("blocked");
    expect(fake.state.calls).not.toContain("chargePack");
    expect(await account()).toMatchObject({ autoRechargeNotice: "cap_insufficient", purchasedBalance: 0 });
  });

  it("records a declined automatic payment without credits and keeps access", async () => {
    fake.state.payOutcome = "failed";
    const purchaseId = await lowBalance();
    expect(await service.runAutomaticRecharge(purchaseId)).toBe("failed");
    expect(await account()).toMatchObject({ autoRechargeNotice: "payment_failed", purchasedBalance: 0 });
    expect((await service.summary(user)).entitlement.active).toBe(true);
  });

  it("fails safely when the subscription has no reusable payment method", async () => {
    const { invoiceId } = await subscribed({ paymentMethod: null });
    await service.handleEvent("invoice.paid", invoiceId);
    await service.configureRecharge(user, true, 1000);
    await db.transaction(async (tx) => { await tx.update(proAccounts).set({ includedBalance: 0, purchasedBalance: 0 }).where(eq(proAccounts.userId, user)); });
    const result = await search();
    const purchaseId = result.status === "denied" ? result.rechargePurchaseId! : "";
    expect(await service.runAutomaticRecharge(purchaseId)).toBe("failed");
    expect(await account()).toMatchObject({ autoRechargeNotice: "payment_method_missing" });
  });

  it("leaves an action-required payment processing until its invoice event settles it", async () => {
    fake.state.payOutcome = "requires_action";
    const purchaseId = await lowBalance();
    expect(await service.runAutomaticRecharge(purchaseId)).toBe("requires_action");
    const [purchase] = await db.db.select().from(proPurchases).where(eq(proPurchases.id, purchaseId));
    expect(purchase.state).toBe("processing");
    Object.assign(fake.state.invoices.get(purchase.stripeInvoiceId!)!, { status: "paid", paid: true, amountPaid: 500 });
    await service.handleEvent("invoice.paid", purchase.stripeInvoiceId!);
    expect((await service.summary(user)).balances).toMatchObject({ purchased: 500 });
  });
});

describe("permanent deletion", () => {
  it("expires every open manual pack Checkout beyond the displayed purchase-history page", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const packs = [];
    for (let i = 0; i < 35; i++) packs.push(await service.startPack(user));
    expect((await service.summary(user)).purchases.length).toBeLessThan(packs.length);
    await service.closeAccount(user);
    expect(packs.every((pack) => fake.state.checkouts.get(pack.id)!.status === "expired")).toBe(true);
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: false });
  }, 30_000);

  it("retains closure pending on pack expiration failure and retries without creating payments", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const pack = await service.startPack(user);
    const expire = fake.provider.expireCheckout;
    fake.provider.expireCheckout = async () => { throw new Error("Provider unavailable"); };
    await expect(service.closeAccount(user)).rejects.toThrow("Provider unavailable");
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: true });
    expect(fake.state.checkouts.get(pack.id)!.status).toBe("open");
    fake.provider.expireCheckout = expire;
    await service.maintenance({ closuresOnly: true });
    expect(fake.state.checkouts.get(pack.id)!.status).toBe("expired");
    expect((await account()).providerClosurePending).toBe(false);
    expect(fake.state.calls).not.toContain("chargePack");
  });

  it("reconciles paid and expired pack sessions idempotently without losing paid receipts", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const paid = await service.startPack(user), expired = await service.startPack(user);
    fake.completePack(paid.id);
    fake.state.checkouts.get(expired.id)!.status = "expired";
    await service.closeAccount(user);
    await service.closeAccount(user);
    const purchases = (await service.summary(user)).purchases;
    expect(purchases.find((p) => p.chargedAmountCents === 500)).toMatchObject({ state: "succeeded", refundedAmountCents: 0 });
    expect((await account()).providerClosurePending).toBe(false);
    expect((await account()).purchasedBalance).toBe(0);
  });

  it("does not return a payable pack URL when its creation races permanent closure", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const create = fake.provider.packCheckout;
    fake.provider.packCheckout = async (input) => {
      const session = await create(input);
      await service.closeAccount(user);
      return session;
    };
    await expect(service.startPack(user)).rejects.toEqual(new ProBillingError("closed"));
    expect([...fake.state.checkouts.values()].filter((s) => s.mode === "payment").every((s) => s.status === "expired")).toBe(true);
    expect((await account()).providerClosurePending).toBe(false);
  });

  it("waits for a completed pack's unresolved payment before allowing identity closure", async () => {
    const { invoiceId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const pack = await service.startPack(user), session = fake.state.checkouts.get(pack.id)!;
    Object.assign(session, { status: "complete", paymentStatus: "unpaid", paymentIntentId: "pi_processing" });
    fake.state.paymentIntents.set("pi_processing", { id: "pi_processing", status: "processing", customerId: session.customerId, purchaseId: session.purchaseId, amountReceived: 0 });
    await expect(service.closeAccount(user)).rejects.toThrow("remains in progress");
    expect((await account()).providerClosurePending).toBe(true);
    fake.state.paymentIntents.get("pi_processing")!.status = "canceled";
    await service.maintenance({ closuresOnly: true });
    expect((await account()).providerClosurePending).toBe(false);
  });

  it("voids an existing unpaid automatic invoice without attempting another payment", async () => {
    fake.state.payOutcome = "requires_action";
    const purchaseId = await lowBalance();
    await service.runAutomaticRecharge(purchaseId);
    const invoice = [...fake.state.invoices.values()].find((i) => i.purchaseId === purchaseId)!;
    await service.closeAccount(user);
    expect(invoice.status).toBe("void");
    expect(fake.state.calls.filter((c) => c === "chargePack")).toHaveLength(1);
    expect((await account()).providerClosurePending).toBe(false);
  });

  it("keeps unknown automatic outcomes pending and later reconciles a paid invoice without charging", async () => {
    const purchaseId = await lowBalance();
    let attempts = 0;
    fake.provider.chargePack = async () => { attempts++; throw new Error("Unknown provider outcome"); };
    await expect(service.runAutomaticRecharge(purchaseId)).rejects.toThrow("Unknown provider outcome");
    await expect(service.closeAccount(user)).rejects.toThrow("outcome remains unknown");
    expect((await account()).providerClosurePending).toBe(true);
    fake.state.invoices.set("in_late", { id: "in_late", status: "paid", customerId: (await account()).stripeCustomerId, purchaseId, subscriptionId: null, paid: true, amountPaid: 500, total: 500, subscriptionPeriod: null });
    await service.maintenance({ closuresOnly: true });
    expect(attempts).toBe(1);
    expect(await account()).toMatchObject({ state: "closed", providerClosurePending: false, purchasedBalance: 0 });
    expect((await service.summary(user)).purchases.find((p) => p.id === purchaseId)).toMatchObject({ state: "succeeded", chargedAmountCents: 500 });
  });

  it("does not run queued automatic purchases during closures-only maintenance", async () => {
    await lowBalance();
    clock = new Date(clock.getTime() + 16 * 60_000);
    await service.maintenance({ closuresOnly: true });
    expect(fake.state.calls).not.toContain("chargePack");
  });

  it("keeps backend Pro closure available even when identity preparation cannot run", async () => {
    const { invoiceId, subscriptionId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    const prepareIdentity = vi.fn(async () => { throw new Error("Standalone self deletion is disabled"); });
    const guarded = createProService({ withTx: db.transaction, provider: () => fake.provider, now: () => clock, siteOrigin: () => "https://preview.test", prepareIdentity });
    await guarded.closeAccount(user);
    expect(prepareIdentity).not.toHaveBeenCalled();
    expect(fake.state.canceled).toContain(subscriptionId);
    expect(await account()).toMatchObject({ state: "closed", includedBalance: 0, purchasedBalance: 0, providerClosurePending: false });
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
    expect(await account()).toMatchObject({ state: "closed", includedBalance: 0, providerClosurePending: false });
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

  it("forfeits credits, cancels the provider subscription immediately and blocks new checkout", async () => {
    const { invoiceId, subscriptionId } = await subscribed();
    await service.handleEvent("invoice.paid", invoiceId);
    expect(await service.closeAccount(user)).toEqual({ closed: true, providerClosurePending: true });
    expect(fake.state.canceled).toEqual([subscriptionId]);
    expect(await account()).toMatchObject({ state: "closed", includedBalance: 0, purchasedBalance: 0, providerClosurePending: false });
    await expect(service.startSubscription(user)).rejects.toEqual(new ProBillingError("closed"));
  });
});
