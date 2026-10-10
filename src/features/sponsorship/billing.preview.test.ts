import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
vi.mock("server-only", () => ({}));
const access = vi.hoisted(() => ({
  owner: null as string | null,
  portal: vi.fn(async () => "https://billing.stripe.com/fixture"),
}));
vi.mock("./authorization", () => ({
  verifiedSponsorOwner: async () => access.owner,
}));
vi.mock("./stripe-client", async (original) => ({
  ...(await original<typeof import("./stripe-client")>()),
  sponsorBillingProvider: () => ({ portal: access.portal }),
}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: async () => {}, after: vi.fn() }));
vi.mock("@/auth/require-admin", () => ({
  requireAdmin: async () => ({ userId: "user_billing_admin_fixture" }),
}));
vi.mock("@/features/submissions/cleanup", () => ({
  attemptCleanupKey: vi.fn(),
  attemptCleanupJob: vi.fn(),
}));
import {
  sponsorAccounts,
  sponsorBillingEvents,
  adminAuditLogs,
  clerkWebhookReceipts,
  cleanupJobs,
  profileAccounts,
  sponsorAssets,
  sponsorCampaignVersions,
  sponsorCheckouts,
  sponsorIdentities,
  sponsorJobs,
  sponsorSeats,
  sponsorVersionAssets,
  sponsors,
} from "@/db/schema";
import { preparationStore, withSponsorWrite } from "./repository";
import { createPreparationService } from "./campaigns";
import { reserveSponsorSeat } from "./seats";
import {
  ensureSponsorCheckoutSession,
  reconcileSponsorCheckout,
} from "./billing-repository";
import { getDesignSponsors } from "@/data/sponsor-repository";
import { requestWebhookAccountDeletion } from "@/features/profiles/account-lifecycle";
import { administerSponsorBilling } from "./admin-billing";
import { recordStripeWebhook } from "./webhook";
import {
  createOwnBillingPortal,
  readOwnSponsorDashboard,
} from "./billing-service";
import type { BillingObservation } from "./billing";
import type { BillingProvider } from "./stripe-client";
import type { SponsorPromoter } from "./public-media";
import { createPaidCampaignService } from "./paid-campaigns";
const owners: string[] = [];
const events: string[] = [];
afterEach(async () => {
  await withSponsorWrite(async (tx) => {
    if (events.length) {
      await tx.delete(sponsorJobs).where(inArray(sponsorJobs.targetId, events));
      await tx
        .delete(sponsorBillingEvents)
        .where(inArray(sponsorBillingEvents.eventId, events));
    }
    const ps = await tx
      .select()
      .from(sponsorCheckouts)
      .where(inArray(sponsorCheckouts.ownerUserId, owners));
    const accounts = await tx
      .select()
      .from(sponsorAccounts)
      .where(inArray(sponsorAccounts.ownerUserId, owners));
    for (const p of ps)
      await tx
        .update(sponsorSeats)
        .set({
          state: "free",
          checkoutId: null,
          accountId: null,
          reservedUntil: null,
        })
        .where(eq(sponsorSeats.checkoutId, p.id));
    await tx
      .delete(sponsorJobs)
      .where(
        inArray(sponsorJobs.targetId, [...owners, ...ps.map((p) => p.id)]),
      );
    await tx.delete(adminAuditLogs).where(
      inArray(
        adminAuditLogs.resourceId,
        ps.flatMap((p) => [p.id, ...(p.campaignId ? [p.campaignId] : [])]),
      ),
    );
    await tx.delete(clerkWebhookReceipts).where(
      inArray(
        clerkWebhookReceipts.eventId,
        owners.map((owner) => `evt-delete-${owner}`),
      ),
    );
    await tx.delete(cleanupJobs).where(inArray(cleanupJobs.targetId, owners));
    await tx
      .delete(profileAccounts)
      .where(inArray(profileAccounts.userId, owners));
    await tx
      .delete(sponsorVersionAssets)
      .where(inArray(sponsorVersionAssets.ownerUserId, owners));
    await tx
      .delete(sponsorCampaignVersions)
      .where(inArray(sponsorCampaignVersions.ownerUserId, owners));
    await tx
      .delete(sponsorAssets)
      .where(inArray(sponsorAssets.ownerUserId, owners));
    await tx
      .delete(sponsorCheckouts)
      .where(inArray(sponsorCheckouts.ownerUserId, owners));
    await tx.delete(sponsors).where(inArray(sponsors.ownerUserId, owners));
    for (const a of accounts)
      await tx.delete(sponsorAccounts).where(eq(sponsorAccounts.id, a.id));
    await tx
      .delete(sponsorIdentities)
      .where(inArray(sponsorIdentities.userId, owners));
  });
  owners.length = 0;
  events.length = 0;
  vi.unstubAllEnvs();
  access.owner = null;
  access.portal.mockClear();
});
async function fixture(title = "Paid fixture") {
  const owner = `billing-fixture-${randomUUID()}`,
    now = new Date(),
    end = new Date(now.getTime() + 30 * 86400000);
  owners.push(owner);
  await withSponsorWrite((tx) =>
    tx.insert(sponsorIdentities).values({ userId: owner }),
  );
  const service = createPreparationService({
    owner: async () => owner,
    now: () => now,
    store: preparationStore,
  });
  const begun = await service.begin();
  if (!begun.ok) throw Error("Preparation failed");
  const id = begun.value.id,
    iconId = randomUUID(),
    wordmarkId = randomUUID();
  await withSponsorWrite(async (tx) => {
    for (const [assetId, kind] of [
      [iconId, "icon"],
      [wordmarkId, "wordmark"],
    ])
      await tx.insert(sponsorAssets).values({
        id: assetId,
        ownerUserId: owner,
        checkoutId: id,
        kind,
        state: "verified",
        contentType: "image/png",
        sizeBytes: 100,
        width: 64,
        height: 64,
        digest: "a".repeat(64),
        stagingKey: `fixture/${assetId}/staging.png`,
        objectKey: `fixture/${assetId}/source.png`,
        expiresAt: end,
      });
  });
  const saved = await service.save({
    title,
    url: "https://example.invalid",
    expectedRevision: 0,
    iconId,
    wordmarkId,
    variantIds: [],
  });
  if (!saved.ok) throw Error(saved.message);
  const subId = `sub_${randomUUID()}`,
    customerId = `cus_${randomUUID()}`;
  const observation: BillingObservation = {
    subscriptionId: subId,
    customerId,
    checkoutId: id,
    livemode: false,
    price: {
      id: "price_fixture",
      livemode: false,
      active: true,
      currency: "usd",
      unitAmount: 50000,
      interval: "day",
      intervalCount: 30,
      taxBehavior: "exclusive",
    },
    status: "active",
    cancelAtPeriodEnd: false,
    invoices: [
      {
        id: "in_initial",
        paid: true,
        amountPaid: 50000,
        currency: "usd",
        priceId: "price_fixture",
        periodStart: now.getTime(),
        periodEnd: end.getTime(),
      },
    ],
  };
  let completed = false,
    safe = true;
  const provider: BillingProvider = {
    findCheckout: async () => null,
    price: async () => observation.price,
    createCheckout: async (input) => ({
      id: `cs_${id}`,
      checkoutId: id,
      status: "open",
      url: "https://checkout.stripe.com/fixture",
      expiresAt: input.expiresAt,
      subscriptionId: null,
    }),
    session: async () => ({
      id: `cs_${id}`,
      checkoutId: id,
      status: completed ? "complete" : "open",
      url: null,
      expiresAt: now.getTime() + 1805000,
      subscriptionId: completed ? subId : null,
    }),
    expireSession: async () => ({
      id: `cs_${id}`,
      checkoutId: id,
      status: completed ? "complete" : "expired",
      url: null,
      expiresAt: now.getTime(),
      subscriptionId: completed ? subId : null,
    }),
    observe: async () => observation,
    terminate: async () => safe,
    portal: async () => "https://billing.stripe.com/fixture",
    eventTarget: async () => id,
  };
  const promote: SponsorPromoter = async (input) =>
    input.creative.assets
      .filter((a) => a.kind !== "original")
      .map((a) => ({
        id: a.id,
        key: `sponsorships/${input.accountId}/${input.campaignId}/${input.versionId}/${a.id}.png`,
        url: `https://media.example.invalid/${a.id}.png`,
      }));
  return {
    owner,
    id,
    now,
    end,
    service,
    provider,
    observation,
    promote,
    complete: () => {
      completed = true;
    },
    collection: (value: boolean) => {
      safe = value;
    },
  };
}
describe("guarded paid sponsorship lifecycle", () => {
  it("preserves a sponsor's campaign switch during later billing reconciliation", async () => {
    const f = await fixture();
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    access.owner = f.owner;
    const service = createPaidCampaignService({ owner: async () => f.owner, now: () => f.now, promote: f.promote });
    const list = await service.list();
    if (!list.ok) throw Error("list missing");
    const initial = list.value.campaigns[0];
    const { assets: _assets, ...fields } = initial.creative;
    void _assets;
    const draft = await service.save(null, { ...fields, title: "New creative", url: "https://new.example.com", expectedRevision: 0 });
    if (!draft.ok) throw Error(draft.message);
    await service.publish(draft.value.id, draft.value.revision);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    expect((await getDesignSponsors()).filter(s => [draft.value.id, initial.id].includes(s.id))).toMatchObject([{ id: draft.value.id, title: "New creative", url: "https://new.example.com" }]);
  });
  it("persists the EUR monthly terms and exposes them only to the billed owner", async () => {
    const f = await fixture("EUR monthly campaign");
    const monthlyEnd = new Date(f.now);
    monthlyEnd.setUTCMonth(monthlyEnd.getUTCMonth() + 1);
    f.observation.price = { ...f.observation.price, currency: "eur", interval: "month", intervalCount: 1 };
    f.observation.billingAnchor = f.now.getTime();
    f.observation.invoices = [{ ...f.observation.invoices[0], currency: "eur", periodEnd: monthlyEnd.getTime() }];
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    expect(await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now)).toBe(true);
    access.owner = f.owner;
    expect((await readOwnSponsorDashboard())?.account).toMatchObject({ billingCurrency: "eur", billingInterval: "month",
      billingIntervalCount: 1, paidThrough: monthlyEnd.toISOString() });
  });
  it("binds private campaign history and portal customer to the signed-in owner while writes are disabled", async () => {
    const a = await fixture("Owner A campaign"),
      b = await fixture("Owner B campaign");
    for (const f of [a, b]) {
      await reserveSponsorSeat(f.owner, f.id, "price_fixture", new Date());
      await ensureSponsorCheckoutSession(f.id, f.provider);
      f.complete();
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    }
    vi.stubEnv("SPONSORSHIP_WRITES_ENABLED", "false");
    vi.stubEnv("SPONSORSHIP_CHECKOUT_ENABLED", "false");
    access.owner = a.owner;
    const first = await readOwnSponsorDashboard();
    expect(first?.campaigns.map((c) => c.title)).toEqual(["Owner A campaign"]);
    expect((await createOwnBillingPortal()).ok).toBe(true);
    expect(access.portal).toHaveBeenLastCalledWith(a.observation.customerId);
    access.owner = b.owner;
    const second = await readOwnSponsorDashboard();
    expect(second?.campaigns.map((c) => c.title)).toEqual(["Owner B campaign"]);
    expect((await createOwnBillingPortal()).ok).toBe(true);
    expect(access.portal).toHaveBeenLastCalledWith(b.observation.customerId);
    expect(JSON.stringify(second)).not.toContain(a.owner);
    access.owner = "foreign-no-sponsor";
    expect(await readOwnSponsorDashboard()).toBeNull();
    expect(await createOwnBillingPortal()).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(access.portal).toHaveBeenCalledTimes(2);
  });
  it("verifies actual raw Stripe signatures and atomically deduplicates durable receipts and jobs", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
    const stripe = new Stripe("sk_test_fixture"),
      id = `evt_${randomUUID()}`;
    events.push(id);
    const raw = JSON.stringify({
      id,
      object: "event",
      type: "invoice.paid",
      livemode: false,
      data: { object: { id: "in_signed_fixture" } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret: "whsec_fixture",
    });
    expect(await recordStripeWebhook(raw, "invalid")).toMatchObject({
      accepted: false,
    });
    const concurrent = await Promise.all([
      recordStripeWebhook(raw, signature),
      recordStripeWebhook(raw, signature),
    ]);
    expect(concurrent.filter((r) => r.accepted && !r.duplicate)).toHaveLength(
      1,
    );
    expect(concurrent.filter((r) => r.duplicate)).toHaveLength(1);
    const receipts = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(sponsorBillingEvents)
        .where(eq(sponsorBillingEvents.eventId, id)),
    );
    const jobs = await withSponsorWrite((tx) =>
      tx.select().from(sponsorJobs).where(eq(sponsorJobs.targetId, id)),
    );
    expect(receipts).toHaveLength(1);
    expect(jobs).toHaveLength(1);
  });
  it("releases a stale reservation when authoritative provider lookup proves no session was created", async () => {
    const f = await fixture();
    const expiredStart = new Date(Date.now() - 3600000);
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", expiredStart);
    const create = vi.fn(async () => {
      throw Error("Stripe rejects past expiry");
    });
    const provider = {
      ...f.provider,
      createCheckout: create,
      findCheckout: async () => null,
    };
    expect(
      await reconcileSponsorCheckout(f.id, provider, f.promote, f.now),
    ).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(
      await withSponsorWrite((tx) =>
        tx.select().from(sponsorSeats).where(eq(sponsorSeats.checkoutId, f.id)),
      ),
    ).toHaveLength(0);
  });
  it("pins checkout, rejects edits, grants nothing on return, and durably retries paid activation", async () => {
    const f = await fixture();
    expect(
      (await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now)).ok,
    ).toBe(true);
    expect(await ensureSponsorCheckoutSession(f.id, f.provider)).toContain(
      "checkout.stripe.com",
    );
    expect(await f.service.begin()).toMatchObject({
      ok: false,
      code: "conflict",
    });
    expect(
      await withSponsorWrite((tx) =>
        tx
          .select()
          .from(sponsorAccounts)
          .where(eq(sponsorAccounts.ownerUserId, f.owner)),
      ),
    ).toHaveLength(0);
    f.complete();
    expect(
      await reconcileSponsorCheckout(
        f.id,
        f.provider,
        async () => {
          throw Error("storage outage");
        },
        f.now,
      ),
    ).toBe(false);
    const pending = await withSponsorWrite((tx) =>
      tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id, f.id)),
    );
    expect(pending[0]).toMatchObject({
      state: "completed",
      exceptionCode: "activation_pending",
    });
    expect(pending[0].paymentReceivedAt).toBeTruthy();
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now),
    ).toBe(true);
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now),
    ).toBe(true);
    const publicRows = await getDesignSponsors();
    expect(publicRows.some((c) => c.title === "Paid fixture")).toBe(true);
    expect(JSON.stringify(publicRows)).not.toContain(f.owner);
    expect(JSON.stringify(publicRows)).not.toContain("stripeSubscriptionId");
  });
  it("honors cancellation/expiry independently of jobs and refuses reuse during outstanding collection", async () => {
    const f = await fixture();
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    f.observation.cancelAtPeriodEnd = true;
    await reconcileSponsorCheckout(
      f.id,
      f.provider,
      f.promote,
      new Date(f.end.getTime() - 1),
    );
    const before = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(sponsorAccounts)
        .where(eq(sponsorAccounts.ownerUserId, f.owner)),
    );
    expect(before[0].state).toBe("active");
    await withSponsorWrite((tx) =>
      tx
        .update(sponsorAccounts)
        .set({ paidThrough: new Date(Date.now() - 1000) })
        .where(eq(sponsorAccounts.ownerUserId, f.owner)),
    );
    expect(
      (await getDesignSponsors()).some((c) => c.title === "Paid fixture"),
    ).toBe(false);
    f.collection(false);
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.end),
    ).toBe(false);
    const held = await withSponsorWrite((tx) =>
      tx.select().from(sponsorSeats).where(eq(sponsorSeats.checkoutId, f.id)),
    );
    expect(held[0].state).toBe("releasing");
    f.collection(true);
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.end),
    ).toBe(true);
    const released = await withSponsorWrite((tx) =>
      tx.select().from(sponsorSeats).where(eq(sponsorSeats.checkoutId, f.id)),
    );
    expect(released).toHaveLength(0);
    f.observation.invoices.push({
      ...f.observation.invoices[0],
      id: "in_late",
      periodStart: f.end.getTime(),
      periodEnd: f.end.getTime() + 30 * 86400000,
    });
    await reconcileSponsorCheckout(
      f.id,
      f.provider,
      f.promote,
      new Date(f.end.getTime() + 1000),
    );
    const late = await withSponsorWrite((tx) =>
      tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id, f.id)),
    );
    expect(late[0].exceptionCode).toBe("late_payment_refund_review");
    const account = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(sponsorAccounts)
        .where(eq(sponsorAccounts.ownerUserId, f.owner)),
    );
    expect(account[0].state).toBe("inactive");
  });
  it("keeps the 72-hour recovery deadline and original renewal date", async () => {
    const f = await fixture();
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    f.observation.status = "past_due";
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.end);
    const held = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(sponsorAccounts)
        .where(eq(sponsorAccounts.ownerUserId, f.owner)),
    );
    expect(held[0].recoveryDeadline?.getTime()).toBe(
      f.end.getTime() + 72 * 3600000,
    );
    f.observation.invoices.push({
      ...f.observation.invoices[0],
      id: "in_recovered",
      periodStart: f.end.getTime(),
      periodEnd: f.end.getTime() + 30 * 86400000,
    });
    await reconcileSponsorCheckout(
      f.id,
      f.provider,
      f.promote,
      new Date(f.end.getTime() + 48 * 3600000),
    );
    const recovered = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(sponsorAccounts)
        .where(eq(sponsorAccounts.ownerUserId, f.owner)),
    );
    expect(recovered[0].state).toBe("active");
    expect(recovered[0].paidThrough?.getTime()).toBe(
      f.end.getTime() + 30 * 86400000,
    );
  });
  it("keeps an explicitly resolved late invoice resolved on replay while surfacing a newer payment", async () => {
    const f = await fixture();
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    f.observation.cancelAtPeriodEnd = true;
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.end);
    f.observation.invoices.push({
      ...f.observation.invoices[0],
      id: "in_review",
      periodStart: f.end.getTime(),
      periodEnd: f.end.getTime() + 30 * 86400000,
    });
    const later = new Date(f.end.getTime() + 1000);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, later);
    await administerSponsorBilling("resolve_exception", f.id, f.provider);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, later);
    let rows = await withSponsorWrite((tx) =>
      tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id, f.id)),
    );
    expect(rows[0].exceptionCode).toBeNull();
    f.observation.invoices.push({
      ...f.observation.invoices[1],
      id: "in_newer",
      periodStart: f.end.getTime() + 30 * 86400000,
      periodEnd: f.end.getTime() + 60 * 86400000,
    });
    await reconcileSponsorCheckout(
      f.id,
      f.provider,
      f.promote,
      new Date(f.end.getTime() + 30 * 86400000 + 1000),
    );
    rows = await withSponsorWrite((tx) =>
      tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id, f.id)),
    );
    expect(rows[0].exceptionCode).toBe("late_payment_refund_review");
  });
  it("deletes a sponsor-only identity immediately and never resurrects it on replay", async () => {
    const f = await fixture();
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    expect(
      await requestWebhookAccountDeletion({
        eventId: `evt-delete-${f.owner}`,
        userId: f.owner,
      }),
    ).toMatchObject({ state: "queued" });
    expect(
      await requestWebhookAccountDeletion({
        eventId: `evt-delete-${f.owner}`,
        userId: f.owner,
      }),
    ).toMatchObject({ state: "duplicate" });
    expect(
      (await getDesignSponsors()).some((c) => c.title === "Paid fixture"),
    ).toBe(false);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    const account = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(sponsorAccounts)
        .where(eq(sponsorAccounts.ownerUserId, f.owner)),
    );
    expect(account[0].state).toBe("deleting");
    const jobs = await withSponsorWrite((tx) =>
      tx.select().from(sponsorJobs).where(eq(sponsorJobs.targetId, f.owner)),
    );
    expect(jobs).toHaveLength(1);
  });
  it("queues both sponsor and ordinary cleanup for a dual-capability deletion receipt", async () => {
    const f = await fixture();
    await withSponsorWrite((tx) =>
      tx.insert(profileAccounts).values({ userId: f.owner }),
    );
    await requestWebhookAccountDeletion({
      eventId: `evt-delete-${f.owner}`,
      userId: f.owner,
    });
    const profile = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(profileAccounts)
        .where(eq(profileAccounts.userId, f.owner)),
    );
    expect(profile[0].status).toBe("deleting");
    const sponsor = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(sponsorIdentities)
        .where(eq(sponsorIdentities.userId, f.owner)),
    );
    expect(sponsor[0].state).toBe("deleting");
    const ordinary = await withSponsorWrite((tx) =>
      tx.select().from(cleanupJobs).where(eq(cleanupJobs.targetId, f.owner)),
    );
    const billing = await withSponsorWrite((tx) =>
      tx.select().from(sponsorJobs).where(eq(sponsorJobs.targetId, f.owner)),
    );
    expect(ordinary).toHaveLength(1);
    expect(billing).toHaveLength(1);
  });
});
