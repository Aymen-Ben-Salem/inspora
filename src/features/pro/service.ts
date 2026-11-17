import type { ProBillingProvider } from "./stripe";
import {
  accountByCustomer,
  applyPackRefund,
  applyPaidSubscriptionInvoice,
  attachPurchaseProviderIds,
  attachSubscriptionCheckout,
  beginAutomaticCharge,
  claimSubscriptionCheckout,
  clearSubscriptionCheckout,
  closeProAccount,
  configureAutoRecharge,
  createManualPurchase,
  ensureProAccount,
  failPurchase,
  findPurchase,
  grantPurchase,
  liveSubscriptionIds,
  markAutomaticPurchaseClosed,
  markManualCheckoutClosed,
  markProviderClosureAttempt,
  markProviderClosureComplete,
  pendingAutomaticClosurePurchases,
  pendingManualCheckoutSessions,
  pendingProviderClosures,
  readAccess,
  readAccountSummary,
  recordDispute,
  recordSubscription,
  setStripeCustomer,
  stalePurchases,
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
  constructor(public code: "inactive" | "already_active" | "no_subscription" | "invalid_cap" | "closed" | "unavailable") {
    super(code);
  }
}

/** Stripe events this service reconciles. Anything else is acknowledged and ignored. */
export const PRO_STRIPE_EVENTS =
  /^(checkout\.session\.(completed|expired|async_payment_succeeded|async_payment_failed)|customer\.subscription\.(created|updated|deleted|paused|resumed)|invoice\.(paid|payment_succeeded|payment_failed|voided|marked_uncollectible)|payment_intent\.(succeeded|payment_failed|canceled)|charge\.refunded|charge\.dispute\.(created|updated|closed|funds_withdrawn|funds_reinstated))$/;

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

  async function syncSubscription(id: string) {
    const provider = deps.provider();
    const facts = await provider.subscription(id);
    if (facts.isPro === false) return "ignored" as const;
    const account = await owner(facts.customerId, facts.userId);
    if (!account) return "ignored" as const;
    await withTx((tx) => recordSubscription(tx, {
      userId: account.userId,
      stripeSubscriptionId: facts.id,
      status: facts.status,
      priceId: facts.priceId,
      currentPeriodStart: facts.currentPeriodStart,
      currentPeriodEnd: facts.currentPeriodEnd,
      cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
      endedAt: facts.endedAt,
    }, now()));
    // A customer may complete an already-issued Checkout while deletion is in flight.
    // Never leave a new recurring subscription billing an account that is closed.
    if (account.state === "closed" && !facts.endedAt && !["canceled", "incomplete_expired"].includes(facts.status)) {
      await provider.cancelImmediately(id);
      const canceled = await provider.subscription(id);
      await withTx((tx) => recordSubscription(tx, {
        userId: account.userId, stripeSubscriptionId: canceled.id, status: canceled.status, priceId: canceled.priceId,
        currentPeriodStart: canceled.currentPeriodStart, currentPeriodEnd: canceled.currentPeriodEnd,
        cancelAtPeriodEnd: canceled.cancelAtPeriodEnd, endedAt: canceled.endedAt,
      }, now()));
    }
    return "synced" as const;
  }

  async function syncInvoice(id: string) {
    const invoice = await deps.provider().invoice(id);
    const account = await owner(invoice.customerId);
    if (!account) return "ignored" as const;
    if (invoice.purchaseId) {
      const purchase = await withTx((tx) => findPurchase(tx, { id: invoice.purchaseId! }));
      if (!purchase || purchase.userId !== account.userId || purchase.kind !== "automatic") throw new Error("Pro purchase ownership mismatch.");
      if (purchase.stripeInvoiceId && purchase.stripeInvoiceId !== invoice.id) throw new Error("Pro invoice ownership mismatch.");
      if (invoice.packVerified === false) throw new Error("Unexpected automatic pack invoice.");
      if (invoice.paid) await withTx((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: invoice.amountPaid, paidAt: invoice.paidAt ?? undefined, now: now() }));
      else if (invoice.status === "void" || invoice.status === "uncollectible") await withTx((tx) => failPurchase(tx, { purchaseId: purchase.id, code: "payment_failed", now: now() }));
      return "synced" as const;
    }
    if (invoice.subscriptionId && invoice.paid && invoice.subscriptionPeriod) {
      // Reordered delivery: mirror the subscription before applying its paid period.
      await syncSubscription(invoice.subscriptionId);
      await withTx((tx) => applyPaidSubscriptionInvoice(tx, {
        userId: account.userId,
        stripeSubscriptionId: invoice.subscriptionId!,
        invoiceId: invoice.id,
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
    if (!session.userId) return "ignored" as const;
    const account = await owner(session.customerId, session.userId);
    if (!account) return "ignored" as const;
    if (session.mode === "subscription") {
      if (session.status === "complete" && session.subscriptionId) {
        await syncSubscription(session.subscriptionId);
        if (session.attemptId) await withTx((tx) => clearSubscriptionCheckout(tx, { userId: account.userId, attemptId: session.attemptId!, now: now() }));
      }
      return "synced" as const;
    }
    if (!session.purchaseId) return "ignored" as const;
    const purchase = await withTx((tx) => findPurchase(tx, { id: session.purchaseId! }));
    if (!purchase || purchase.userId !== account.userId || purchase.kind !== "manual" || purchase.stripeCheckoutSessionId !== session.id)
      throw new Error("Pro purchase ownership mismatch.");
    if (session.status === "complete" && session.paymentStatus === "paid" && session.amountTotal) {
      const intent = session.paymentIntentId ? await deps.provider().paymentIntent(session.paymentIntentId) : null;
      await withTx((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: session.amountTotal!, stripePaymentIntentId: session.paymentIntentId, paidAt: intent?.paidAt ?? undefined, now: now() }));
    }
    else if (session.status === "expired") await withTx((tx) => failPurchase(tx, { purchaseId: purchase.id, code: "checkout_expired", now: now() }));
    return "synced" as const;
  }

  async function syncPaymentIntent(id: string) {
    const intent = await deps.provider().paymentIntent(id);
    if (!intent.purchaseId) return "ignored" as const;
    const account = await owner(intent.customerId);
    if (!account) return "ignored" as const;
    const purchase = await withTx((tx) => findPurchase(tx, { id: intent.purchaseId! }));
    if (!purchase || purchase.userId !== account.userId) throw new Error("Pro purchase ownership mismatch.");
    if (purchase.kind === "manual" && intent.status === "succeeded" && intent.amountReceived > 0)
      await withTx((tx) => grantPurchase(tx, { purchaseId: purchase.id, chargedCents: intent.amountReceived, stripePaymentIntentId: intent.id, paidAt: intent.paidAt ?? undefined, now: now() }));
    return "synced" as const;
  }

  async function syncCharge(id: string) {
    const charge = await deps.provider().charge(id);
    const account = await owner(charge.customerId);
    if (!account) return "ignored" as const;
    const purchase =
      (charge.paymentIntentId && (await withTx((tx) => findPurchase(tx, { stripePaymentIntentId: charge.paymentIntentId! })))) ||
      (charge.invoiceId && (await withTx((tx) => findPurchase(tx, { stripeInvoiceId: charge.invoiceId! })))) ||
      null;
    // Subscription refunds are billing corrections reviewed by support; included credits are not adjusted automatically.
    if (!purchase || purchase.userId !== account.userId) return "synced" as const;
    await withTx((tx) => applyPackRefund(tx, { purchaseId: purchase.id, refundedCents: charge.amountRefunded, chargedCents: charge.amount, now: now() }));
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

  async function runAutomaticRecharge(purchaseId: string) {
    const provider = deps.provider();
    const purchase = await withTx((tx) => findPurchase(tx, { id: purchaseId }));
    if (!purchase || purchase.kind !== "automatic" || !["pending", "processing"].includes(purchase.state)) return "skipped" as const;
    const account = (await withTx((tx) => readAccountSummary(tx, purchase.userId, now()))).account;
    const invoiceId = purchase.stripeInvoiceId ?? (purchase.state === "processing" && account?.stripeCustomerId ? await provider.findAutomaticInvoice(account.stripeCustomerId, purchaseId) : null);
    if (invoiceId) {
      if (!purchase.stripeInvoiceId) await withTx((tx) => attachPurchaseProviderIds(tx, purchaseId, { stripeInvoiceId: invoiceId }, now()));
      await syncInvoice(invoiceId);
      const reconciled = await withTx((tx) => findPurchase(tx, { id: purchaseId }));
      if (reconciled?.state === "succeeded") return "paid" as const;
      if (reconciled?.state !== "processing") return "skipped" as const;
      // An open invoice may mean the process stopped before payment. Resume the
      // same invoice/payment idempotency key within its safe retention window.
      // Beyond that, read-only reconciliation still works but no new pay is sent.
      if (now().getTime() - purchase.createdAt.getTime() >= 23 * 60 * 60_000) return "requires_action" as const;
    }
    if (!account?.stripeCustomerId) {
      await withTx((tx) => failPurchase(tx, { purchaseId, code: "payment_method_missing", now: now() }));
      return "failed" as const;
    }
    const gross = purchase.state === "processing" ? purchase.reservedAmountCents! : await provider.previewPack(account.stripeCustomerId);
    // Look up the method before entering processing so a read outage leaves a pending attempt retryable.
    const access = await withTx((tx) => readAccess(tx, purchase.userId, now()));
    if (!access.entitlement.active) return "blocked" as const;
    const subscription = await provider.subscription(access.entitlement.subscription.stripeSubscriptionId);
    if (!subscription.defaultPaymentMethodId) {
      await withTx((tx) => failPurchase(tx, { purchaseId, code: "payment_method_missing", now: now() }));
      return "failed" as const;
    }
    const gate = await withTx((tx) => beginAutomaticCharge(tx, { purchaseId, grossCents: gross, now: now() }));
    if (!gate.ok) return "blocked" as const;
    const charge = await provider.chargePack({ customerId: account.stripeCustomerId, purchaseId, userId: purchase.userId, maxCents: gross, paymentMethodId: subscription.defaultPaymentMethodId });
    await withTx((tx) => attachPurchaseProviderIds(tx, purchaseId, { stripeInvoiceId: charge.invoiceId }, now()));
    if (charge.outcome === "paid") {
      // Re-read the paid invoice rather than trusting the call result alone.
      await syncInvoice(charge.invoiceId);
      return "paid" as const;
    }
    if (charge.outcome === "over_cap") await withTx((tx) => failPurchase(tx, { purchaseId, code: "cap_insufficient", state: "cap_blocked", now: now() }));
    if (charge.outcome === "failed") await withTx((tx) => failPurchase(tx, { purchaseId, code: "payment_failed", now: now() }));
    // requires_action stays processing; invoice events settle it.
    return charge.outcome;
  }

  async function requireActive(userId: string) {
    const access = await withTx((tx) => readAccess(tx, userId, now()));
    if (!access.entitlement.active) throw new ProBillingError(access.entitlement.reason === "closed" ? "closed" : "inactive");
    return access;
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

    async startPack(userId: string) {
      await requireActive(userId);
      const customerId = await customerFor(userId);
      const purchase = await withTx((tx) => createManualPurchase(tx, { userId, now: now() }));
      if (!purchase) throw new ProBillingError("inactive");
      const session = await deps.provider().packCheckout({ userId, customerId, purchaseId: purchase.id, successUrl: page("pack"), cancelUrl: page("canceled") });
      await withTx((tx) => attachPurchaseProviderIds(tx, purchase.id, { stripeCheckoutSessionId: session.id }, now()));
      if ((await withTx((tx) => readAccountSummary(tx, userId, now()))).account?.state !== "open") {
        await completeProviderClosure(userId);
        throw new ProBillingError("closed");
      }
      return session;
    },

    async portal(userId: string) {
      const account = await withTx((tx) => readAccountSummary(tx, userId, now()));
      if (!account.account?.stripeCustomerId || account.account.state !== "open") throw new ProBillingError("no_subscription");
      return deps.provider().portal({ customerId: account.account.stripeCustomerId, returnUrl: `${deps.siteOrigin()}/account/pro` });
    },

    /** Cancel or resume renewal. Cancellation keeps access through the paid period and preserves purchased credits. */
    async setRenewal(userId: string, cancel: boolean) {
      const access = await withTx((tx) => readAccess(tx, userId, now()));
      if (!access.entitlement.active && access.entitlement.reason !== "payment_review") throw new ProBillingError("no_subscription");
      const summary = await withTx((tx) => readAccountSummary(tx, userId, now()));
      const current = summary.subscriptions.find((s) => !s.endedAt && s.paidThrough && s.paidThrough > now());
      if (!current) throw new ProBillingError("no_subscription");
      await deps.provider().setCancelAtPeriodEnd(current.stripeSubscriptionId, cancel);
      await syncSubscription(current.stripeSubscriptionId);
    },

    async configureRecharge(userId: string, enabled: boolean, capCents?: number) {
      const result = await withTx((tx) => configureAutoRecharge(tx, { userId, enabled, capCents, now: now() }));
      if (!result.ok) throw new ProBillingError(result.reason === "invalid_cap" ? "invalid_cap" : "inactive");
    },

    runAutomaticRecharge,

    async handleEvent(type: string, objectId: string) {
      if (type.startsWith("checkout.session.")) return syncCheckout(objectId);
      if (type.startsWith("customer.subscription.")) return syncSubscription(objectId);
      if (type.startsWith("invoice.")) return syncInvoice(objectId);
      if (type.startsWith("payment_intent.")) return syncPaymentIntent(objectId);
      if (type === "charge.refunded") return syncCharge(objectId);
      if (type.startsWith("charge.dispute.")) return syncDispute(objectId);
      return "ignored" as const;
    },

    /** Confirmed permanent deletion: forfeit credits in the database, then stop provider billing. */
    async closeAccount(userId: string) {
      const result = await withTx((tx) => closeProAccount(tx, { userId, now: now() }));
      if (result.providerClosurePending) await completeProviderClosure(userId);
      return result;
    },

    async maintenance(options: { closuresOnly?: boolean } = {}) {
      for (const { userId } of await withTx((tx) => pendingProviderClosures(tx))) await completeProviderClosure(userId).catch(() => undefined);
      if (options.closuresOnly) return;
      const stale = await withTx((tx) => stalePurchases(tx, new Date(now().getTime() - 15 * 60_000)));
      for (const purchase of stale) {
        try {
          if (purchase.kind === "automatic") await runAutomaticRecharge(purchase.id);
          else if (purchase.stripeInvoiceId) await syncInvoice(purchase.stripeInvoiceId);
          else if (purchase.stripeCheckoutSessionId) await syncCheckout(purchase.stripeCheckoutSessionId);
        } catch { /* Retried on the next maintenance run. */ }
      }
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
    for (const purchase of await withTx((tx) => pendingManualCheckoutSessions(tx, userId))) {
      let session = await provider.checkout(purchase.sessionId);
      if (session.mode !== "payment" || session.customerId !== account?.stripeCustomerId || session.purchaseId !== purchase.purchaseId)
        throw new Error("Pack Checkout ownership could not be verified.");
      if (session.status === "open") session = await provider.expireCheckout(session.id);
      if (session.status === "complete") {
        if (session.paymentStatus === "paid" || session.paymentStatus === "no_payment_required") await syncCheckout(session.id);
        else {
          if (!session.paymentIntentId) throw new Error("Pack payment remains in progress.");
          let payment = await provider.paymentIntent(session.paymentIntentId);
          if (payment.customerId !== account?.stripeCustomerId || payment.purchaseId !== purchase.purchaseId) throw new Error("Pack payment ownership could not be verified.");
          // Stripe only permits canceling a Checkout PaymentIntent directly when
          // it requires capture. Other in-flight outcomes must reconcile first.
          if (payment.status === "requires_capture") {
            await provider.cancelCheckoutPayment(session.paymentIntentId);
            payment = await provider.paymentIntent(session.paymentIntentId);
          }
          if (payment.status === "succeeded") await syncPaymentIntent(session.paymentIntentId);
          else if (payment.status !== "canceled") throw new Error("Pack payment remains in progress.");
        }
      } else if (session.status !== "expired") throw new Error("Pack Checkout closure remains pending.");
      await withTx((tx) => markManualCheckoutClosed(tx, { purchaseId: purchase.purchaseId, now: now() }));
    }
    for (const purchase of await withTx((tx) => pendingAutomaticClosurePurchases(tx, userId))) {
      const invoiceId = purchase.stripeInvoiceId ?? (account?.stripeCustomerId ? await provider.findAutomaticInvoice(account.stripeCustomerId, purchase.id) : null);
      if (!invoiceId || !account?.stripeCustomerId) throw new Error("Automatic payment outcome remains unknown; closure needs reconciliation.");
      if (!purchase.stripeInvoiceId) await withTx((tx) => attachPurchaseProviderIds(tx, purchase.id, { stripeInvoiceId: invoiceId }, now()));
      const outcome = await provider.cancelAutomaticInvoice({ invoiceId, purchaseId: purchase.id, customerId: account.stripeCustomerId });
      if (outcome === "pending") throw new Error("Automatic payment remains in progress.");
      if (outcome === "paid") await syncInvoice(invoiceId);
      else await withTx((tx) => markAutomaticPurchaseClosed(tx, { purchaseId: purchase.id, now: now() }));
    }
    await withTx((tx) => markProviderClosureComplete(tx, userId, now()));
  }
}

export type ProService = ReturnType<typeof createProService>;
