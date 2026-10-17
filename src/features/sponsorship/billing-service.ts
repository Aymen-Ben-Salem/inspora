import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { verifiedSponsorOwner } from "./authorization";
import { sponsorshipWritesEnabled } from "./config";
import {
  stripeCheckoutConfigured,
  sponsorBillingProvider,
} from "./stripe-client";
import { reserveSponsorSeat } from "./seats";
import { ensureSponsorCheckoutSession, reconcileSponsorCheckout } from "./billing-repository";
import { runSponsorMaintenance } from "./jobs";
import { withSponsorWrite } from "./repository";
import {
  sponsorAccounts,
  sponsorCheckouts,
  sponsorIdentities,
  sponsorSeats,
  sponsors,
} from "@/db/schema";
import type { SponsorshipResult } from "./types";
import type { SponsorBillingMode } from "./purchase-mode";
import { isSponsorCurrency, type SponsorCurrency } from "./pricing";
import { prepareMonthlyRenewal } from "./monthly-renewal";

export async function startOwnMonthlyRenewal(): Promise<SponsorshipResult<{ url: string }>> {
  const owner = await verifiedSponsorOwner("write");
  if (!owner) return { ok: false, code: "unauthenticated", message: "Sign in to change billing." };
  if (!sponsorCheckoutEnabled("subscription")) return { ok: false, code: "unavailable", message: "Monthly checkout is currently unavailable." };
  const provider = sponsorBillingProvider();
  const expired = await withSponsorWrite(async tx => tx.select().from(sponsorCheckouts).where(and(
    eq(sponsorCheckouts.ownerUserId, owner), eq(sponsorCheckouts.state, "reserved"),
  )));
  for (const checkout of expired) {
    if (checkout.snapshot?.renewal && !checkout.releasedAt && checkout.expiresAt && checkout.expiresAt <= new Date())
      await reconcileSponsorCheckout(checkout.id, provider);
  }
  const prepared = await prepareMonthlyRenewal(owner, process.env.STRIPE_SPONSOR_PRICE_ID!, provider);
  if (!prepared.ok) return prepared;
  return { ok: true, value: { url: await ensureSponsorCheckoutSession(prepared.value.checkoutId, provider) } };
}
export function sponsorCheckoutEnabled(mode: SponsorBillingMode = "subscription") {
  return (
    sponsorshipWritesEnabled() &&
    process.env.SPONSORSHIP_CHECKOUT_ENABLED === "true" &&
    stripeCheckoutConfigured(mode)
  );
}
export async function startSponsorCheckout(
  checkoutId: string,
  billingMode: SponsorBillingMode,
  currency?: SponsorCurrency,
): Promise<SponsorshipResult<{ url: string }>> {
  if (currency !== undefined && !isSponsorCurrency(currency))
    return { ok: false, code: "invalid_input", message: "Choose a supported currency." };
  const owner = await verifiedSponsorOwner("write");
  if (!owner)
    return {
      ok: false,
      code: "unauthenticated",
      message: "Verify sponsor access before checkout.",
    };
  if (!sponsorCheckoutEnabled(billingMode))
    return {
      ok: false,
      code: "unavailable",
      message:
        "Test checkout is not configured yet. Your saved preparation remains private.",
    };
  // Reject foreign IDs before any provider operation, including maintenance.
  const own = await withSponsorWrite(
    async (tx) =>
      (
        await tx
          .select({ id: sponsorCheckouts.id, state: sponsorCheckouts.state, priceId: sponsorCheckouts.priceId, billingMode: sponsorCheckouts.billingMode })
          .from(sponsorCheckouts)
          .where(
            and(
              eq(sponsorCheckouts.id, checkoutId),
              eq(sponsorCheckouts.ownerUserId, owner),
            ),
          )
      )[0],
  );
  if (!own)
    return {
      ok: false,
      code: "forbidden",
      message: "Owned preparation not found.",
    };
  await runSponsorMaintenance();
  if (own.state === "reserved" && own.billingMode !== billingMode)
    return { ok: false, code: "conflict", message: "This checkout already has reserved payment terms." };
  const provider = sponsorBillingProvider(),
    pinned = own.state === "reserved" && own.priceId,
    priceId = pinned || (billingMode === "one_time" ? process.env.STRIPE_SPONSOR_ONE_TIME_PRICE_ID : process.env.STRIPE_SPONSOR_PRICE_ID)!;
  if (!pinned) await provider.price(priceId, billingMode);
  const reserved = await reserveSponsorSeat(owner, checkoutId, priceId, new Date(), billingMode, currency);
  if (!reserved.ok) return reserved;
  return {
    ok: true,
    value: { url: await ensureSponsorCheckoutSession(checkoutId, provider) },
  };
}
export async function createOwnBillingPortal(): Promise<
  SponsorshipResult<{ url: string }>
> {
  const owner = await verifiedSponsorOwner();
  if (!owner)
    return {
      ok: false,
      code: "unauthenticated",
      message: "Sign in to manage billing.",
    };
  // Serialize portal creation with deletion/revocation. Billing remains available
  // when purchases and creative writes are disabled.
  return withSponsorWrite(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"sponsorship:" + owner},0))`,
    );
    const [identity] = await tx
      .select()
      .from(sponsorIdentities)
      .where(eq(sponsorIdentities.userId, owner));
    const [account] = await tx
      .select()
      .from(sponsorAccounts)
      .where(eq(sponsorAccounts.ownerUserId, owner));
    if (
      identity?.state !== "allowed" ||
      !account?.stripeCustomerId ||
      ["revoked", "deleting"].includes(account.state)
    )
      return {
        ok: false,
        code: "forbidden",
        message: "Billing account unavailable.",
      };
    return {
      ok: true,
      value: {
        url: await sponsorBillingProvider().portal(account.stripeCustomerId),
      },
    };
  });
}
export async function readOwnSponsorDashboard() {
  const owner = await verifiedSponsorOwner();
  if (!owner) return null;
  return withSponsorWrite(async (tx) => {
    const [identity] = await tx
      .select()
      .from(sponsorIdentities)
      .where(eq(sponsorIdentities.userId, owner));
    if (identity?.state !== "allowed") return null;
    const [account] = await tx
      .select()
      .from(sponsorAccounts)
      .where(eq(sponsorAccounts.ownerUserId, owner));
    if (account && ["revoked", "deleting"].includes(account.state)) return null;
    const [checkout] = await tx
      .select()
      .from(sponsorCheckouts)
      .where(eq(sponsorCheckouts.ownerUserId, owner))
      .orderBy(sql`${sponsorCheckouts.createdAt} desc`)
      .limit(1);
    const campaigns = await tx
      .select({
        id: sponsors.id,
        title: sponsors.title,
        url: sponsors.url,
        state: sponsors.campaignState,
      })
      .from(sponsors)
      .where(and(eq(sponsors.ownerUserId, owner), isNull(sponsors.deletedAt)));
    const seats = await tx.select().from(sponsorSeats);
    const capacityAvailable =
      seats.length === 4 &&
      seats.some(
        (s) =>
          s.state === "free" ||
          (s.checkoutId === checkout?.id &&
            s.state === "reserved" &&
            s.reservedUntil &&
            s.reservedUntil > new Date()),
      );
    return {
      ownerUserId: owner,
      account: account
        ? {
            state: account.state,
            paidThrough: account.paidThrough?.toISOString() ?? null,
            periodStart: account.periodStart?.toISOString() ?? null,
            ...(account.paidAt ? { paidAt: account.paidAt.toISOString() } : {}),
            recoveryDeadline: account.recoveryDeadline?.toISOString() ?? null,
            cancelAtPeriodEnd: account.cancelAtPeriodEnd,
            billingAvailable: Boolean(account.stripeCustomerId),
            billingCurrency: account.billingCurrency,
            billingMode: account.billingMode,
            billingInterval: account.billingInterval,
            billingIntervalCount: account.billingIntervalCount,
            ...(account.billingMode === "one_time" && account.state === "active" && sponsorCheckoutEnabled("subscription") &&
              account.paidThrough && (account.paidThrough.getTime() > Date.now() + 1810000 ||
                (checkout?.state === "reserved" && checkout.snapshot?.renewal?.accountId === account.id && !checkout.releasedAt &&
                  checkout.expiresAt && checkout.expiresAt > new Date())) ? { monthlyAvailable: true } : {}),
            ...(checkout?.snapshot?.renewal && checkout.state === "completed" && account.stripeSubscriptionId === checkout.stripeSubscriptionId &&
              account.paidThrough?.toISOString() === checkout.snapshot.renewal.startsAt && Date.parse(checkout.snapshot.renewal.startsAt) > Date.now()
              ? { monthlyStartsAt: checkout.snapshot.renewal.startsAt } : {}),
          }
        : null,
      checkout: checkout
        ? {
            id: checkout.id,
            state: checkout.state,
            billingMode: checkout.billingMode,
            ...(checkout.snapshot?.checkoutCurrency ? { currency: checkout.snapshot.checkoutCurrency } : {}),
            paymentReceived: Boolean(checkout.paymentReceivedAt),
            exceptionCode: checkout.exceptionCode,
            ...(checkout.snapshot?.renewal ? { monthlyRenewal: true } : {}),
          }
        : null,
      campaigns,
      checkoutEnabled: sponsorCheckoutEnabled() && sponsorCheckoutEnabled("one_time"),
      capacityAvailable,
    };
  });
}
