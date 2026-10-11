import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const start = vi.hoisted(() => vi.fn(async () => ({ ok: true, value: { url: "https://checkout.stripe.com/test" } })));
vi.mock("./billing-service", () => ({ startSponsorCheckout: start }));
import { POST } from "@/app/api/sponsorship/checkout/route";
const checkoutId = "9b9abf77-4a00-4ee1-8a89-68a05cacb2b9";
const request = (body: unknown) => new Request("https://preview.example/api/sponsorship/checkout", {
  method: "POST", headers: { origin: "https://preview.example", "content-type": "application/json" }, body: JSON.stringify(body),
});
it("requires an explicit recognized payment choice before starting checkout", async () => {
  for (const billingMode of [undefined, "monthly", "payment", null]) {
    expect((await POST(request({ checkoutId, billingMode }))).status).toBe(400);
  }
  expect(start).not.toHaveBeenCalled();
  for (const billingMode of ["one_time", "subscription"]) {
    expect((await POST(request({ checkoutId, billingMode }))).status).toBe(200);
    expect(start).toHaveBeenLastCalledWith(checkoutId, billingMode);
  }
});
