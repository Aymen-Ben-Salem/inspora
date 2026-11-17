import { eq, sql } from "drizzle-orm";
import { proStripeEvents } from "@/db/schema";
import { PRO_STRIPE_EVENTS } from "./service";
import type { WithProTransaction } from "./service";

export type VerifiedProEvent = { id: string; type: string; livemode: boolean; objectId: string | undefined; objectLivemode: boolean | undefined };

/**
 * Dedicated Pro webhook receiver with its own signing secret. Events are
 * deduplicated by ID and reconciled against authoritative Stripe state; a
 * failure leaves the receipt unprocessed and returns 500 so Stripe retries.
 */
export function createProWebhookReceiver(deps: {
  verify(raw: string, signature: string): VerifiedProEvent;
  assertMode(object: { livemode?: boolean }): void;
  withTx: WithProTransaction;
  handle(type: string, objectId: string): Promise<unknown>;
}) {
  return async (raw: string, signature: string): Promise<{ status: 200 | 202 | 400 | 500; duplicate?: boolean }> => {
    let event: VerifiedProEvent;
    try {
      event = deps.verify(raw, signature);
      deps.assertMode(event);
      if (event.objectLivemode !== undefined) deps.assertMode({ livemode: event.objectLivemode });
    } catch {
      return { status: 400 };
    }
    if (!event.id || !event.objectId) return { status: 400 };
    if (!PRO_STRIPE_EVENTS.test(event.type)) return { status: 200 };
    const objectId = event.objectId;
    const fresh = await deps.withTx(async (tx) => {
      const inserted = await tx.insert(proStripeEvents).values({ eventId: event.id, eventType: event.type, objectId }).onConflictDoNothing().returning();
      if (inserted.length) return true;
      const [seen] = await tx.select({ processedAt: proStripeEvents.processedAt }).from(proStripeEvents).where(eq(proStripeEvents.eventId, event.id));
      return !seen?.processedAt;
    });
    if (!fresh) return { status: 200, duplicate: true };
    try {
      await deps.handle(event.type, objectId);
    } catch {
      return { status: 500 };
    }
    await deps.withTx((tx) => tx.update(proStripeEvents).set({ processedAt: sql`now()` }).where(eq(proStripeEvents.eventId, event.id)));
    return { status: 202 };
  };
}
