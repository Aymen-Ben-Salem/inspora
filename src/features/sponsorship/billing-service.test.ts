import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  owner: "owner-a" as string | null,
  preparation: { id: "checkout-a", state: "ready", priceId: null as string | null, billingMode: "subscription",
    snapshot: undefined as { renewal: object } | undefined, expiresAt: undefined as Date | undefined, releasedAt: null as Date | null },
  price: vi.fn(), reserve: vi.fn(), session: vi.fn(), maintenance: vi.fn(), prepareMonthly: vi.fn(), reconcile: vi.fn(),
}));
vi.mock("./authorization", () => ({ verifiedSponsorOwner: async () => state.owner }));
vi.mock("./config", () => ({ sponsorshipWritesEnabled: () => true }));
vi.mock("./stripe-client", () => ({ stripeCheckoutConfigured: () => true, sponsorBillingProvider: () => ({ price: state.price }) }));
vi.mock("./seats", () => ({ reserveSponsorSeat: state.reserve }));
vi.mock("./billing-repository", () => ({ ensureSponsorCheckoutSession: state.session, reconcileSponsorCheckout: state.reconcile }));
vi.mock("./monthly-renewal", () => ({ prepareMonthlyRenewal: state.prepareMonthly }));
vi.mock("./jobs", () => ({ runSponsorMaintenance: state.maintenance }));
vi.mock("./repository", () => ({ withSponsorWrite: async (work: (tx: unknown) => unknown) => work({
  select: () => ({ from: () => ({ where: async () => state.preparation ? [state.preparation] : [] }) }),
}) }));
import { startOwnMonthlyRenewal, startSponsorCheckout } from "./billing-service";
beforeEach(() => {
  vi.clearAllMocks();
  state.owner = "owner-a";
  state.preparation = { id: "checkout-a", state: "ready", priceId: null, billingMode: "subscription", snapshot: undefined, expiresAt: undefined, releasedAt: null };
  vi.stubEnv("SPONSORSHIP_CHECKOUT_ENABLED", "true");
  vi.stubEnv("STRIPE_SPONSOR_PRICE_ID", "price_new450");
  state.reserve.mockResolvedValue({ ok: true });
  state.session.mockResolvedValue("https://checkout.stripe.com/test");
  state.prepareMonthly.mockResolvedValue({ ok: true, value: { checkoutId: "monthly-a" } });
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
it("starts monthly checkout through the server-pinned preparation without global maintenance", async () => {
  expect(await startOwnMonthlyRenewal()).toEqual({ ok: true, value: { url: "https://checkout.stripe.com/test" } });
  expect(state.prepareMonthly).toHaveBeenCalledWith("owner-a", "price_new450", expect.any(Object));
  expect(state.session).toHaveBeenCalledWith("monthly-a", expect.any(Object));
  expect(state.maintenance).not.toHaveBeenCalled();
});
it("reconciles only an expired owned renewal before retrying", async () => {
  state.preparation = { ...state.preparation, state: "reserved", snapshot: { renewal: {} }, expiresAt: new Date(0) };
  await startOwnMonthlyRenewal();
  expect(state.reconcile).toHaveBeenCalledWith("checkout-a", expect.any(Object));
  expect(state.maintenance).not.toHaveBeenCalled();
});
it("does not prepare monthly billing for an unauthenticated caller", async () => {
  state.owner = null;
  expect(await startOwnMonthlyRenewal()).toMatchObject({ ok: false, code: "unauthenticated" });
  expect(state.prepareMonthly).not.toHaveBeenCalled();
  expect(state.session).not.toHaveBeenCalled();
});
it("keeps the dashboard untouched when monthly preparation is rejected", async () => {
  state.prepareMonthly.mockResolvedValueOnce({ ok: false, code: "conflict", message: "An active, paid one-time month is required." });
  expect(await startOwnMonthlyRenewal()).toMatchObject({ ok: false, code: "conflict" });
  expect(state.session).not.toHaveBeenCalled();
});
