import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
vi.mock("server-only", () => ({}));
import {
  sponsorCheckouts,
  sponsorAccounts,
  sponsorIdentities,
  sponsorSeats,
  sponsorJobs,
  sponsors,
} from "@/db/schema";
import { withSponsorWrite } from "./repository";
import { reserveSponsorSeat } from "./seats";
const owners: string[] = [],
  ids: string[] = [],
  campaigns: string[] = [];
afterAll(async () => {
  await withSponsorWrite(async (tx) => {
    if (!ids.length) return;
    await tx
      .update(sponsorSeats)
      .set({
        state: "free",
        accountId: null,
        checkoutId: null,
        reservedUntil: null,
      })
      .where(inArray(sponsorSeats.checkoutId, ids));
    await tx.delete(sponsorJobs).where(inArray(sponsorJobs.targetId, ids));
    await tx.delete(sponsorCheckouts).where(inArray(sponsorCheckouts.id, ids));
    await tx.delete(sponsors).where(inArray(sponsors.id, campaigns));
    await tx
      .delete(sponsorAccounts)
      .where(inArray(sponsorAccounts.ownerUserId, owners));
    await tx
      .delete(sponsorIdentities)
      .where(inArray(sponsorIdentities.userId, owners));
  });
});
describe("atomic sponsor seat checkout boundary", () => {
  it("rejects an active paid account without a structural seat", async () => {
    const owner = `seat-fixture-${randomUUID()}`;
    owners.push(owner);
    await withSponsorWrite((tx) =>
      tx.insert(sponsorIdentities).values({ userId: owner }),
    );
    await expect(
      withSponsorWrite((tx) =>
        tx
          .insert(sponsorAccounts)
          .values({ ownerUserId: owner, state: "active" }),
      ),
    ).rejects.toThrow();
  });
  it("reserves only four of five concurrent owned preparations and pins each snapshot", async () => {
    const now = new Date();
    const raceOwners: string[] = [];
    await withSponsorWrite(async (tx) => {
      const seats = await tx.select().from(sponsorSeats);
      if (seats.some((s) => s.state !== "free"))
        throw new Error("Disposable race rehearsal requires four free slots.");
      for (let i = 0; i < 5; i++) {
        const owner = `seat-fixture-${randomUUID()}`,
          id = randomUUID(),
          campaign = randomUUID();
        owners.push(owner);
        raceOwners.push(owner);
        ids.push(id);
        campaigns.push(campaign);
        await tx.insert(sponsorIdentities).values({ userId: owner });
        await tx.insert(sponsors).values({
          id: campaign,
          ownerUserId: owner,
          campaignState: "prepared",
          isActive: false,
          title: "Seat fixture",
          url: "https://example.invalid",
          mediaType: "image",
          mediaWidth: 1200,
          mediaHeight: 800,
        });
        await tx.insert(sponsorCheckouts).values({
          id,
          ownerUserId: owner,
          campaignId: campaign,
          state: "ready",
          expiresAt: new Date(now.getTime() + 86400000),
          snapshot: {
            id: campaign,
            checkoutId: id,
            versionId: randomUUID(),
            revision: 1,
            state: "prepared",
            expiresAt: new Date(now.getTime() + 86400000).toISOString(),
            creative: {
              title: "Seat fixture",
              url: "https://example.invalid",
              tagline: "",
              iconId: randomUUID(),
              wordmarkId: randomUUID(),
              variantIds: [],
              assets: [],
            },
          },
        });
      }
    });
    const results = await Promise.all(
      ids.map((id, i) =>
        reserveSponsorSeat(raceOwners[i], id, "price_fixture", now),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(4);
    expect(results.filter((r) => !r.ok)).toMatchObject([
      { code: "capacity_full" },
    ]);
    const first = results.findIndex((r) => r.ok);
    const repeated = await reserveSponsorSeat(
      raceOwners[first],
      ids[first],
      "price_changed",
      now,
    );
    expect(repeated).toMatchObject({
      ok: true,
      value: { priceId: "price_fixture" },
    });
    const foreign = await reserveSponsorSeat(
      raceOwners[(first + 1) % 5],
      ids[first],
      "price_fixture",
      now,
    );
    expect(foreign).toMatchObject({ ok: false, code: "forbidden" });
    const p = await withSponsorWrite(async (tx) =>
      tx
        .select()
        .from(sponsorCheckouts)
        .where(eq(sponsorCheckouts.id, ids[first])),
    );
    expect(p[0].snapshot?.creative.title).toBe("Seat fixture");
  });
});
