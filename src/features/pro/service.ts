import type { ProBillingProvider } from "./stripe";
import {
  accountByCustomer,
  applyPaidSubscriptionInvoice,
  attachSubscriptionCheckout,
  claimSubscriptionCheckout,
  clearSubscriptionCheckout,
  closeProAccount,
  ensureProAccount,
  liveSubscriptionIds,
  markProviderClosureAttempt,
  markProviderClosureComplete,
  pendingProviderClosures,
  readAccess,
  readAccountSummary,
  recordDispute,
  recordSubscription,
  setStripeCustomer,
  type ProTx,
} from "./repository";

export type WithProTransaction = <T>(work: (tx: ProTx) => Promise<T>) => Promise<T>;
export type ProServiceDeps = {
  withTx: WithProTransaction;
  provider: () => ProBillingProvider;
  now?: () => Date;
  siteOrigin: () => string;
  /** Establish the account's confirmed-deletion path before issuing payable Checkout. */
  prepareIdentity?: (userId: string) => Promise<void>;
};

export class ProBillingError extends Error {
  constructor(public code: "already_active" | "no_subscription" | "closed" | "unavailable") {
    super(code);
  }
}

/** Stripe events this service reconciles. Anything else is acknowledged and ignored. */
export const PRO_STRIPE_EVENTS =
  /^(checkout\.session\.(completed|expired|async_payment_succeeded|async_payment_failed)|customer\.subscription\.(created|updated|deleted|paused|resumed)|invoice\.(paid|payment_succeeded|payment_failed|voided|marked_uncollectible)|charge\.dispute\.(created|updated|closed|funds_withdrawn|funds_reinstated))$/;

export function createProService(deps: ProServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const { withTx } = deps;

  /** Resolve the Pro owner of a Stripe customer; null for non-Pro (for example sponsorship) customers. */
  async function owner(customerId: string | null, claimedUserId?: string | null) {
    if (!customerId) return null;
    const account = await withTx((tx) => accountByCustomer(tx, customerId));
    if (!account) return null;
    if (claimedUserId && claimedUserId !== account.userId) throw new Error("Pro ownership mismatch.");
    return account;
  }

  async function record(userId: string, facts: Awaited<ReturnType<ProBillingProvider["subscription"]>>) {
    await withTx((tx) => recordSubscription(tx, {
      userId,
      stripeSubscriptionId: facts.id,
      status: facts.status,
      priceId: facts.priceId,
      currentPeriodStart: facts.currentPeriodStart,
      currentPeriodEnd: facts.currentPeriodEnd,
      cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
      endedAt: facts.endedAt,
    }, now()));
  }

  async function syncSubscription(id: string) {
    const provider = deps.provider();
    const facts = await provider.subscription(id);
    if (facts.isPro === false) return "ignored" as const;
    const account = await owner(facts.customerId, facts.userId);
    if (!account) return "ignored" as const;
    await record(account.userId, facts);
    // A customer may complete an already-issued Checkout while deletion is in flight.
    // Never leave a new recurring subscription billing an account that is closed.
    if (account.state === "closed" && !facts.endedAt && !["canceled", "incomplete_expired"].includes(facts.status)) {
      await provider.cancelImmediately(id);
      await record(account.userId, await provider.subscription(id));
    }
    return "synced" as const;
  }

  async function syncInvoice(id: string) {
    const invoice = await deps.provider().invoice(id);
    const account = await owner(invoice.customerId);
    if (!account) return "ignored" as const;
    if (invoice.subscriptionId && invoice.paid && invoice.subscriptionPeriod) {
      // Reordered delivery: mirror the subscription before applying its paid period.
      await syncSubscription(invoice.subscriptionId);
      await withTx((tx) => applyPaidSubscriptionInvoice(tx, {
        userId: account.userId,
        stripeSubscriptionId: invoice.subscriptionId!,
        periodStart: invoice.subscriptionPeriod!.start,
        periodEnd: invoice.subscriptionPeriod!.end,
        paidAt: invoice.paidAt ?? undefined,
        now: now(),
      }));
    }
    return "synced" as const;
  }

  async function syncCheckout(id: string) {
    const session = await deps.provider().checkout(id);
    if (!session.userId || session.mode !== "subscription") return "ignored" as const;
    const account = await owner(session.customerId, session.userId);
    if (!account) return "ignored" as const;
    if (session.status === "complete" && session.subscriptionId) {
      await syncSubscription(session.subscriptionId);
      if (session.attemptId) await withTx((tx) => clearSubscriptionCheckout(tx, { userId: account.userId, attemptId: session.attemptId!, now: now() }));
    }
    return "synced" as const;
  }

  async function syncDispute(id: string) {
    const provider = deps.provider();
    const dispute = await provider.dispute(id);
    if (!dispute.chargeId) return "ignored" as const;
    const charge = await provider.charge(dispute.chargeId);
    const account = await owner(charge.customerId);
    if (!account) return "ignored" as const;
    await withTx((tx) => recordDispute(tx, { userId: account.userId, disputeId: dispute.id, status: dispute.status, now: now() }));
    return "synced" as const;
  }

  async function customerFor(userId: string) {
    const account = await withTx((tx) => ensureProAccount(tx, userId));
    if (account.state !== "open") throw new ProBillingError("closed");
    await deps.prepareIdentity?.(userId);
    const customerId = await deps.provider().ensureCustomer({ userId, existingCustomerId: account.stripeCustomerId });
    await withTx((tx) => setStripeCustomer(tx, userId, customerId, now()));
    return customerId;
  }

  const page = (state: string) => `${deps.siteOrigin()}/account/pro?checkout=${state}`;

  return {
    summary: (userId: string) => withTx((tx) => readAccountSummary(tx, userId, now())),

    async startSubscription(userId: string) {
      const access = await withTx((tx) => readAccess(tx, userId, now()));
      if (access.entitlement.active) throw new ProBillingError("already_active");
      if (access.entitlement.reason === "closed") throw new ProBillingError("closed");
      const customerId = await customerFor(userId);
      const provider = deps.provider();
      for (let attempt = 0; attempt < 2; attempt++) {
        const claim = await withTx((tx) => claimSubscriptionCheckout(tx, { userId, now: now() }));
        if (claim.status === "closed") throw new ProBillingError("closed");
        if (claim.status !== "claimed") throw new ProBillingError("already_active");
        let session = claim.sessionId ? await provider.checkout(claim.sessionId) : null;
        if (!session) {
          session = await provider.findSubscriptionCheckout({ customerId, attemptId: claim.attemptId });
          if (!session) {
            // Stripe may prune idempotency keys after 24h. Never turn an unknown old
            // outcome into a second payable subscription by creating with another key.
            if (now().getTime() - claim.createdAt.getTime() >= 23 * 60 * 60_000) throw new ProBillingError("unavailable");
            const created = await provider.subscriptionCheckout({ userId, customerId, attemptId: claim.attemptId, createdAt: claim.createdAt, successUrl: page("subscribed"), cancelUrl: page("canceled") });
            await withTx((tx) => attachSubscriptionCheckout(tx, { userId, attemptId: claim.attemptId, sessionId: created.id, now: now() }));
            session = await provider.checkout(created.id);
          } else await withTx((tx) => attachSubscriptionCheckout(tx, { userId, attemptId: claim.attemptId, sessionId: session!.id, now: now() }));
        }
        if (session.customerId !== customerId || session.userId !== userId || session.mode !== "subscription") throw new ProBillingError("unavailable");
        const latest = await withTx((tx) => readAccountSummary(tx, userId, now()));
        if (latest.account?.state !== "open") {
          await completeProviderClosure(userId);
          throw new ProBillingError("closed");
        }
        if (session.status === "open" && session.url) return { id: session.id, url: session.url };
        if (session.status === "complete") {
          if (session.subscriptionId) await syncSubscription(session.subscriptionId);
          if (!session.subscriptionId) throw new ProBillingError("unavailable");
          await withTx((tx) => clearSubscriptionCheckout(tx, { userId, attemptId: claim.attemptId, now: now() }));
          const current = await withTx((tx) => readAccountSummary(tx, userId, now()));
          if (current.subscriptions.some((sub) => !sub.endedAt && !["canceled", "incomplete_expired"].includes(sub.status))) throw new ProBillingError("already_active");
          continue;
        }
        if (session.status !== "expired") throw new ProBillingError("unavailable");
        await withTx((tx) => clearSubscriptionCheckout(tx, { userId, attemptId: claim.attemptId, now: now() }));
      }
      throw new ProBillingError("unavailable");
    },

    async portal(userId: string) {
      const account = await withTx((tx) => readAccountSummary(tx, userId, now()));
      if (!account.account?.stripeCustomerId || account.account.state !== "open") throw new ProBillingError("no_subscription");
      return deps.provider().portal({ customerId: account.account.stripeCustomerId, returnUrl: `${deps.siteOrigin()}/account/pro` });
    },

    /** Cancel or resume renewal. Cancellation keeps access through the paid period. */
    async setRenewal(userId: string, cancel: boolean) {
      const access = await withTx((tx) => readAccess(tx, userId, now()));
      if (!access.entitlement.active && access.entitlement.reason !== "payment_review") throw new ProBillingError("no_subscription");
      const summary = await withTx((tx) => readAccountSummary(tx, userId, now()));
      const current = summary.subscriptions.find((s) => !s.endedAt && s.paidThrough && s.paidThrough > now());
      if (!current) throw new ProBillingError("no_subscription");
      await deps.provider().setCancelAtPeriodEnd(current.stripeSubscriptionId, cancel);
      await syncSubscription(current.stripeSubscriptionId);
    },

    async handleEvent(type: string, objectId: string) {
      if (type.startsWith("checkout.session.")) return syncCheckout(objectId);
      if (type.startsWith("customer.subscription.")) return syncSubscription(objectId);
      if (type.startsWith("invoice.")) return syncInvoice(objectId);
      if (type.startsWith("charge.dispute.")) return syncDispute(objectId);
      return "ignored" as const;
    },

    /** Confirmed permanent deletion: close the account in the database, then stop provider billing. */
    async closeAccount(userId: string) {
      const result = await withTx((tx) => closeProAccount(tx, { userId, now: now() }));
      if (result.providerClosurePending) await completeProviderClosure(userId);
      return result;
    },

    /** Retry provider cancellation for closed accounts whose earlier attempt did not finish. */
    async maintenance() {
      for (const { userId } of await withTx((tx) => pendingProviderClosures(tx))) await completeProviderClosure(userId).catch(() => undefined);
    },
  };

  async function completeProviderClosure(userId: string) {
    // Move a failed provider attempt to the back of the recovery queue as well.
    await withTx((tx) => markProviderClosureAttempt(tx, userId, now()));
    const provider = deps.provider();
    for (const id of await withTx((tx) => liveSubscriptionIds(tx, userId))) {
      await provider.cancelImmediately(id);
      await syncSubscription(id);
    }
    const account = (await withTx((tx) => readAccountSummary(tx, userId, now()))).account;
    if (account?.subscriptionCheckoutAttemptId) {
      let session = account.stripeCheckoutSessionId
        ? await provider.checkout(account.stripeCheckoutSessionId)
        : account.stripeCustomerId ? await provider.findSubscriptionCheckout({ customerId: account.stripeCustomerId, attemptId: account.subscriptionCheckoutAttemptId }) : null;
      if (!session) throw new Error("Subscription checkout outcome remains unknown; closure needs reconciliation.");
      if (session.status === "open") session = await provider.expireCheckout(session.id);
      if (session.status === "complete" && session.subscriptionId) await syncSubscription(session.subscriptionId);
      else if (session.status !== "expired") throw new Error("Subscription checkout closure remains pending.");
      await withTx((tx) => clearSubscriptionCheckout(tx, { userId, attemptId: account.subscriptionCheckoutAttemptId!, now: now() }));
    }
    await withTx((tx) => markProviderClosureComplete(tx, userId, now()));
  }
}

export type ProService = ReturnType<typeof createProService>;
