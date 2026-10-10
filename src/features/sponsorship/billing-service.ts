import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { verifiedSponsorOwner } from "./authorization";
import { sponsorshipWritesEnabled } from "./config";
import {
  stripeCheckoutConfigured,
  sponsorBillingProvider,
} from "./stripe-client";
import { reserveSponsorSeat } from "./seats";
import { ensureSponsorCheckoutSession } from "./billing-repository";
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
export function sponsorCheckoutEnabled() {
  return (
    sponsorshipWritesEnabled() &&
    process.env.SPONSORSHIP_CHECKOUT_ENABLED === "true" &&
    stripeCheckoutConfigured()
  );
}
export async function startSponsorCheckout(
  checkoutId: string,
): Promise<SponsorshipResult<{ url: string }>> {
  const owner = await verifiedSponsorOwner("write");
  if (!owner)
    return {
      ok: false,
      code: "unauthenticated",
      message: "Verify sponsor access before checkout.",
    };
  if (!sponsorCheckoutEnabled())
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
          .select({ id: sponsorCheckouts.id })
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
  const provider = sponsorBillingProvider(),
    priceId = process.env.STRIPE_SPONSOR_PRICE_ID!;
  await provider.price(priceId);
  const reserved = await reserveSponsorSeat(owner, checkoutId, priceId);
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
      .where(eq(sponsors.ownerUserId, owner));
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
      account: account
        ? {
            state: account.state,
            paidThrough: account.paidThrough?.toISOString() ?? null,
            periodStart: account.periodStart?.toISOString() ?? null,
            recoveryDeadline: account.recoveryDeadline?.toISOString() ?? null,
            cancelAtPeriodEnd: account.cancelAtPeriodEnd,
            billingAvailable: Boolean(account.stripeCustomerId),
            billingCurrency: account.billingCurrency,
            billingInterval: account.billingInterval,
            billingIntervalCount: account.billingIntervalCount,
          }
        : null,
      checkout: checkout
        ? {
            id: checkout.id,
            state: checkout.state,
            paymentReceived: Boolean(checkout.paymentReceivedAt),
            exceptionCode: checkout.exceptionCode,
          }
        : null,
      campaigns,
      checkoutEnabled: sponsorCheckoutEnabled(),
      capacityAvailable,
    };
  });
}
