import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { sponsorAccounts, sponsorCheckouts, sponsorSeats } from "@/db/schema";
import { lockSponsorOwner, withSponsorWrite } from "./repository";
import { queueSponsorJob } from "./jobs-store";
import type { SponsorshipResult } from "./types";
import type { SponsorBillingMode } from "./purchase-mode";
export type ReservedCheckout = typeof sponsorCheckouts.$inferSelect & {
  reservedUntil: Date;
};

export async function reserveSponsorSeat(
  owner: string,
  checkoutId: string,
  priceId: string,
  now = new Date(),
  billingMode: SponsorBillingMode = "subscription",
): Promise<SponsorshipResult<ReservedCheckout>> {
  return withSponsorWrite(async (tx) => {
    await lockSponsorOwner(tx, owner);
    const [p] = await tx
      .select()
      .from(sponsorCheckouts)
      .where(
        and(
          eq(sponsorCheckouts.id, checkoutId),
          eq(sponsorCheckouts.ownerUserId, owner),
        ),
      )
      .for("update");
    if (
      !p ||
      !p.snapshot ||
      !p.campaignId ||
      !["ready", "reserved"].includes(p.state) ||
      p.releasedAt
    )
      return {
        ok: false,
        code: "forbidden",
        message: "Save a valid owned preparation before checkout.",
      };
    const [account] = await tx
      .select()
      .from(sponsorAccounts)
      .where(eq(sponsorAccounts.ownerUserId, owner));
    if (account && account.state !== "inactive")
      return {
        ok: false,
        code: "conflict",
        message:
          "Your sponsor account already has a seat or needs billing resolution.",
      };
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('sponsor-capacity', 0))`,
    );
    const [existing] = await tx
      .select()
      .from(sponsorSeats)
      .where(eq(sponsorSeats.checkoutId, p.id))
      .for("update");
    if (
      existing?.state === "reserved" &&
      existing.reservedUntil &&
      existing.reservedUntil > now
    ) {
      if (p.billingMode !== billingMode || p.priceId !== priceId)
        return { ok: false, code: "conflict", message: "This checkout already has reserved payment terms." };
      return {
        ok: true,
        value: { ...p, reservedUntil: existing.reservedUntil },
      };
    }
    if (p.state !== "ready" || p.expiresAt <= now)
      return {
        ok: false,
        code: "expired",
        message:
          "This checkout expired and must be safely reconciled before starting again.",
      };
    const seats = await tx.select().from(sponsorSeats).for("update");
    if (seats.length !== 4)
      throw new Error("Four structural sponsor seats are required.");
    const free = seats.find((s) => s.state === "free");
    if (!free)
      return {
        ok: false,
        code: "capacity_full",
        message: "All four sponsorship seats are occupied or reserved.",
      };
    // Five seconds accommodates the provider's minimum 30-minute session boundary.
    const reservedUntil = new Date(
      Math.ceil(now.getTime() / 1000) * 1000 + 1805000,
    );
    await tx
      .update(sponsorSeats)
      .set({ state: "reserved", checkoutId: p.id, reservedUntil })
      .where(eq(sponsorSeats.slot, free.slot));
    const [pinned] = await tx
      .update(sponsorCheckouts)
      .set({ state: "reserved", priceId, billingMode })
      .where(eq(sponsorCheckouts.id, p.id))
      .returning();
    await queueSponsorJob(tx, "reconcile", p.id, `checkout:${p.id}`);
    return { ok: true, value: { ...pinned, reservedUntil } };
  });
}
