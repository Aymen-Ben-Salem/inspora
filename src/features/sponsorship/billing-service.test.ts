import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  owner: "owner-a" as string | null,
  preparation: { id: "checkout-a", state: "ready", priceId: null as string | null, billingMode: "subscription" },
  price: vi.fn(), reserve: vi.fn(), session: vi.fn(), maintenance: vi.fn(),
}));
vi.mock("./authorization", () => ({ verifiedSponsorOwner: async () => state.owner }));
vi.mock("./config", () => ({ sponsorshipWritesEnabled: () => true }));
vi.mock("./stripe-client", () => ({ stripeCheckoutConfigured: () => true, sponsorBillingProvider: () => ({ price: state.price }) }));
vi.mock("./seats", () => ({ reserveSponsorSeat: state.reserve }));
vi.mock("./billing-repository", () => ({ ensureSponsorCheckoutSession: state.session }));
vi.mock("./jobs", () => ({ runSponsorMaintenance: state.maintenance }));
vi.mock("./repository", () => ({ withSponsorWrite: async (work: (tx: unknown) => unknown) => work({
  select: () => ({ from: () => ({ where: async () => state.preparation ? [state.preparation] : [] }) }),
}) }));
import { startSponsorCheckout } from "./billing-service";
beforeEach(() => {
  vi.clearAllMocks();
  state.owner = "owner-a";
  state.preparation = { id: "checkout-a", state: "ready", priceId: null, billingMode: "subscription" };
  vi.stubEnv("SPONSORSHIP_CHECKOUT_ENABLED", "true");
  vi.stubEnv("STRIPE_SPONSOR_PRICE_ID", "price_new450");
  state.reserve.mockResolvedValue({ ok: true });
  state.session.mockResolvedValue("https://checkout.stripe.com/test");
});
afterEach(() => vi.unstubAllEnvs());
it("validates the configured price for a new reservation", async () => {
  expect((await startSponsorCheckout("checkout-a", "subscription")).ok).toBe(true);
  expect(state.price).toHaveBeenCalledWith("price_new450", "subscription");
  expect(state.reserve).toHaveBeenCalledWith("owner-a", "checkout-a", "price_new450", expect.any(Date), "subscription", undefined);
});
it("resumes the pinned price after rotation instead of changing reserved terms", async () => {
  state.preparation = { ...state.preparation, state: "reserved", priceId: "price_old500" };
  expect((await startSponsorCheckout("checkout-a", "subscription")).ok).toBe(true);
  expect(state.price).not.toHaveBeenCalled();
  expect(state.reserve).toHaveBeenCalledWith("owner-a", "checkout-a", "price_old500", expect.any(Date), "subscription", undefined);
  expect(state.session).toHaveBeenCalled();
});
it("passes only the selected currency to the atomic reservation", async () => {
  expect((await startSponsorCheckout("checkout-a", "subscription", "eur")).ok).toBe(true);
  expect(state.reserve).toHaveBeenCalledWith("owner-a", "checkout-a", "price_new450", expect.any(Date), "subscription", "eur");
});
it("rejects changes to reserved billing mode", async () => {
  state.preparation = { ...state.preparation, state: "reserved", priceId: "price_old500" };
  expect(await startSponsorCheckout("checkout-a", "one_time")).toMatchObject({ ok: false, code: "conflict" });
  expect(state.reserve).not.toHaveBeenCalled();
  expect(state.session).not.toHaveBeenCalled();
});
it("rejects unauthenticated callers before provider operations", async () => {
  state.owner = null;
  expect(await startSponsorCheckout("checkout-a", "subscription")).toMatchObject({ ok: false, code: "unauthenticated" });
  expect(state.price).not.toHaveBeenCalled();
  expect(state.reserve).not.toHaveBeenCalled();
});
