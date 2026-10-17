import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const change = vi.hoisted(() => vi.fn());
vi.mock("./billing-service", () => ({ startOwnMonthlyRenewal: change }));
import { POST } from "@/app/api/sponsorship/monthly/route";
beforeEach(() => change.mockReset().mockResolvedValue({ok:true,value:{url:"https://checkout.stripe.com/test"}}));
const request = (body: unknown, origin = "https://inspora.test") => new Request("https://inspora.test/api/sponsorship/monthly", {
  method:"POST", headers:{"Content-Type":"application/json",origin}, body:JSON.stringify(body),
});
it("accepts only an empty same-origin request and leaves ownership/terms to the server", async () => {
  const response = await POST(request({}));
  expect(response.status).toBe(200);
  expect(change).toHaveBeenCalledExactlyOnceWith();
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it.each([{startsAt:"2099-01-01"},{priceId:"price_free"},{accountId:"other"},{currency:"usd"},{checkoutId:"foreign"},[]])("rejects injected plan terms %j", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(change).not.toHaveBeenCalled();
});
it("rejects cross-origin requests before billing work", async () => {
  expect((await POST(request({},"https://attacker.test"))).status).toBe(503);
  expect(change).not.toHaveBeenCalled();
});
it("requires authenticated sponsor access", async () => {
  change.mockResolvedValue({ok:false,code:"unauthenticated",message:"Sign in"});
  expect((await POST(request({}))).status).toBe(401);
});
