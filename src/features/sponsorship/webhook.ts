import "server-only";
import { sponsorBillingEvents } from "@/db/schema";
import { withSponsorWrite } from "./repository";
import { queueSponsorJob } from "./jobs-store";
import { stripeClient } from "./stripe-client";
type Receipt = { eventId: string; eventType: string; objectId: string };
export function createStripeWebhookReceiver(deps: {
  verify(
    raw: string,
    signature: string,
  ): {
    id: string;
    type: string;
    livemode: boolean;
    data: { object: { id?: string } };
  };
  record(receipt: Receipt): Promise<boolean>;
}) {
  return async (raw: string, signature: string) => {
    let event;
    try {
      event = deps.verify(raw, signature);
    } catch {
      return { accepted: false, duplicate: false };
    }
    if (event.livemode || !event.id || !event.data.object.id)
      return { accepted: false, duplicate: false };
    const supported =
      /^(checkout\.session\.(completed|expired|async_payment_succeeded|async_payment_failed)|customer\.subscription\.(created|updated|deleted)|invoice\.(paid|payment_succeeded|payment_failed|updated|voided|marked_uncollectible))$/;
    if (!supported.test(event.type))
      return { accepted: true, duplicate: false };
    const fresh = await deps.record({
      eventId: event.id,
      eventType: event.type,
      objectId: event.data.object.id,
    });
    return { accepted: true, duplicate: !fresh };
  };
}
export async function recordStripeWebhook(raw: string, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret?.startsWith("whsec_"))
    throw new Error("Stripe webhook is unavailable.");
  const stripe = stripeClient();
  return createStripeWebhookReceiver({
    verify: (body, sig) => {
      const event = stripe.webhooks.constructEvent(body, sig, secret);
      return {
        id: event.id,
        type: event.type,
        livemode: event.livemode,
        data: {
          object: {
            id: "id" in event.data.object ? event.data.object.id : undefined,
          },
        },
      };
    },
    record: (receipt) =>
      withSponsorWrite(async (tx) => {
        const inserted = await tx
          .insert(sponsorBillingEvents)
          .values(receipt)
          .onConflictDoNothing()
          .returning();
        if (!inserted.length) return false;
        await queueSponsorJob(
          tx,
          "event",
          receipt.eventId,
          `stripe:${receipt.eventId}`,
        );
        return true;
      }),
  })(raw, signature);
}
