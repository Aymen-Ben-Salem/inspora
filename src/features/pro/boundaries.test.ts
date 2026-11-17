import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProTestDatabase } from "./test-database";
import { createMcpUsageHandler } from "./mcp-usage";
import { createProWebhookReceiver } from "./webhook";
import { createProAccountActionHandler } from "./account-actions";
import { ProBillingError, type ProService } from "./service";
import { applyPaidSubscriptionInvoice, recordSubscription } from "./repository";

const token = "t".repeat(43);
const user = "user_carol1";
const now = new Date("2027-03-02T00:00:00Z");
let db: Awaited<ReturnType<typeof createProTestDatabase>>;
beforeAll(async () => { db = await createProTestDatabase(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.reset(); });

describe("private MCP usage boundary", () => {
  const defer = vi.fn();
  const handler = () => createMcpUsageHandler({ token, withTx: db.transaction, isTrialUser: (id) => id === "user_team1", manageUrl: "https://preview.test/account/pro", defer, now: () => now });
  const call = (body: unknown, auth = `Bearer ${token}`) => handler()(new Request("https://preview.test/api/internal/pro/mcp-usage", { method: "POST", headers: { authorization: auth }, body: JSON.stringify(body) }));
  async function activePro() {
    await db.transaction(async (tx) => {
      await recordSubscription(tx, { userId: user, stripeSubscriptionId: "sub_1", status: "active", priceId: "price_pro", currentPeriodStart: new Date("2027-03-01Z"), currentPeriodEnd: new Date("2027-04-01Z"), cancelAtPeriodEnd: false, endedAt: null }, now);
      await applyPaidSubscriptionInvoice(tx, { userId: user, stripeSubscriptionId: "sub_1", invoiceId: "in_1", periodStart: new Date("2027-03-01Z"), periodEnd: new Date("2027-04-01Z"), now });
    });
  }

  it("requires the shared token, a bounded schema and a configured token", async () => {
    expect((await call({ action: "access", userId: user }, "Bearer wrong")).status).toBe(401);
    expect((await call({ action: "access", userId: "not-a-user" })).status).toBe(400);
    expect((await call({ action: "reserve", userId: user, operationKey: "short", feature: "mcp_search" })).status).toBe(400);
    const unconfigured = createMcpUsageHandler({ token: undefined, withTx: db.transaction, isTrialUser: () => false, manageUrl: "x", defer });
    expect((await unconfigured(new Request("https://preview.test/x", { method: "POST" }))).status).toBe(404);
  });

  it("keeps the approved team trial explicit and nonbillable", async () => {
    expect(await (await call({ action: "reserve", userId: "user_team1", operationKey: "k".repeat(20), feature: "mcp_search" })).json()).toEqual({ access: "trial" });
    expect(await (await call({ action: "complete", userId: "user_team1", operationKey: "k".repeat(20), resultCount: 3 })).json()).toEqual({ state: "nonbillable" });
  });

  it("denies non-Pro accounts with a management link and no private details", async () => {
    const body = await (await call({ action: "access", userId: user })).json();
    expect(body).toEqual({ access: "denied", reason: "no_account", manage_url: "https://preview.test/account/pro", balance: null });
  });

  it("reserves, settles and reports balances for active Pro", async () => {
    await activePro();
    const key = "op_" + "a".repeat(20);
    expect(await (await call({ action: "reserve", userId: user, operationKey: key, feature: "mcp_search" })).json()).toMatchObject({ access: "pro", state: "reserved", balance: { available: 999 } });
    expect(await (await call({ action: "complete", userId: user, operationKey: key, resultCount: 4 })).json()).toMatchObject({ state: "settled" });
    expect(await (await call({ action: "reserve", userId: user, operationKey: key, feature: "mcp_search" })).json()).toMatchObject({ state: "replayed", balance: { available: 999 } });
    expect(defer).not.toHaveBeenCalled();
  });

  it("fails closed when accounting storage is unavailable", async () => {
    const broken = createMcpUsageHandler({ token, withTx: async () => { throw new Error("down"); }, isTrialUser: () => false, manageUrl: "x", defer });
    const response = await broken(new Request("https://preview.test/x", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "access", userId: user }) }));
    expect(response.status).toBe(503);
  });
});

describe("Pro webhook receiver", () => {
  const event = { id: "evt_1", type: "invoice.paid", livemode: false, objectId: "in_1", objectLivemode: false };
  const make = (handle = vi.fn(async () => "synced"), verify = vi.fn(() => event)) =>
    ({ handle, receive: createProWebhookReceiver({ verify, assertMode: (o) => { if (o.livemode) throw new Error("live"); }, withTx: db.transaction, handle }) });

  it("rejects bad signatures and wrong-mode events without recording them", async () => {
    const { receive, handle } = make(undefined, vi.fn(() => { throw new Error("bad signature"); }));
    expect(await receive("{}", "sig")).toEqual({ status: 400 });
    const live = make(undefined, vi.fn(() => ({ ...event, livemode: true })));
    expect(await live.receive("{}", "sig")).toEqual({ status: 400 });
    expect(handle).not.toHaveBeenCalled();
  });

  it("deduplicates processed events and retries ones whose processing failed", async () => {
    const handle = vi.fn().mockRejectedValueOnce(new Error("provider timeout")).mockResolvedValue("synced");
    const { receive } = make(handle);
    expect(await receive("{}", "sig")).toEqual({ status: 500 });
    expect(await receive("{}", "sig")).toEqual({ status: 202 });
    expect(await receive("{}", "sig")).toEqual({ status: 200, duplicate: true });
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("acknowledges unrelated event types without processing", async () => {
    const { receive, handle } = make(undefined, vi.fn(() => ({ ...event, id: "evt_2", type: "customer.created" })));
    expect(await receive("{}", "sig")).toEqual({ status: 200 });
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("account billing actions", () => {
  const origin = "https://preview.test";
  const service = { startSubscription: vi.fn(async () => ({ id: "cs_1", url: "https://checkout.test/cs_1" })), configureRecharge: vi.fn(async () => undefined), startPack: vi.fn(async () => { throw new ProBillingError("inactive"); }) } as unknown as ProService;
  const handler = createProAccountActionHandler({ identity: async () => ({ userId: user }), service: () => service, siteOrigin: () => origin, enabled: () => true });
  const post = (action: string, body?: unknown, from = origin) => handler(new Request(`${origin}/api/account/pro/${action}`, { method: "POST", headers: { origin: from }, body: body === undefined ? undefined : JSON.stringify(body) }), action);

  it("rejects cross-origin requests and disabled deployments", async () => {
    expect((await post("subscribe", undefined, "https://evil.test")).status).toBe(403);
    const disabled = createProAccountActionHandler({ identity: async () => ({ userId: user }), service: () => service, siteOrigin: () => origin, enabled: () => false });
    expect((await disabled(new Request(origin, { method: "POST", headers: { origin } }), "subscribe")).status).toBe(404);
  });

  it("returns checkout URLs and maps billing errors to clear messages", async () => {
    expect(await (await post("subscribe")).json()).toEqual({ url: "https://checkout.test/cs_1" });
    const refused = await post("pack");
    expect(refused.status).toBe(409);
    expect((await refused.json()).message).toContain("active Inspora Pro");
  });

  it("requires explicit acknowledgement and an offered cap to enable automatic top-up", async () => {
    expect((await post("recharge", { enabled: true, capCents: 1000 })).status).toBe(400);
    expect((await post("recharge", { enabled: true, capCents: 1500, acknowledged: true })).status).toBe(400);
    expect((await post("recharge", { enabled: true, capCents: 1000, acknowledged: true })).status).toBe(200);
    expect(service.configureRecharge).toHaveBeenLastCalledWith(user, true, 1000);
    expect((await post("recharge", { enabled: false })).status).toBe(200);
    expect(service.configureRecharge).toHaveBeenLastCalledWith(user, false, undefined);
  });
});
