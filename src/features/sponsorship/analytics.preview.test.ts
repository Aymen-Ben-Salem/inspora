import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
vi.mock("server-only", () => ({}));
const catalogActor = vi.hoisted(() => ({ userId: "", accountId: "", state: "inactive" }));
vi.mock("./authorization", () => ({ requireSponsorActor: async () => catalogActor }));
import { readOwnAnalyticsCatalog } from "./analytics";
import { withSponsorWrite } from "./repository";
import {
  analyticsEvents,
  analyticsIdentityEpochs,
  analyticsOccurrences,
  analyticsReports,
  sponsorAccounts,
  sponsorCampaignVersions,
  sponsorCheckouts,
  sponsorDeliveryIntervals,
  sponsorDeliveryPeriods,
  sponsorIdentities,
  sponsorSeats,
  sponsors,
} from "@/db/schema";
import { storeAnalyticsEvents } from "@/analytics/first-party/store";
import { queryMetrics } from "@/analytics/first-party/report-query";
import {
  finalizePaidPeriodReport,
  readMetricsReport,
} from "@/analytics/first-party/reports";
import type { AcceptedEvent } from "@/analytics/first-party/types";
import { readIdentityEpoch } from "@/analytics/first-party/epochs";
import { runAnalyticsMaintenance } from "@/analytics/first-party/maintenance";
import { createAnalyticsCollector } from "@/analytics/first-party/collector";
import {
  decodeDeliveryToken,
  issueDeliveryToken,
} from "@/analytics/first-party/context";
import { eligibleDelivery } from "@/analytics/first-party/service";
import { readVisitorContext } from "@/analytics/first-party/identity";
const owners: string[] = [],
  occurrences: string[] = [],
  now = new Date("2026-11-01T12:00:00Z");
async function fixture() {
  const owner = `analytics_test_${randomUUID()}`;
  owners.push(owner);
  const campaignId = randomUUID(),
    versionId = randomUUID();
  const accountId = await withSponsorWrite(async (tx) => {
    await tx.insert(sponsorIdentities).values({ userId: owner });
    const [account] = await tx
      .insert(sponsorAccounts)
      .values({ ownerUserId: owner, state: "inactive" })
      .returning();
    await tx.insert(sponsors).values({
      id: campaignId,
      ownerUserId: owner,
      accountId: account.id,
      campaignState: "draft",
      revision: 1,
      title: "Analytics fixture",
      url: "https://fixture.example",
      isActive: false,
    });
    await tx.insert(sponsorCampaignVersions).values({
      id: versionId,
      campaignId,
      ownerUserId: owner,
      revision: 1,
      creative: {
        title: "Analytics fixture",
        url: "https://fixture.example",
        tagline: "",
        iconId: randomUUID(),
        wordmarkId: randomUUID(),
        assets: [],
        variantIds: [],
      },
    });
    return account.id;
  });
  const event = (
    kind: AcceptedEvent["kind"],
    visitorKey: string | null,
    at = "2026-10-31T12:00:00Z",
    placement: AcceptedEvent["placement"] = "feed",
  ): AcceptedEvent => {
    const occurrenceId = randomUUID();
    occurrences.push(occurrenceId);
    return {
      occurrenceId,
      kind,
      visitorKey,
      countryCode: visitorKey ? "TN" : null,
      device: "desktop",
      referrerDomain: null,
      pageId: randomUUID(),
      path: "/",
      campaignId,
      versionId,
      placement,
      occurredAt: at,
      token: "fixture",
      issuedAt: 0,
      expiresAt: 0,
    };
  };
  return { owner, accountId, campaignId, versionId, event };
}
afterEach(async () => {
  await withSponsorWrite(async (tx) => {
    const accounts = await tx
      .select()
      .from(sponsorAccounts)
      .where(inArray(sponsorAccounts.ownerUserId, owners));
    const campaigns = await tx
      .select({ id: sponsors.id })
      .from(sponsors)
      .where(inArray(sponsors.ownerUserId, owners));
    if (occurrences.length)
      await tx
        .delete(analyticsOccurrences)
        .where(inArray(analyticsOccurrences.occurrenceId, occurrences));
    if (campaigns.length)
      await tx.delete(analyticsEvents).where(
        inArray(
          analyticsEvents.campaignId,
          campaigns.map((c) => c.id),
        ),
      );
    for (const account of accounts) {
      await tx
        .update(sponsorSeats)
        .set({
          state: "free",
          accountId: null,
          checkoutId: null,
          reservedUntil: null,
        })
        .where(eq(sponsorSeats.accountId, account.id));
      await tx
        .delete(analyticsReports)
        .where(eq(analyticsReports.scope, account.id));
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
      .delete(sponsorCheckouts)
      .where(inArray(sponsorCheckouts.ownerUserId, owners));
    await tx.delete(sponsors).where(inArray(sponsors.ownerUserId, owners));
    await tx
      .delete(sponsorAccounts)
      .where(inArray(sponsorAccounts.ownerUserId, owners));
    await tx
      .delete(sponsorIdentities)
      .where(inArray(sponsorIdentities.userId, owners));
  });
  owners.length = 0;
  occurrences.length = 0;
  vi.unstubAllEnvs();
});
it("durably deduplicates concurrent retries and new occurrence IDs for one impression and rejects conflicting reuse", async () => {
  const f = await fixture(),
    event = f.event("sponsor_impression", "2026-10:fixture");
  const responses = await Promise.all([
    storeAnalyticsEvents([event], now),
    storeAnalyticsEvents([event], now),
  ]);
  expect(responses.flatMap((r) => r.accepted)).toEqual([event.occurrenceId]);
  const clone = { ...event, occurrenceId: randomUUID() };
  occurrences.push(clone.occurrenceId);
  expect(await storeAnalyticsEvents([clone], now)).toMatchObject({
    duplicate: [clone.occurrenceId],
  });
  await expect(
    storeAnalyticsEvents([{ ...event, kind: "sponsor_click" }], now),
  ).rejects.toThrow("Occurrence conflict");
  const rows = await withSponsorWrite((tx) =>
    tx
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.campaignId, f.campaignId)),
  );
  expect(rows).toHaveLength(1);
});
it("reconciles signed delivery across all placements and excludes its owner and withdrawn entitlement", async () => {
  vi.stubEnv("ANALYTICS_KEY_ENCRYPTION_SECRET", randomUUID() + randomUUID());
  const f = await fixture();
  await withSponsorWrite(async (tx) => {
    const [seat] = await tx
      .select()
      .from(sponsorSeats)
      .where(eq(sponsorSeats.state, "free"))
      .limit(1)
      .for("update");
    if (!seat) throw Error("Disposable free seat required");
    const checkoutId = randomUUID(),
      expiresAt = new Date(Date.now() + 86400000);
    await tx
      .insert(sponsorCheckouts)
      .values({
        id: checkoutId,
        ownerUserId: f.owner,
        campaignId: f.campaignId,
        state: "completed",
        expiresAt,
      });
    await tx
      .update(sponsorAccounts)
      .set({ state: "active", paidThrough: expiresAt })
      .where(eq(sponsorAccounts.id, f.accountId));
    await tx
      .update(sponsorSeats)
      .set({ state: "occupied", accountId: f.accountId, checkoutId })
      .where(eq(sponsorSeats.slot, seat.slot));
    await tx
      .update(sponsors)
      .set({ campaignState: "published" })
      .where(eq(sponsors.id, f.campaignId));
  });
  const clock = new Date(Date.now() + 5000),
    pageId = randomUUID(),
    base = {
      pageId,
      path: "/",
      issuedAt: clock.getTime() - 2000,
      expiresAt: clock.getTime() + 298000,
    };
  const event = (
    kind: AcceptedEvent["kind"],
    placement?: "header" | "feed" | "detail",
    milestone?: 25 | 50 | 75 | 100,
  ) => {
    const occurrenceId = randomUUID();
    occurrences.push(occurrenceId);
    return {
      occurrenceId,
      kind,
      occurredAt: new Date(clock.getTime() - 1000).toISOString(),
      token: issueDeliveryToken({
        ...base,
        ...(placement
          ? {
              campaignId: f.campaignId,
              versionId: f.versionId,
              placement,
              previewVideo: placement === "feed",
            }
          : {}),
      }),
      ...(milestone ? { milestone } : {}),
    };
  };
  const events = [
    event("site_page_view"),
    ...(["header", "feed", "detail"] as const).flatMap((placement) => [
      event("sponsor_impression", placement),
      event("sponsor_click", placement),
    ]),
    event("sponsor_preview_started", "feed"),
    event("sponsor_preview_view", "feed"),
    ...([25, 50, 75, 100] as const).map((n) =>
      event("sponsor_preview_progress", "feed", n),
    ),
  ];
  const request = new Request("https://preview.example/api/analytics/events", {
    headers: {
      "x-vercel-forwarded-for": "1.2.3.4",
      "x-vercel-ip-country": "TN",
      "user-agent": "Fixture Browser",
    },
  });
  let actor: string | null = null;
  const collect = createAnalyticsCollector({
    now: () => clock,
    decode: decodeDeliveryToken,
    allowed: async (_r, c, at) => eligibleDelivery(c, actor, clock, at),
    visitor: (r, at) =>
      readVisitorContext(r, at, {
        trusted: true,
        epoch: () => Buffer.alloc(32, 7),
        abuseSecret: Buffer.alloc(32, 8),
      }),
    store: (rows) => storeAnalyticsEvents(rows, clock),
  });
  expect((await collect(request, { events })).accepted).toHaveLength(13);
  expect((await collect(request, { events })).duplicate).toHaveLength(13);
  actor = f.owner;
  expect(
    (await collect(request, { events: [event("sponsor_click", "feed")] }))
      .excluded,
  ).toHaveLength(1);
  actor = null;
  const report = await readMetricsReport(
    f.accountId,
    { range: "1d" },
    false,
    clock,
  );
  expect(report.status).toBe("available");
  if (report.status !== "unavailable") {
    expect(report.summary).toMatchObject({
      impressions: 3,
      clicks: 3,
      uniqueVisitors: 1,
      uniqueClickers: 1,
      previewStarts: 1,
      previewViews: 1,
      progress25: 1,
      progress50: 1,
      progress75: 1,
      progress100: 1,
    });
    expect(
      report.placement.map((r) => [r.label, r.impressions, r.clicks]).sort(),
    ).toEqual([
      ["detail", 1, 1],
      ["feed", 1, 1],
      ["header", 1, 1],
    ]);
    expect(report.country).toMatchObject([
      { label: "TN", impressions: 3, clicks: 3 },
    ]);
  }
  await withSponsorWrite((tx) =>
    tx
      .update(sponsorAccounts)
      .set({ state: "inactive" })
      .where(eq(sponsorAccounts.id, f.accountId)),
  );
  expect(
    (await collect(request, { events: [event("sponsor_click", "feed")] }))
      .excluded,
  ).toHaveLength(1);
  // Site events do not belong to a sponsor; remove only this generated page.
  await withSponsorWrite((tx) =>
    tx.delete(analyticsEvents).where(eq(analyticsEvents.pageId, pageId)),
  );
});
it("unions identities over the whole range and reconciles placement/country/version counts without exposing them", async () => {
  const f = await fixture(),
    other = await fixture();
  await storeAnalyticsEvents(
    [
      f.event(
        "sponsor_impression",
        "2026-10:A",
        "2026-10-30T12:00:00Z",
        "header",
      ),
      f.event("sponsor_impression", "2026-10:A"),
      f.event("sponsor_impression", "2026-11:A", "2026-11-01T11:00:00Z"),
      f.event("sponsor_impression", null),
      f.event("sponsor_click", "2026-10:B"),
      f.event("sponsor_click", "2026-10:B"),
      other.event("sponsor_impression", "2026-10:other"),
    ],
    now,
  );
  const report = await withSponsorWrite((tx) =>
    queryMetrics(
      tx,
      f.accountId,
      { range: "7d" },
      { start: "2026-10-25T12:00:00Z", end: now.toISOString() },
      now,
    ),
  );
  expect(report.summary).toMatchObject({
    impressions: 4,
    clicks: 2,
    uniqueVisitors: 2,
    uniqueClickers: 1,
    ctr: 50,
    frequency: null,
    identityCoverage: 0.75,
  });
  expect(report.country.find((c) => c.label === "Unknown")).toMatchObject({
    impressions: 1,
  });
  expect(report.placement.find((p) => p.label === "header")).toMatchObject({
    impressions: 1,
  });
  expect(report.version).toHaveLength(1);
  expect(report.daily).toHaveLength(3);
  for (const dimension of ["placement", "campaign", "version", "country", "device", "referrer", "daily"] as const) {
    expect(report[dimension].reduce((sum, row) => sum + row.impressions, 0)).toBe(report.summary.impressions);
    expect(report[dimension].reduce((sum, row) => sum + row.clicks, 0)).toBe(report.summary.clicks);
  }
  expect(JSON.stringify(report)).not.toMatch(
    /2026-10:A|2026-11:A|2026-10:B|userId|visitorKey|fixture\.example/,
  );
  const onlyHeader = await withSponsorWrite((tx) =>
    queryMetrics(
      tx,
      f.accountId,
      { range: "7d", placement: "header" },
      { start: "2026-10-25T12:00:00Z", end: now.toISOString() },
      now,
    ),
  );
  expect(onlyHeader.summary).toMatchObject({
    impressions: 1,
    uniqueVisitors: 1,
    clicks: 0,
  });
  const unknownCountry = await withSponsorWrite(tx => queryMetrics(tx, f.accountId,
    { range: "7d", campaignId: f.campaignId, versionId: f.versionId, country: "Unknown" },
    { start: "2026-10-25T12:00:00Z", end: now.toISOString() }, now));
  expect(unknownCountry.summary).toMatchObject({ impressions: 1, clicks: 0, uniqueVisitors: 0, frequency: null });
});
it("loads isolated calendar-date reports and keeps neighboring dates out of their cached totals", async () => {
  const f = await fixture(), other = await fixture();
  await storeAnalyticsEvents([
    f.event("sponsor_impression", "2026-10:A", "2026-10-10T12:00:00Z"),
    f.event("sponsor_click", "2026-10:A", "2026-10-10T13:00:00Z"),
    f.event("sponsor_impression", "2026-10:B", "2026-10-11T12:00:00Z"),
    other.event("sponsor_impression", "2026-10:C", "2026-10-10T12:00:00Z"),
  ], now);
  const first = await readMetricsReport(f.accountId, { range: "1d", endDate: "2026-10-10" }, false, now);
  expect(first.status).toBe("available");
  if (first.status === "unavailable") throw Error("calendar report unavailable");
  expect(first.start).toBe("2026-10-10T00:00:00.000Z");
  expect(first.end).toBe("2026-10-11T00:00:00.000Z");
  expect(first.summary).toMatchObject({ impressions: 1, clicks: 1 });
  const second = await readMetricsReport(f.accountId, { range: "1d", endDate: "2026-10-11" }, false, now);
  if (second.status === "unavailable") throw Error("neighboring report unavailable");
  expect(second.summary).toMatchObject({ impressions: 1, clicks: 0 });
  const cached = await readMetricsReport(f.accountId, { range: "1d", endDate: "2026-10-10" }, false, now);
  expect(cached).toEqual(first);
});
it("rejects version/campaign mismatch at the database boundary", async () => {
  const f = await fixture(),
    other = await fixture();
  await expect(
    storeAnalyticsEvents(
      [{ ...f.event("sponsor_click", null), versionId: other.versionId }],
      now,
    ),
  ).rejects.toThrow();
});
it("offers only retained finalized paid periods in the historical report selector", async () => {
  const f = await fixture(), other = await fixture(), at = new Date();
  Object.assign(catalogActor, { userId: f.owner, accountId: f.accountId });
  const closedId = randomUUID(), expiredId = randomUUID();
  await withSponsorWrite(tx => tx.insert(sponsorDeliveryPeriods).values([
    { id: closedId, accountId: f.accountId, paymentId: randomUUID(),
      startAt: new Date(at.getTime() - 40 * 86400000), endAt: new Date(at.getTime() - 10 * 86400000), baseAmount: 50000, currency: "usd" },
    { accountId: f.accountId, paymentId: randomUUID(),
      startAt: new Date(at.getTime() - 10 * 86400000), endAt: new Date(at.getTime() + 20 * 86400000), baseAmount: 50000, currency: "usd" },
    { accountId: f.accountId, paymentId: randomUUID(),
      startAt: new Date(at.getTime() - 70 * 86400000), endAt: new Date(at.getTime() - 40 * 86400000), baseAmount: 50000, currency: "usd" },
    { id: expiredId, accountId: f.accountId, paymentId: randomUUID(),
      startAt: new Date(at.getTime() - 830 * 86400000), endAt: new Date(at.getTime() - 800 * 86400000), baseAmount: 50000, currency: "usd" },
    { accountId: other.accountId, paymentId: randomUUID(),
      startAt: new Date(at.getTime() - 40 * 86400000), endAt: new Date(at.getTime() - 10 * 86400000), baseAmount: 50000, currency: "usd" },
  ]));
  await finalizePaidPeriodReport(f.accountId, closedId, at);
  await finalizePaidPeriodReport(f.accountId, expiredId, at);
  const catalog = await readOwnAnalyticsCatalog();
  expect(catalog.periods.map(period => period.id)).toEqual([closedId]);
  expect(await readMetricsReport(f.accountId, { range: "7d", periodId: closedId }, false, at))
    .toMatchObject({ status: "available", summary: { impressions: 0 } });
});

it("finalizes closed-period range union reports before raw deletion and serves retained history", async () => {
  const f = await fixture(),
    periodId = randomUUID();
  await withSponsorWrite((tx) =>
    tx.insert(sponsorDeliveryPeriods).values({
      id: periodId,
      accountId: f.accountId,
      paymentId: randomUUID(),
      startAt: new Date("2026-10-01T00:00:00Z"),
      endAt: new Date("2026-11-01T00:00:00Z"),
      baseAmount: 50000,
      currency: "usd",
    }),
  );
  await storeAnalyticsEvents(
    [
      f.event("sponsor_impression", "2026-10:A", "2026-10-30T12:00:00Z"),
      f.event("sponsor_impression", "2026-10:A"),
    ],
    now,
  );
  await finalizePaidPeriodReport(f.accountId, periodId, now);
  await withSponsorWrite((tx) =>
    tx
      .delete(analyticsEvents)
      .where(eq(analyticsEvents.campaignId, f.campaignId)),
  );
  const report = await readMetricsReport(
    f.accountId,
    { range: "7d", periodId },
    false,
    now,
  );
  expect(report.status).toBe("available");
  if (report.status !== "unavailable")
    expect(report.summary).toMatchObject({ impressions: 2, uniqueVisitors: 1 });
  const empty = await readMetricsReport(
    f.accountId,
    { range: "7d", periodId, placement: "detail" },
    false,
    now,
  );
  expect(empty.status).toBe("available");
  if (empty.status !== "unavailable") expect(empty.summary.impressions).toBe(0);
});

it("revises finalized spend after refunds while preserving pruned identity unions", async () => {
  const f = await fixture(),
    periodId = randomUUID(),
    start = new Date("2026-10-01T00:00:00Z"),
    end = new Date("2026-11-01T00:00:00Z");
  await withSponsorWrite(async (tx) => {
    await tx.insert(sponsorDeliveryPeriods).values({
      id: periodId,
      accountId: f.accountId,
      paymentId: randomUUID(),
      startAt: start,
      endAt: end,
      baseAmount: 50000,
      currency: "usd",
    });
    await tx.insert(sponsorDeliveryIntervals).values({
      accountId: f.accountId,
      campaignId: f.campaignId,
      versionId: f.versionId,
      startAt: start,
      endAt: end,
    });
  });
  await storeAnalyticsEvents(
    [
      f.event("sponsor_impression", "2026-10:A"),
      f.event("sponsor_click", "2026-10:A"),
    ],
    now,
  );
  await finalizePaidPeriodReport(f.accountId, periodId, now);
  await withSponsorWrite(async (tx) => {
    await tx
      .delete(analyticsEvents)
      .where(eq(analyticsEvents.campaignId, f.campaignId));
    await tx
      .update(sponsorDeliveryPeriods)
      .set({ baseAmount: 0 })
      .where(eq(sponsorDeliveryPeriods.id, periodId));
  });
  const report = await readMetricsReport(
    f.accountId,
    { range: "7d", periodId },
    false,
    now,
  );
  expect(report.status).toBe("available");
  if (report.status !== "unavailable") {
    expect(report.summary).toMatchObject({
      impressions: 1,
      uniqueVisitors: 1,
      clicks: 1,
    });
    expect(report.spend?.amount).toBe(0);
    expect(report.cpc).toBe(0);
    expect(report.cpm).toBe(0);
  }
});
it("serializes the 240 accepted events per minute budget and acknowledges retries without consuming it", async () => {
  const f = await fixture(),
    visitor = `2026-11:${randomUUID()}`,
    events = Array.from({ length: 240 }, () =>
      f.event("sponsor_click", visitor),
    );
  await storeAnalyticsEvents(events, now);
  expect(await storeAnalyticsEvents([events[0]], now)).toMatchObject({
    duplicate: [events[0].occurrenceId],
  });
  await expect(
    storeAnalyticsEvents([f.event("sponsor_click", visitor)], now),
  ).rejects.toThrow("Analytics rate limit");
});
it("bounds fresh semantic-duplicate receipts while exact occurrence retries remain free", async () => {
  const f = await fixture(),
    event = { ...f.event("sponsor_impression", null), abuseKey: randomUUID() };
  const copies = Array.from({ length: 240 }, () => ({
    ...event,
    occurrenceId: randomUUID(),
  }));
  occurrences.push(...copies.map((e) => e.occurrenceId));
  await storeAnalyticsEvents(copies, now);
  expect((await storeAnalyticsEvents([copies[0]], now)).duplicate).toEqual([
    copies[0].occurrenceId,
  ]);
  const next = { ...event, occurrenceId: randomUUID() };
  occurrences.push(next.occurrenceId);
  await expect(storeAnalyticsEvents([next], now)).rejects.toThrow(
    "Analytics rate limit",
  );
});
it("does not merge unrelated unidentified delivery into a site-wide budget", async () => {
  const f = await fixture(),
    first = randomUUID(),
    second = randomUUID();
  await storeAnalyticsEvents(
    Array.from({ length: 240 }, () => ({
      ...f.event("sponsor_click", null),
      abuseKey: first,
    })),
    now,
  );
  const next = { ...f.event("sponsor_click", null), abuseKey: second };
  expect((await storeAnalyticsEvents([next], now)).accepted).toEqual([
    next.occurrenceId,
  ]);
});
it("destroys expired operational epoch secrets and finalizes exact unions before ninety-day raw pruning", async () => {
  // This globally scheduled path may run only on the disposable database with
  // no pre-existing analytics payloads. Sponsor entity fixtures are preserved.
  await withSponsorWrite(async (tx) => {
    const result = await tx.execute(
      sql`select (select count(*) from analytics_events)+(select count(*) from analytics_identity_epochs)+(select count(*) from analytics_reports) as payloads`,
    );
    expect(Number(result.rows[0].payloads)).toBe(0);
  });
  vi.stubEnv("ANALYTICS_KEY_ENCRYPTION_SECRET", randomUUID() + randomUUID());
  const july = await readIdentityEpoch(
    "2026-07",
    new Date("2026-07-31T23:59:00Z"),
  );
  expect(
    await readIdentityEpoch("2026-07", new Date("2026-08-01T00:10:00Z")),
  ).toEqual(july);
  const august = await readIdentityEpoch(
    "2026-08",
    new Date("2026-08-01T00:10:00Z"),
  );
  expect(august).not.toEqual(july);
  await expect(
    readIdentityEpoch("2026-07", new Date("2026-08-01T01:00:00Z")),
  ).rejects.toThrow("Identity epoch unavailable");
  const f = await fixture(),
    periodId = randomUUID();
  try {
    await withSponsorWrite((tx) =>
      tx.insert(sponsorDeliveryPeriods).values({
        id: periodId,
        accountId: f.accountId,
        paymentId: randomUUID(),
        startAt: new Date("2026-07-01T00:00:00Z"),
        endAt: new Date("2026-08-01T00:00:00Z"),
        baseAmount: 50000,
        currency: "usd",
      }),
    );
    await storeAnalyticsEvents(
      [
        f.event("sponsor_impression", "2026-07:A", "2026-07-30T12:00:00Z"),
        f.event("sponsor_impression", "2026-07:A", "2026-07-31T12:00:00Z"),
      ],
      new Date("2026-07-31T12:00:01Z"),
    );
    expect(await runAnalyticsMaintenance(now)).toMatchObject({
      pruned: true,
      days: 2,
    });
    const report = await readMetricsReport(
      f.accountId,
      { range: "7d", periodId },
      false,
      now,
    );
    expect(report.status).toBe("available");
    if (report.status !== "unavailable")
      expect(report.summary).toMatchObject({
        impressions: 2,
        uniqueVisitors: 1,
      });
    await withSponsorWrite(async (tx) => {
      expect(
        await tx
          .select()
          .from(analyticsEvents)
          .where(eq(analyticsEvents.campaignId, f.campaignId)),
      ).toHaveLength(0);
      expect(await tx.select().from(analyticsIdentityEpochs)).toHaveLength(0);
      const [saved] = await tx
        .select()
        .from(analyticsReports)
        .where(eq(analyticsReports.key, `closed-whole:${periodId}`));
      expect(saved.expiresAt.toISOString()).toBe("2028-08-01T00:00:00.000Z");
    });
  } finally {
    await withSponsorWrite(async (tx) => {
      await tx
        .delete(analyticsIdentityEpochs)
        .where(inArray(analyticsIdentityEpochs.month, ["2026-07", "2026-08"]));
      await tx
        .delete(analyticsReports)
        .where(eq(analyticsReports.scope, "site"));
    });
  }
});
