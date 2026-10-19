import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Pool } from "@neondatabase/serverless";
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
  creators,
  logos,
  logoMedia,
  posts,
  postMedia,
  websites,
  websiteMedia,
  websiteSections,
  sponsorAssets,
  sponsorCampaignVersions,
  sponsorDeliveryIntervals,
  sponsorDeliveryPeriods,
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
import { queryMetrics } from "@/analytics/first-party/report-query";
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
import { calendarMonthEnd, type SponsorBillingMode } from "./purchase-mode";
import { drainSponsorJobs } from "./jobs";
import { startSponsorCheckout } from "./billing-service";
import { prepareMonthlyRenewal } from "./monthly-renewal";
import { withCampaignWrites } from "./campaign-service";
import { readSponsorBackupReferences } from "../../../scripts/lib/sponsor-backup-references";
import { cleanupDeletedSponsorOwner, queueSponsorIdentityDeletion } from "./deletion";
import { getPublishedLogoAsset } from "@/data/logos-repository";
import { updateAdminCreator } from "@/features/creators/identity";
import { getR2PublicUrl } from "@/storage/r2";
import { createAdminPost } from "@/features/admin/posts-repository";
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
    for (const account of accounts) {
      await tx
        .delete(sponsorDeliveryIntervals)
        .where(eq(sponsorDeliveryIntervals.accountId, account.id));
      await tx
        .delete(sponsorDeliveryPeriods)
        .where(eq(sponsorDeliveryPeriods.accountId, account.id));
    }
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
  vi.restoreAllMocks();
  access.owner = null;
  access.portal.mockClear();
});
async function fixture(
  title = "Paid fixture",
  billingMode: SponsorBillingMode = "subscription",
) {
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
      billingMode,
    }),
    session: async () => ({
      id: `cs_${id}`,
      checkoutId: id,
      status: completed ? "complete" : "open",
      url: null,
      expiresAt: now.getTime() + 1805000,
      subscriptionId:
        completed && billingMode === "subscription" ? subId : null,
      billingMode,
    }),
    expireSession: async () => ({
      id: `cs_${id}`,
      checkoutId: id,
      status: completed ? "complete" : "expired",
      url: null,
      expiresAt: now.getTime(),
      subscriptionId:
        completed && billingMode === "subscription" ? subId : null,
      billingMode,
    }),
    observe: async () => observation,
    observePayment: async () =>
      completed
        ? observation
        : { ...observation, invoices: [], status: "pending" },
    settlePayment: async () => safe,
    terminate: async () => safe,
    portal: async () => "https://billing.stripe.com/fixture",
    eventTarget: async () => id,
  };
  if (billingMode === "one_time") {
    observation.billingMode = billingMode;
    observation.subscriptionId = null;
    observation.price = {
      ...observation.price,
      interval: null,
      intervalCount: null,
    };
    observation.status = "succeeded";
    observation.cancelAtPeriodEnd = true;
    observation.invoices[0].periodEnd = calendarMonthEnd(now.getTime());
  }
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
async function saveDuringSponsorMediaDeletion(save: (key: string, creatorId: string) => Promise<unknown>) {
  const f = await fixture("Concurrent editorial save");
  vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
  await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
  await ensureSponsorCheckoutSession(f.id, f.provider);
  f.complete();
  await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
  const creatorId = randomUUID(), bucket = process.env.R2_BUCKET_NAME!;
  const key = await withSponsorWrite(async tx => {
    const [account] = await tx.select().from(sponsorAccounts).where(eq(sponsorAccounts.ownerUserId, f.owner));
    const [version] = await tx.select().from(sponsorCampaignVersions).where(eq(sponsorCampaignVersions.ownerUserId, f.owner));
    await tx.insert(creators).values({ id: creatorId, name: "Concurrent editorial fixture", avatarUrl: "/brand/default-avatar.svg", recordOrigin: "preview" });
    return `sponsorships/${account.id}/${version.campaignId}/${version.id}/${version.creative.assets[0].id}.png`;
  });
  const bytes = new Set([bucket + "/" + key]);
  const deleting = Promise.withResolvers<void>(), proceed = Promise.withResolvers<void>();
  vi.spyOn(S3Client.prototype, "send").mockImplementation(async command => {
    if (command instanceof DeleteObjectCommand) {
      if (command.input.Bucket === bucket && command.input.Key === key) { deleting.resolve(); await proceed.promise; }
      bytes.delete(command.input.Bucket + "/" + command.input.Key);
    } else if (command instanceof HeadObjectCommand) {
      if (!bytes.has(command.input.Bucket + "/" + command.input.Key)) throw Error("Fixture media no longer exists");
    } else throw Error("Unexpected storage operation");
    return { $metadata: {} };
  });
  let cleanup: Promise<boolean> | undefined, saving: Promise<boolean> | undefined;
  try {
    await requestWebhookAccountDeletion({ eventId: `evt-delete-${f.owner}`, userId: f.owner });
    cleanup = cleanupDeletedSponsorOwner(f.owner, f.provider, f.now);
    await deleting.promise;
    saving = save(key, creatorId).then(() => true, () => false);
    proceed.resolve();
    expect(await cleanup).toBe(true);
    expect(await saving).toBe(false);
    expect(bytes.has(bucket + "/" + key)).toBe(false);
    // The same valid save succeeds when its external media exists again.
    bytes.add(bucket + "/" + key);
    await save(key, creatorId);
  } finally {
    proceed.resolve();
    await cleanup?.catch(() => {});
    await saving;
    await withSponsorWrite(async tx => {
      const rows = await tx.select({ id: posts.id }).from(posts).where(eq(posts.creatorId, creatorId));
      await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.resourceId, [creatorId, ...rows.map(row => row.id)]));
      await tx.delete(posts).where(eq(posts.creatorId, creatorId));
      await tx.delete(creators).where(eq(creators.id, creatorId));
    });
  }
}
async function monthlyFixture(createSession = true) {
  const f = await fixture("Monthly renewal fixture", "one_time");
  vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
  await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now, "one_time");
  await ensureSponsorCheckoutSession(f.id, f.provider);
  f.complete();
  await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
  const startsAt = f.observation.invoices[0].periodEnd;
  const monthly: BillingObservation = { ...f.observation, billingMode:"subscription", subscriptionId:`sub_monthly_${randomUUID()}`,
    checkoutId:"", status:"active", cancelAtPeriodEnd:false, billingAnchor:startsAt,
    price:{...f.observation.price,id:"price_monthly",interval:"month",intervalCount:1}, invoices:[] };
  let complete = false, expired = false, created = false, lost = false, settlement: "safe"|"pending"|"error" = "safe", id = "", expiresAt = f.now.getTime()+1805000;
  const session = () => ({id:`cs_monthly_${id}`,checkoutId:id,billingMode:"subscription" as const,status:complete?"complete":expired?"expired":"open",url:"https://checkout.stripe.com/monthly",expiresAt,subscriptionId:complete?monthly.subscriptionId:null});
  const provider: BillingProvider = { ...f.provider,
    price:async()=>monthly.price,
    createCheckout:vi.fn(async input => { created=true; expiresAt=input.expiresAt; expect(input.renewal).toMatchObject({startsAt:new Date(startsAt).toISOString(),customerId:monthly.customerId}); if(lost){lost=false;throw Error("Lost response");} return session(); }),
    session:async key=>key===`cs_${f.id}`?f.provider.session(key):session(),
    findCheckout:async key=>key===id&&created?session():null,
    expireSession:async()=>{expired=true;return session();},
    observe:async()=>monthly,
    observePayment:async key=>f.provider.observePayment(key),
    terminate:vi.fn(async()=>{monthly.status="canceled";monthly.cancelAtPeriodEnd=true;if(settlement==="error")throw Error("Provider unavailable");return settlement==="safe";}),
    eventTarget:async()=>f.id,
  };
  const prepared = await prepareMonthlyRenewal(f.owner,"price_monthly",provider,f.now);
  if(!prepared.ok)throw Error(prepared.message);
  id=prepared.value.checkoutId;monthly.checkoutId=id;
  if(createSession)await ensureSponsorCheckoutSession(id,provider);
  const account = async()=> (await withSponsorWrite(tx=>tx.select().from(sponsorAccounts).where(eq(sponsorAccounts.ownerUserId,f.owner))))[0];
  return { ...f, provider, monthly, id, sourceId:f.id, startsAt, account,
    completeRenewal:()=>{complete=true;}, loseResponse:()=>{lost=true;}, settlement:(value:typeof settlement)=>{settlement=value;},
    async activate(){complete=true;await reconcileSponsorCheckout(id,provider,f.promote,f.now);},
    refundSource(){f.observation.invoices[0]={...f.observation.invoices[0],id:"refund:in_initial",paid:false,refunded:true,netBaseAmount:0};},
    addPaidMonth(){const invoice={id:"in_monthly_paid",paid:true,amountPaid:50000,currency:"usd",priceId:"price_monthly",periodStart:startsAt,periodEnd:calendarMonthEnd(startsAt),paidAt:startsAt+1000};monthly.invoices=[invoice];return new Date(startsAt+1000);},
  };
}

describe("monthly renewal transition", () => {
  it("carries only the existing paid month, then extends once for a verified monthly invoice", async()=>{
    const f=await monthlyFixture();
    await f.activate();
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,f.now);
    expect(await f.account()).toMatchObject({state:"active",billingMode:"subscription",periodStart:f.now,paidThrough:new Date(f.startsAt)});
    const checkout=(await withSponsorWrite(tx=>tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id,f.id))))[0];
    expect(checkout.paymentReceivedAt).toBeNull();expect(checkout.paidInvoiceId).toBeNull();
    const seats=await withSponsorWrite(tx=>tx.select().from(sponsorSeats).where(eq(sponsorSeats.accountId,checkout.snapshot!.renewal!.accountId)));
    expect(seats).toHaveLength(1);expect(seats[0].checkoutId).toBe(f.id);
    const paidAt=f.addPaidMonth();
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,paidAt);
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,paidAt);
    expect(await f.account()).toMatchObject({state:"active",paidThrough:new Date(calendarMonthEnd(f.startsAt)),periodStart:new Date(f.startsAt)});
    f.refundSource();
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,paidAt);
    await reconcileSponsorCheckout(f.sourceId,f.provider,f.promote,paidAt);
    expect(await f.account()).toMatchObject({state:"active",paidThrough:new Date(calendarMonthEnd(f.startsAt))});
    expect(f.provider.terminate).not.toHaveBeenCalled();
  });
  it("expires an unfinished monthly checkout without removing the original paid seat",async()=>{
    const f=await monthlyFixture();
    const pending=(await withSponsorWrite(tx=>tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id,f.id))))[0];
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,new Date(pending.expiresAt.getTime()+1));
    expect(await f.account()).toMatchObject({state:"active",billingMode:"one_time",paidThrough:new Date(f.startsAt)});
    expect((await withSponsorWrite(tx=>tx.select().from(sponsorSeats).where(eq(sponsorSeats.accountId,pending.snapshot!.renewal!.accountId))))[0].checkoutId).toBe(f.sourceId);
    f.completeRenewal();
    const late=f.addPaidMonth();
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,late);
    expect(await f.account()).toMatchObject({billingMode:"one_time",paidThrough:new Date(f.startsAt)});
    expect((await withSponsorWrite(tx=>tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id,f.id))))[0].exceptionCode).toBe("late_payment_refund_review");
  });
  it.each(["pending","error"] as const)("pauses refunded carried coverage even while subscription settlement is %s",async settlement=>{
    const f=await monthlyFixture();await f.activate();f.refundSource();f.settlement(settlement);
    expect(await reconcileSponsorCheckout(f.id,f.provider,f.promote,f.now)).toBe(false);
    expect((await f.account()).state).toBe("inactive");
    expect((await getDesignSponsors()).some(c=>c.title==="Monthly renewal fixture")).toBe(false);
    const source=(await withSponsorWrite(tx=>tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id,f.sourceId))))[0];
    const [next]=await withSponsorWrite(tx=>tx.insert(sponsorCheckouts).values({ownerUserId:f.owner,campaignId:source.campaignId,state:"ready",snapshot:source.snapshot,expiresAt:new Date(f.startsAt)}).returning());
    await expect(reserveSponsorSeat(f.owner,next.id,"price_fixture",f.now,"one_time")).rejects.toThrow("Sponsor access is unavailable.");
    f.settlement("safe");await reconcileSponsorCheckout(f.id,f.provider,f.promote,f.now);
    const account=await f.account();
    expect(await withSponsorWrite(tx=>tx.select().from(sponsorSeats).where(eq(sponsorSeats.accountId,account.id)))).toHaveLength(0);
  });
  it.each(["refund","dispute"] as const)("withdraws carried access from the original %s webhook even when payment settlement throws",async kind=>{
    const f=await monthlyFixture();await f.activate();
    if(kind==="refund")f.refundSource();else f.observation.invoices[0].disputeState="open";
    vi.spyOn(f.provider,"settlePayment").mockRejectedValueOnce(Error("Provider timeout"));
    await withSponsorWrite(tx=>tx.update(sponsorJobs).set({state:"complete"}).where(inArray(sponsorJobs.targetId,[f.id,f.sourceId])));
    vi.stubEnv("STRIPE_SECRET_KEY","sk_test_fixture");vi.stubEnv("STRIPE_WEBHOOK_SECRET","whsec_fixture");
    const event=`evt_${randomUUID()}`;events.push(event);
    const raw=JSON.stringify({id:event,object:"event",type:kind==="refund"?"charge.refunded":"charge.dispute.created",livemode:false,data:{object:{id:"ch_original"}}});
    const signature=new Stripe("sk_test_fixture").webhooks.generateTestHeaderString({payload:raw,secret:"whsec_fixture"});
    expect(await recordStripeWebhook(raw,signature)).toEqual({accepted:true,duplicate:false});
    await withSponsorWrite(tx=>tx.update(sponsorJobs).set({nextAttemptAt:new Date(0)}).where(eq(sponsorJobs.idempotencyKey,`stripe:${event}`)));
    await drainSponsorJobs(f.provider,1,new Date(f.now.getTime()+60000));
    expect((await f.account()).state).toBe(kind==="refund"?"inactive":"recovery");
    expect((await getDesignSponsors()).some(c=>c.title==="Monthly renewal fixture")).toBe(false);
    expect((await withSponsorWrite(tx=>tx.select().from(sponsorJobs).where(eq(sponsorJobs.targetId,f.id)))).some(job=>job.state==="pending")).toBe(true);
  });
  it("resolves confirmed renewal before expiring the original seat, and never extends an unpaid month",async()=>{
    const f=await monthlyFixture();f.completeRenewal();const expiry=new Date(f.startsAt);
    f.monthly.status="past_due";
    f.monthly.invoices=[{id:"in_zero",paid:true,amountPaid:0,currency:"usd",priceId:"price_monthly",periodStart:f.startsAt,periodEnd:calendarMonthEnd(f.startsAt)}];
    expect(await reconcileSponsorCheckout(f.sourceId,f.provider,f.promote,expiry)).toBe(false);
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,expiry);
    expect(await f.account()).toMatchObject({state:"recovery",paidThrough:expiry});
    const paidAt=f.addPaidMonth();await reconcileSponsorCheckout(f.id,f.provider,f.promote,paidAt);
    expect(await f.account()).toMatchObject({state:"active",paidThrough:new Date(calendarMonthEnd(f.startsAt))});
    await reconcileSponsorCheckout(f.sourceId,f.provider,f.promote,paidAt);
    expect((await withSponsorWrite(tx=>tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id,f.sourceId))))[0].releasedAt).not.toBeNull();
  });
  it("reuses a pinned change after a lost response without changing customer, price, currency, or date",async()=>{
    const f=await monthlyFixture(false);f.loseResponse();
    await expect(ensureSponsorCheckoutSession(f.id,f.provider)).rejects.toThrow("Lost response");
    expect(await ensureSponsorCheckoutSession(f.id,f.provider)).toBe("https://checkout.stripe.com/monthly");
    const calls=vi.mocked(f.provider.createCheckout).mock.calls;
    expect(calls).toHaveLength(2);expect(calls[0][0]).toEqual(calls[1][0]);
    expect(await prepareMonthlyRenewal(f.owner,"price_rotated",f.provider,f.now)).toEqual({ok:true,value:{checkoutId:f.id}});
  });
  it("keeps already-paid time after cancellation, then stops at expiry without monthly payment",async()=>{
    const f=await monthlyFixture();await f.activate();f.monthly.cancelAtPeriodEnd=true;
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,f.now);
    expect(await f.account()).toMatchObject({state:"active",paidThrough:new Date(f.startsAt)});
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,new Date(f.startsAt));
    expect((await f.account()).state).toBe("inactive");
    f.addPaidMonth();await reconcileSponsorCheckout(f.id,f.provider,f.promote,new Date(f.startsAt+1000));
    expect((await f.account()).state).toBe("inactive");
  });
  it.each(["source-settlement","source-final-read","monthly-settlement","monthly-final-read"] as const)("persists reversed-payment withdrawal across %s failures",async scenario=>{
    const f=await monthlyFixture();await f.activate();
    let now=f.now;
    if(scenario.startsWith("monthly")){
      now=f.addPaidMonth();await reconcileSponsorCheckout(f.id,f.provider,f.promote,now);
      f.monthly.invoices[0]={...f.monthly.invoices[0],refunded:true,netBaseAmount:0};
    }else f.refundSource();
    if(scenario.endsWith("settlement"))f.settlement("error");
    else vi.spyOn(f.provider,"observe").mockResolvedValueOnce(f.monthly).mockRejectedValueOnce(Error("Final read failed"));
    expect(await reconcileSponsorCheckout(f.id,f.provider,f.promote,now)).toBe(false);
    const account=await f.account();expect(account.state).toBe("inactive");
    expect(await withSponsorWrite(tx=>tx.select().from(sponsorSeats).where(eq(sponsorSeats.accountId,account.id)))).toHaveLength(1);
  });
  it("rejects plan changes too close to expiry and keeps reserved terms immutable",async()=>{
    const f=await monthlyFixture(false);
    const pending=(await withSponsorWrite(tx=>tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id,f.id))))[0];
    await expect(withSponsorWrite(tx=>tx.update(sponsorCheckouts).set({snapshot:{...pending.snapshot!,renewal:{...pending.snapshot!.renewal!,startsAt:"2099-01-01T00:00:00.000Z"}}}).where(eq(sponsorCheckouts.id,f.id)))).rejects.toThrow();
    await withSponsorWrite(tx=>tx.update(sponsorCheckouts).set({state:"expired",releasedAt:f.now}).where(eq(sponsorCheckouts.id,f.id)));
    expect(await prepareMonthlyRenewal(f.owner,"price_monthly",f.provider,new Date(f.startsAt-1800000))).toMatchObject({ok:false,code:"conflict"});
    expect(f.provider.createCheckout).not.toHaveBeenCalled();
  });
  it("does not transfer an unconfirmed or expired checkout carrying a subscription ID",async()=>{
    const f=await monthlyFixture();
    vi.spyOn(f.provider,"session").mockResolvedValueOnce({id:`cs_monthly_${f.id}`,checkoutId:f.id,status:"expired",url:null,expiresAt:f.now.getTime(),subscriptionId:f.monthly.subscriptionId,billingMode:"subscription"});
    await reconcileSponsorCheckout(f.id,f.provider,f.promote,f.now);
    expect(await f.account()).toMatchObject({state:"active",billingMode:"one_time",paidThrough:new Date(f.startsAt)});
    expect(f.provider.terminate).toHaveBeenCalledOnce();
  });
  it.each(["revoke","delete"] as const)("stops confirmed future collection when the owner is subject to %s",async action=>{
    const f=await monthlyFixture();await f.activate();
    if(action==="revoke"){
      await administerSponsorBilling("revoke",f.id,f.provider);
      await reconcileSponsorCheckout(f.sourceId,f.provider,f.promote,f.now);
      await reconcileSponsorCheckout(f.id,f.provider,f.promote,f.now);
      expect((await f.account()).state).toBe("revoked");
    }else{
      vi.spyOn(S3Client.prototype,"send").mockResolvedValue({$metadata:{httpStatusCode:200}} as never);
      await withSponsorWrite(tx=>queueSponsorIdentityDeletion(tx,f.owner,f.now));
      expect(await cleanupDeletedSponsorOwner(f.owner,f.provider,f.now)).toBe(true);
    }
    expect(f.provider.terminate).toHaveBeenCalled();
    expect((await getDesignSponsors()).some(c=>c.title==="Monthly renewal fixture")).toBe(false);
  });
});

describe("guarded paid sponsorship lifecycle", () => {
  it("records the verified payment date separately from coverage and updates it on renewal", async () => {
    const f = await fixture("Payment date");
    vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
    const paidAt = f.now.getTime() + 90000;
    f.observation.invoices[0].paidAt = paidAt;
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, new Date(paidAt));
    access.owner = f.owner;
    expect((await readOwnSponsorDashboard())?.account).toMatchObject({ periodStart: f.now.toISOString(), paidAt: new Date(paidAt).toISOString() });
    const nextPaidAt = f.end.getTime() + 3600000;
    f.observation.invoices.push({ ...f.observation.invoices[0], id: "in_payment_date_renewal", periodStart: f.end.getTime(), periodEnd: f.end.getTime() + 30 * 86400000, paidAt: nextPaidAt });
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, new Date(nextPaidAt));
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, new Date(nextPaidAt + 60000));
    expect((await readOwnSponsorDashboard())?.account).toMatchObject({ periodStart: f.end.toISOString(), paidAt: new Date(nextPaidAt).toISOString() });
  });
  it.each([
    ["one_time", "eur"], ["one_time", "usd"],
    ["subscription", "eur"], ["subscription", "usd"],
  ] as const)("pins checkout currency across failed responses and retries for %s in %s", async (mode, currency) => {
    const f = await fixture("Regional currency reservation", mode);
    const now = new Date();
    vi.spyOn(Date, "now").mockReturnValue(now.getTime());
    const reserved = await reserveSponsorSeat(f.owner, f.id, "price_fixture", now, mode, currency);
    expect(reserved).toMatchObject({ ok: true, value: { snapshot: { checkoutCurrency: currency } } });
    const create = vi.spyOn(f.provider, "createCheckout");
    create.mockRejectedValueOnce(new Error("Lost provider response"));
    await expect(ensureSponsorCheckoutSession(f.id, f.provider)).rejects.toThrow("Lost provider response");
    expect(await reserveSponsorSeat(f.owner, f.id, "price_fixture", now, mode, currency === "eur" ? "usd" : "eur"))
      .toMatchObject({ ok: false, code: "conflict" });
    expect((await reserveSponsorSeat(f.owner, f.id, "price_fixture", now, mode, currency)).ok).toBe(true);
    await expect(ensureSponsorCheckoutSession(f.id, f.provider)).resolves.toBe("https://checkout.stripe.com/fixture");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toEqual(create.mock.calls[1][0]);
    expect(create.mock.calls[1][0]).toMatchObject({ checkoutId: f.id, billingMode: mode, currency, pinned: true });
    const [stored] = await withSponsorWrite(tx => tx.select().from(sponsorCheckouts).where(eq(sponsorCheckouts.id, f.id)));
    expect(stored.snapshot?.checkoutCurrency).toBe(currency);
    access.owner = f.owner;
    expect((await readOwnSponsorDashboard())?.checkout).toMatchObject({ currency, billingMode: mode });
    f.complete();
    f.observation.price = { ...f.observation.price, currency: currency === "eur" ? "usd" : "eur" };
    await expect(reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now)).rejects.toThrow("Checkout currency mismatch.");
    expect((await readOwnSponsorDashboard())?.account).toBeNull();
    f.observation.price = { ...f.observation.price, currency, unitAmount: currency === "eur" ? 45000 : 50000,
      interval: mode === "subscription" ? "month" : null, intervalCount: mode === "subscription" ? 1 : null };
    f.observation.billingAnchor = f.now.getTime();
    f.observation.invoices[0] = { ...f.observation.invoices[0], currency, amountPaid: f.observation.price.unitAmount!,
      periodEnd: calendarMonthEnd(f.now.getTime()) };
    await expect(reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now)).resolves.toBe(true);
    expect((await readOwnSponsorDashboard())?.account).toMatchObject({ state: "active", billingCurrency: currency, billingMode: mode });
  });
  it.each(["one_time", "subscription"] as const)("restores a dispute won before initial activation for %s", async (mode) => {
    const f = await fixture("Dispute before activation", mode);
    vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now, mode);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    f.observation.invoices[0].disputeState = "open";
    f.observation.invoices[0].netBaseAmount = null;
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    access.owner = f.owner;
    expect((await readOwnSponsorDashboard())?.account?.state).toBe("recovery");
    const campaigns = () => withSponsorWrite(tx => tx.select().from(sponsors).where(eq(sponsors.ownerUserId, f.owner)));
    expect((await campaigns())[0].campaignState).toBe("prepared");
    f.observation.invoices[0].disputeState = undefined;
    f.observation.invoices[0].netBaseAmount = 50000;
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    expect((await readOwnSponsorDashboard())?.account?.state).toBe("active");
    expect((await campaigns())[0].campaignState).toBe("published");
  });
  it.each(["one_time", "subscription"] as const)("reconciles EUR450 disputes and replay safely for %s", async (mode) => {
    const f = await fixture("EUR450 dispute fixture", mode);
    vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
    f.observation.price = { ...f.observation.price, currency: "eur", unitAmount: 45000,
      interval: mode === "one_time" ? null : "month", intervalCount: mode === "one_time" ? null : 1 };
    f.observation.billingAnchor = f.now.getTime();
    f.observation.invoices[0] = { ...f.observation.invoices[0], currency: "eur", amountPaid: 45000,
      periodEnd: calendarMonthEnd(f.now.getTime()) };
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now, mode);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    access.owner = f.owner;
    expect((await readOwnSponsorDashboard())?.account?.state).toBe("active");
    f.observation.invoices[0].disputeState = "open";
    f.observation.invoices[0].netBaseAmount = null;
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    expect(await readOwnSponsorDashboard()).toMatchObject({ account: { state: "recovery" }, checkout: { exceptionCode: "payment_dispute" } });
    const [account] = await withSponsorWrite(tx => tx.select().from(sponsorAccounts).where(eq(sponsorAccounts.ownerUserId, f.owner)));
    const receipts = () => withSponsorWrite(tx => tx.select().from(sponsorDeliveryPeriods).where(eq(sponsorDeliveryPeriods.accountId, account.id)));
    expect((await receipts())[0].baseAmount).toBeNull();
    f.observation.invoices[0].disputeState = undefined;
    f.observation.invoices[0].netBaseAmount = 45000;
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    expect(await readOwnSponsorDashboard()).toMatchObject({ account: { state: "active" }, checkout: { exceptionCode: null } });
    expect((await receipts())[0].baseAmount).toBe(45000);
    f.observation.invoices[0].disputeState = "lost";
    f.observation.invoices[0].netBaseAmount = null;
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    expect((await readOwnSponsorDashboard())?.account?.state).toBe("inactive");
    expect(await withSponsorWrite(tx => tx.select().from(sponsorSeats).where(eq(sponsorSeats.checkoutId, f.id)))).toHaveLength(0);
  });
  it("rejects a concurrent creator avatar save when sponsor cleanup removes the image", async () => {
    await saveDuringSponsorMediaDeletion((key, creatorId) => updateAdminCreator(creatorId, {
      name: "Concurrent editorial fixture", avatarUrl: getR2PublicUrl(key), avatarStorageProvider: "r2", avatarStorageKey: key,
    }));
  });
  it("rejects a concurrent variant-only editorial save when sponsor cleanup removes the image", async () => {
    await saveDuringSponsorMediaDeletion((key, creatorId) => createAdminPost({
      title: "Concurrent design fixture", slug: "concurrent-" + randomUUID(), description: "Fixture", category: "Web", industries: [], colors: [], styles: [], sourceUrl: "https://example.invalid", status: "draft", isFeatured: false,
      creator: { id: creatorId, name: "Concurrent editorial fixture", avatarUrl: "/brand/default-avatar.svg" },
      media: [{ type: "image", url: "/brand/default-avatar.svg", width: 64, height: 64, alt: "Fixture", variants: [{ url: getR2PublicUrl(key), storageKey: key, width: 64, height: 64, bytes: 100, format: "webp" }] }],
    }, { userId: "user_billing_admin_fixture" }));
  });
  it("deletes sponsor-only media but preserves independently referenced editorial images on retry", async () => {
    const f = await fixture("Shared editorial images");
    vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    const creatorId = randomUUID(), logoId = randomUUID(), websiteId = randomUUID(), postId = randomUUID();
    const publicBucket = process.env.R2_BUCKET_NAME!;
    const objects = new Map<string, string>();
    vi.spyOn(S3Client.prototype, "send").mockImplementation(async command => {
      if (!(command instanceof DeleteObjectCommand)) throw Error("Unexpected storage operation");
      objects.delete(command.input.Bucket + "/" + command.input.Key);
      return { $metadata: {} };
    });
    try {
      const keys = await withSponsorWrite(async tx => {
        const [account] = await tx.select().from(sponsorAccounts).where(eq(sponsorAccounts.ownerUserId, f.owner));
        const [version] = await tx.select().from(sponsorCampaignVersions).where(eq(sponsorCampaignVersions.ownerUserId, f.owner));
        const versions = [version];
        for (let revision = 2; revision <= 5; revision++) {
          const [retained] = await tx.insert(sponsorCampaignVersions).values({ campaignId: version.campaignId, ownerUserId: f.owner, revision, creative: version.creative }).returning();
          await tx.insert(sponsorVersionAssets).values(version.creative.assets.map(asset => ({ versionId: retained.id, assetId: asset.id, ownerUserId: f.owner })));
          versions.push(retained);
        }
        const publicKeys = versions.flatMap(v => v.creative.assets.map(asset => `sponsorships/${account.id}/${v.campaignId}/${v.id}/${asset.id}.png`));
        publicKeys.forEach(key => objects.set(publicBucket + "/" + key, "retained image bytes"));
        await tx.insert(creators).values({ id: creatorId, name: "Independent editorial creator", avatarUrl: "https://example.invalid/avatar.png", avatarStorageProvider: "r2", avatarStorageKey: publicKeys[8], recordOrigin: "editorial" });
        await tx.insert(logos).values({ id: logoId, slug: "shared-" + logoId, title: "Independent editorial logo", creatorId, description: "Fixture", industry: "Design", shape: "Abstract", sourceUrl: "https://example.invalid", status: "published", publishedAt: f.now });
        const variant = (key: string) => ({ url: "https://example.invalid/image.webp", storageKey: key, width: 64, height: 64, bytes: 100, format: "webp" as const });
        await tx.insert(logoMedia).values({ logoId, url: "https://example.invalid/logo.png", storageProvider: "r2", storageKey: publicKeys[1], width: 64, height: 64, variants: [variant(publicKeys[2])] });
        await tx.insert(websites).values({ id: websiteId, slug: "shared-" + websiteId, title: "Independent editorial website", tagline: "Fixture", creatorId, description: "Fixture", sourceUrl: "https://example.invalid" });
        await tx.insert(websiteMedia).values({ websiteId, role: "recording", url: "https://example.invalid/recording.mp4", storageProvider: "r2", storageKey: publicKeys[5], width: 64, height: 64, posterUrl: "https://example.invalid/poster.png", posterStorageKey: publicKeys[3], videoPreview: { url: "https://example.invalid/preview.mp4", storageKey: publicKeys[4], width: 64, height: 64, bytes: 100, format: "mp4" } });
        await tx.insert(websiteSections).values({ websiteId, label: "Fixture", position: 0, imageUrl: "https://example.invalid/section.png", imageStorageProvider: "r2", imageStorageKey: publicKeys[6], imageWidth: 64, imageHeight: 64, imageVariants: [variant(publicKeys[7])] });
        await tx.insert(posts).values({ id: postId, title: "Independent editorial design", slug: "shared-" + postId, creatorId, description: "Fixture", sourceUrl: "https://example.invalid", category: "Web" });
        await tx.insert(postMedia).values({ postId, url: "https://example.invalid/design.png", width: 64, height: 64, variants: [variant(publicKeys[9])] });
        return publicKeys;
      });
      await requestWebhookAccountDeletion({ eventId: `evt-delete-${f.owner}`, userId: f.owner });
      expect(await cleanupDeletedSponsorOwner(f.owner, f.provider, f.now)).toBe(true);
      expect(await cleanupDeletedSponsorOwner(f.owner, f.provider, f.now)).toBe(true);
      expect(objects.has(publicBucket + "/" + keys[0])).toBe(false);
      expect(keys.slice(1).every(key => objects.has(publicBucket + "/" + key))).toBe(true);
      expect(await getPublishedLogoAsset(logoId)).toMatchObject({ storageKey: keys[1] });
      access.owner = f.owner;
      expect(await readOwnSponsorDashboard()).toBeNull();
    } finally {
      await withSponsorWrite(async tx => {
        await tx.delete(logos).where(eq(logos.id, logoId));
        await tx.delete(websites).where(eq(websites.id, websiteId));
        await tx.delete(posts).where(eq(posts.id, postId));
        await tx.delete(creators).where(eq(creators.id, creatorId));
      });
    }
  });
  it("keeps signed billing jobs, paid placement and owned history working in a recovery candidate", async () => {
    const f = await fixture("Recovery candidate");
    // Remote database startup must not consume Checkout's creation margin.
    vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    vi.stubEnv("SPONSORSHIP_ENABLED", "true");
    vi.stubEnv("SPONSORSHIP_WRITES_ENABLED", "false");
    vi.stubEnv("SPONSORSHIP_CHECKOUT_ENABLED", "false");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
    access.owner = f.owner;
    expect(await startSponsorCheckout(f.id, "subscription")).toMatchObject({ ok: false, code: "unavailable" });
    let edited = false;
    expect(await withCampaignWrites(async () => { edited = true; })).toMatchObject({ ok: false, code: "unavailable" });
    expect(edited).toBe(false);
    const dashboard = await readOwnSponsorDashboard();
    const campaignId = dashboard!.campaigns[0].id;
    expect((await getDesignSponsors()).some(c => c.id === campaignId)).toBe(true);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      const references = await readSponsorBackupReferences(client);
      expect(references.some(r => r.required && r.key.includes(campaignId))).toBe(true);
      expect(references.some(r => r.required && r.bucket === "inspora-submissions-preview")).toBe(true);
    } finally { client.release(); await pool.end(); }

    f.observation.invoices.push({ ...f.observation.invoices[0], id: "in_recovery_renewal", periodStart: f.end.getTime(), periodEnd: f.end.getTime() + 30 * 86400000 });
    const id = `evt_${randomUUID()}`;
    events.push(id);
    const raw = JSON.stringify({ id, object: "event", type: "invoice.paid", livemode: false, data: { object: { id: "in_recovery_renewal" } } });
    const signature = new Stripe("sk_test_fixture").webhooks.generateTestHeaderString({ payload: raw, secret: "whsec_fixture" });
    expect(await recordStripeWebhook(raw, signature)).toEqual({ accepted: true, duplicate: false });
    expect(await recordStripeWebhook(raw, signature)).toEqual({ accepted: true, duplicate: true });
    expect((await drainSponsorJobs(f.provider, 10, new Date(f.end.getTime() + 1000))).completed).toBeGreaterThan(0);
    const renewed = await readOwnSponsorDashboard();
    expect(renewed?.account?.paidThrough).toEqual(new Date(f.end.getTime() + 30 * 86400000).toISOString());
    expect(renewed?.campaigns.map(c => c.id)).toEqual(dashboard!.campaigns.map(c => c.id));
  });
  it("publishes a single payment once, pins its mode, and releases its seat at calendar expiry", async () => {
    const f = await fixture("Single payment", "one_time");
    vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
    expect(
      await reserveSponsorSeat(
        f.owner,
        f.id,
        "price_fixture",
        f.now,
        "one_time",
      ),
    ).toMatchObject({ ok: true });
    expect(
      await reserveSponsorSeat(
        f.owner,
        f.id,
        "price_fixture",
        f.now,
        "subscription",
      ),
    ).toMatchObject({ ok: false, code: "conflict" });
    await expect(
      withSponsorWrite((tx) =>
        tx
          .update(sponsorCheckouts)
          .set({ billingMode: "subscription" })
          .where(eq(sponsorCheckouts.id, f.id)),
      ),
    ).rejects.toThrow();
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now),
    ).toBe(true);
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now),
    ).toBe(true);
    access.owner = f.owner;
    const end = new Date(calendarMonthEnd(f.now.getTime()));
    expect((await readOwnSponsorDashboard())?.account).toMatchObject({
      state: "active",
      billingMode: "one_time",
      paidThrough: end.toISOString(),
      recoveryDeadline: null,
    });
    expect(
      (await getDesignSponsors()).some((s) => s.title === "Single payment"),
    ).toBe(true);
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, end),
    ).toBe(true);
    expect((await readOwnSponsorDashboard())?.account).toMatchObject({
      state: "inactive",
      recoveryDeadline: null,
    });
    expect(
      await withSponsorWrite((tx) =>
        tx.select().from(sponsorSeats).where(eq(sponsorSeats.checkoutId, f.id)),
      ),
    ).toHaveLength(0);
    expect(
      (await getDesignSponsors()).some((s) => s.title === "Single payment"),
    ).toBe(false);
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, end),
    ).toBe(true);
    expect((await readOwnSponsorDashboard())?.account?.state).toBe("inactive");
    // Simulate a later, independently verified purchase for this same account.
    // Inactive history remains read-only in the UI; this probes replay isolation.
    const nextId = randomUUID(),
      nextEnd = new Date(calendarMonthEnd(end.getTime()));
    await withSponsorWrite(async (tx) => {
      const [old] = await tx
        .select()
        .from(sponsorCheckouts)
        .where(eq(sponsorCheckouts.id, f.id));
      const [account] = await tx
        .select()
        .from(sponsorAccounts)
        .where(eq(sponsorAccounts.ownerUserId, f.owner));
      const [free] = await tx
        .select()
        .from(sponsorSeats)
        .where(eq(sponsorSeats.state, "free"));
      await tx
        .insert(sponsorCheckouts)
        .values({
          ownerUserId: f.owner,
          id: nextId,
          state: "completed",
          billingMode: "one_time",
          snapshot: old.snapshot,
          campaignId: old.campaignId,
          priceId: "price_fixture",
          stripeSessionId: `cs_${nextId}`,
          expiresAt: nextEnd,
        });
      await tx
        .update(sponsorAccounts)
        .set({ state: "active", periodStart: end, paidThrough: nextEnd })
        .where(eq(sponsorAccounts.id, account.id));
      await tx
        .update(sponsorSeats)
        .set({ state: "occupied", accountId: account.id, checkoutId: nextId })
        .where(eq(sponsorSeats.slot, free.slot));
    });
    const before = await readOwnSponsorDashboard();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, end);
    expect((await readOwnSponsorDashboard())?.account).toEqual(before?.account);
    expect(
      (
        await withSponsorWrite((tx) =>
          tx
            .select()
            .from(sponsorSeats)
            .where(eq(sponsorSeats.checkoutId, nextId)),
        )
      )[0].state,
    ).toBe("occupied");
  });
  it("rejects another owner's single payment and holds a processing payment until safe settlement", async () => {
    const a = await fixture("One-time owner A", "one_time"),
      b = await fixture("One-time owner B", "one_time");
    vi.spyOn(Date, "now").mockReturnValue(a.now.getTime());
    await reserveSponsorSeat(
      a.owner,
      a.id,
      "price_fixture",
      new Date(),
      "one_time",
    );
    await ensureSponsorCheckoutSession(a.id, a.provider);
    a.complete();
    b.complete();
    await expect(
      reconcileSponsorCheckout(
        a.id,
        { ...a.provider, observePayment: b.provider.observePayment },
        a.promote,
        a.now,
      ),
    ).rejects.toThrow("ownership");
    expect(
      await withSponsorWrite((tx) =>
        tx
          .select()
          .from(sponsorAccounts)
          .where(eq(sponsorAccounts.ownerUserId, a.owner)),
      ),
    ).toHaveLength(0);
    const pending = {
      ...a.provider,
      observePayment: async () => ({
        ...a.observation,
        invoices: [],
        status: "processing",
      }),
    };
    a.collection(false);
    expect(
      await reconcileSponsorCheckout(a.id, pending, a.promote, a.end),
    ).toBe(false);
    expect(
      (
        await withSponsorWrite((tx) =>
          tx
            .select()
            .from(sponsorSeats)
            .where(eq(sponsorSeats.checkoutId, a.id)),
        )
      )[0].state,
    ).toBe("reserved");
    a.collection(true);
    expect(
      await reconcileSponsorCheckout(a.id, pending, a.promote, a.end),
    ).toBe(true);
    expect(
      await withSponsorWrite((tx) =>
        tx.select().from(sponsorSeats).where(eq(sponsorSeats.checkoutId, a.id)),
      ),
    ).toHaveLength(0);
  });
  it("requires audited resolution for a released single payment without restoring access", async () => {
    const f = await fixture("Late single payment", "one_time");
    vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now, "one_time");
    await ensureSponsorCheckoutSession(f.id, f.provider);
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.end),
    ).toBe(true);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.end);
    const read = async () =>
      (
        await withSponsorWrite((tx) =>
          tx
            .select()
            .from(sponsorCheckouts)
            .where(eq(sponsorCheckouts.id, f.id)),
        )
      )[0];
    expect((await read()).exceptionCode).toBe("late_payment_refund_review");
    f.observation.invoices[0] = {
      ...f.observation.invoices[0],
      id: "refund:in_initial",
      paid: false,
      refunded: true,
      netBaseAmount: 0,
    };
    await administerSponsorBilling("resolve_exception", f.id, f.provider);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.end);
    expect((await read()).exceptionCode).toBeNull();
    expect(
      await withSponsorWrite((tx) =>
        tx
          .select()
          .from(sponsorAccounts)
          .where(eq(sponsorAccounts.ownerUserId, f.owner)),
      ),
    ).toHaveLength(0);
  });
  it("withdraws refunded single-payment promotion and keeps its audited resolution on replay", async () => {
    const f = await fixture("Refunded single payment", "one_time");
    vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now, "one_time");
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    const account = (
      await withSponsorWrite((tx) =>
        tx
          .select()
          .from(sponsorAccounts)
          .where(eq(sponsorAccounts.ownerUserId, f.owner)),
      )
    )[0];
    const paid = await withSponsorWrite((tx) =>
      tx
        .select()
        .from(sponsorDeliveryPeriods)
        .where(eq(sponsorDeliveryPeriods.accountId, account.id)),
    );
    expect(paid).toHaveLength(1);
    expect(paid[0].baseAmount).toBe(50000);
    f.observation.invoices[0] = {
      ...f.observation.invoices[0],
      id: "refund:in_initial",
      paid: false,
      refunded: true,
      netBaseAmount: 0,
    };
    vi.spyOn(f.provider, "settlePayment").mockRejectedValueOnce(Error("Settlement temporarily unavailable"));
    expect(await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now)).toBe(false);
    access.owner = f.owner;
    expect((await readOwnSponsorDashboard())?.account?.state).toBe("inactive");
    expect((await getDesignSponsors()).some(s => s.title === "Refunded single payment")).toBe(false);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    expect(
      (
        await withSponsorWrite((tx) =>
          tx
            .select()
            .from(sponsorDeliveryPeriods)
            .where(eq(sponsorDeliveryPeriods.accountId, account.id)),
        )
      )[0].baseAmount,
    ).toBe(0);
    access.owner = f.owner;
    expect((await readOwnSponsorDashboard())?.account?.state).toBe("inactive");
    expect(
      (await getDesignSponsors()).some(
        (s) => s.title === "Refunded single payment",
      ),
    ).toBe(false);
    expect(
      await withSponsorWrite((tx) =>
        tx.select().from(sponsorSeats).where(eq(sponsorSeats.checkoutId, f.id)),
      ),
    ).toHaveLength(0);
    await administerSponsorBilling("resolve_exception", f.id, f.provider);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    expect(
      (
        await withSponsorWrite((tx) =>
          tx
            .select()
            .from(sponsorCheckouts)
            .where(eq(sponsorCheckouts.id, f.id)),
        )
      )[0].exceptionCode,
    ).toBeNull();
  });
  it.each([["one_time", 49900], ["subscription", 0], ["one_time", null]] as const)(
    "reports the remaining paid fee after a verified %s refund (fee %s)", async (mode, netBaseAmount) => {
      const f = await fixture("Refund-adjusted report", mode);
      await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now, mode);
      await ensureSponsorCheckoutSession(f.id, f.provider);
      f.complete();
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
      const account = (await withSponsorWrite(tx => tx.select().from(sponsorAccounts).where(eq(sponsorAccounts.ownerUserId, f.owner))))[0];
      const invoice = f.observation.invoices[0];
      f.observation.invoices[0] = { ...invoice,
        id: mode === "one_time" ? `refund:${invoice.id}` : invoice.id,
        paid: mode !== "one_time", refunded: true, netBaseAmount,
      };
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
      // Fixed active-time fixture isolates financial adjustment from the real
      // database trigger's wall clock; report aggregation remains actual SQL.
      await withSponsorWrite(tx => tx.update(sponsorDeliveryIntervals)
        .set({ startAt: f.now, endAt: new Date(invoice.periodEnd) })
        .where(eq(sponsorDeliveryIntervals.accountId, account.id)));
      const report = await withSponsorWrite(tx => queryMetrics(tx, account.id, { range: "30d" },
        { start: f.now.toISOString(), end: new Date(invoice.periodEnd).toISOString() }, f.now));
      expect(report.spend).toEqual(netBaseAmount === null ? null : { amount: mode === "one_time" ? 499 : 0, currency: "usd" });
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
      const replay = await withSponsorWrite(tx => queryMetrics(tx, account.id, { range: "30d" },
        { start: f.now.toISOString(), end: new Date(invoice.periodEnd).toISOString() }, f.now));
      expect(replay.spend).toEqual(report.spend);
    },
  );
  it("corrects historical base spend for a verified refund after seat release", async () => {
    const f = await fixture("Late historical refund", "one_time");
    vi.spyOn(Date, "now").mockReturnValue(f.now.getTime());
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now, "one_time");
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    const account = (
      await withSponsorWrite((tx) =>
        tx
          .select()
          .from(sponsorAccounts)
          .where(eq(sponsorAccounts.ownerUserId, f.owner)),
      )
    )[0];
    const end = new Date(calendarMonthEnd(f.now.getTime()));
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, end);
    f.observation.invoices[0] = {
      ...f.observation.invoices[0],
      id: "refund:in_initial",
      paid: false,
      refunded: true,
      netBaseAmount: 0,
    };
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, end);
    expect(
      (
        await withSponsorWrite((tx) =>
          tx
            .select()
            .from(sponsorDeliveryPeriods)
            .where(eq(sponsorDeliveryPeriods.accountId, account.id)),
        )
      )[0].baseAmount,
    ).toBe(0);
    expect(
      (await readOwnSponsorDashboard())?.account?.state ?? "inactive",
    ).toBe("inactive");
  });
  it("preserves a sponsor's campaign switch during later billing reconciliation", async () => {
    const f = await fixture();
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    access.owner = f.owner;
    const service = createPaidCampaignService({
      owner: async () => f.owner,
      now: () => f.now,
      promote: f.promote,
    });
    const list = await service.list();
    if (!list.ok) throw Error("list missing");
    const initial = list.value.campaigns[0];
    const { assets: _assets, ...fields } = initial.creative;
    void _assets;
    const draft = await service.save(null, {
      ...fields,
      title: "New creative",
      url: "https://new.example.com",
      expectedRevision: 0,
    });
    if (!draft.ok) throw Error(draft.message);
    await service.publish(draft.value.id, draft.value.revision);
    await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now);
    expect(
      (await getDesignSponsors()).filter((s) =>
        [draft.value.id, initial.id].includes(s.id),
      ),
    ).toMatchObject([
      {
        id: draft.value.id,
        title: "New creative",
        url: "https://new.example.com",
      },
    ]);
  });
  it("persists the EUR monthly terms and exposes them only to the billed owner", async () => {
    const f = await fixture("EUR monthly campaign");
    const monthlyEnd = new Date(f.now);
    monthlyEnd.setUTCMonth(monthlyEnd.getUTCMonth() + 1);
    f.observation.price = {
      ...f.observation.price,
      currency: "eur",
      interval: "month",
      intervalCount: 1,
    };
    f.observation.billingAnchor = f.now.getTime();
    f.observation.invoices = [
      {
        ...f.observation.invoices[0],
        currency: "eur",
        periodEnd: monthlyEnd.getTime(),
      },
    ];
    await reserveSponsorSeat(f.owner, f.id, "price_fixture", f.now);
    await ensureSponsorCheckoutSession(f.id, f.provider);
    f.complete();
    expect(
      await reconcileSponsorCheckout(f.id, f.provider, f.promote, f.now),
    ).toBe(true);
    access.owner = f.owner;
    expect((await readOwnSponsorDashboard())?.account).toMatchObject({
      billingCurrency: "eur",
      billingInterval: "month",
      billingIntervalCount: 1,
      paidThrough: monthlyEnd.toISOString(),
    });
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
