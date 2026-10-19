import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ update: vi.fn(), audit: vi.fn(), observation: {} as Record<string, unknown> }));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: async () => ({ userId: "admin_fixture" }) }));
vi.mock("@/db/client", () => ({ requireDatabase: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/data/sponsor-repository", () => ({ SPONSOR_CACHE_TAG: "sponsors" }));
vi.mock("./repository", () => ({ withSponsorWrite: async (work: (tx: unknown) => unknown) => work({
  select: () => ({ from: () => ({ where: async () => [{ id: "checkout_fixture", ownerUserId: "owner_fixture",
    exceptionCode: "late_payment_refund_review", billingMode: "one_time", stripeSessionId: "cs_fixture", stripeSubscriptionId: null }] }) }),
  execute: vi.fn(), update: () => ({ set: (values: unknown) => ({ where: async () => state.update(values) }) }),
  insert: () => ({ values: state.audit }),
}) }));
import { administerSponsorBilling } from "./admin-billing";
import type { BillingProvider } from "./stripe-client";

beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({ DATA_ENVIRONMENT: "production", VERCEL_ENV: "production", SPONSORSHIP_LIVE_PAYMENTS_ENABLED: "true" })) vi.stubEnv(key, value);
  state.observation = { livemode: true, price: { livemode: true }, checkoutId: "checkout_fixture", subscriptionId: null,
    billingMode: "one_time", invoices: [{ id: "refund:pi_fixture", refunded: true, periodEnd: 1800000000000 }] };
});
afterEach(() => vi.unstubAllEnvs());
const provider = { observePayment: async () => state.observation } as unknown as BillingProvider;
it("allows audited live payment resolution without creating a refund or restoring access", async () => {
  await administerSponsorBilling("resolve_exception", "checkout_fixture", provider);
  expect(state.update).toHaveBeenCalledWith({ exceptionCode: null, paidInvoiceId: "refund:pi_fixture" });
  expect(state.audit).toHaveBeenCalledOnce();
});
it.each(["observation", "price", "preview", "disabled"])("rejects %s mode conflicts before clearing an exception", async wrong => {
  if (wrong === "observation") state.observation.livemode = false;
  if (wrong === "price") state.observation.price = { livemode: false };
  if (wrong === "preview") { vi.stubEnv("DATA_ENVIRONMENT", "preview"); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("SPONSORSHIP_LIVE_PAYMENTS_ENABLED", "false"); }
  if (wrong === "disabled") vi.stubEnv("SPONSORSHIP_LIVE_PAYMENTS_ENABLED", "false");
  await expect(administerSponsorBilling("resolve_exception", "checkout_fixture", provider)).rejects.toThrow();
  expect(state.update).not.toHaveBeenCalled();
  expect(state.audit).not.toHaveBeenCalled();
});
