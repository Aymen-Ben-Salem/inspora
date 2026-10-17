import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const start = vi.hoisted(() => vi.fn());
vi.mock("./billing-service", () => ({ startSponsorCheckout: start }));
import { POST } from "@/app/api/sponsorship/checkout/route";

const checkoutId = "2412624d-47be-4ada-9448-414d87f21cdd";
function request(extra: object = {}, headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/sponsorship/checkout", {
    method: "POST", headers: { origin: "https://example.com", "content-type": "application/json", ...headers },
    body: JSON.stringify({ checkoutId, billingMode: "one_time", ...extra }),
  });
}
beforeEach(() => { start.mockReset(); start.mockResolvedValue({ ok: true, value: { url: "https://checkout.stripe.com/test" } }); });
it("requires an explicit recognized payment choice before starting checkout", async () => {
  for (const billingMode of [undefined, "monthly", "payment", null]) {
    expect((await POST(request({ billingMode }))).status).toBe(400);
  }
  expect(start).not.toHaveBeenCalled();
  for (const billingMode of ["one_time", "subscription"]) {
    expect((await POST(request({ billingMode }))).status).toBe(200);
    expect(start).toHaveBeenLastCalledWith(checkoutId, billingMode, "usd");
  }
});
it.each(["eur", "usd"])("accepts an explicit supported %s currency", async currency => {
  expect((await POST(request({ currency }))).status).toBe(200);
  expect(start).toHaveBeenCalledWith(checkoutId, "one_time", currency);
});
it.each([["EU", "eur"], ["AF", "usd"]])("uses regional currency for clients without a selection (%s)", async (continent, currency) => {
  expect((await POST(request({}, { "x-vercel-ip-continent": continent }))).status).toBe(200);
  expect(start).toHaveBeenCalledWith(checkoutId, "one_time", currency);
});
it.each([{ currency: "gbp" }, { currency: "EUR" }, { currency: "eur", amount: 1 }, { currency: "usd", priceId: "price_attacker" }])("rejects unsupported currency or client price overrides %j", async extra => {
  expect((await POST(request(extra))).status).toBe(400);
  expect(start).not.toHaveBeenCalled();
});
it("continues rejecting cross-origin checkout requests", async () => {
  expect((await POST(request({ currency: "eur" }, { origin: "https://attacker.example" }))).status).toBe(503);
  expect(start).not.toHaveBeenCalled();
});
