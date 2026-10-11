import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createStripeWebhookReceiver } from "./webhook";
describe("durable signed billing ingress", () => {
  const event = {
    id: "evt_1",
    type: "invoice.paid",
    livemode: false,
    data: { object: { id: "in_1" } },
  };
  it("rejects signatures/live objects before recording anything", async () => {
    const record = vi.fn();
    expect(
      await createStripeWebhookReceiver({
        verify: () => {
          throw Error();
        },
        record,
      })("raw", "bad"),
    ).toMatchObject({ accepted: false });
    expect(
      await createStripeWebhookReceiver({
        verify: () => ({ ...event, livemode: true }),
        record,
      })("raw", "sig"),
    ).toMatchObject({ accepted: false });
    expect(record).not.toHaveBeenCalled();
  });
  it("requires durable storage and deduplicates accepted receipts", async () => {
    const receipts = new Set<string>();
    const receiver = createStripeWebhookReceiver({
      verify: () => event,
      record: async (r) => {
        const fresh = !receipts.has(r.eventId);
        receipts.add(r.eventId);
        return fresh;
      },
    });
    expect(await receiver("exact raw body", "sig")).toEqual({
      accepted: true,
      duplicate: false,
    });
    expect(await receiver("exact raw body", "sig")).toEqual({
      accepted: true,
      duplicate: true,
    });
    await expect(
      createStripeWebhookReceiver({
        verify: () => event,
        record: async () => {
          throw Error("database unavailable");
        },
      })("raw", "sig"),
    ).rejects.toThrow();
  });
  it.each(["charge.refunded", "refund.updated"])("queues verified %s so historical spend can be corrected", async (type) => {
    const record = vi.fn(async () => true);
    const receiver = createStripeWebhookReceiver({ verify: () => ({ ...event, type }), record });
    expect(await receiver("raw refund event", "sig")).toEqual({ accepted: true, duplicate: false });
    expect(record).toHaveBeenCalledWith({ eventId: event.id, eventType: type, objectId: "in_1" });
  });
});
