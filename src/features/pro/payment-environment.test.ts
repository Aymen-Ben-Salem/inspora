import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { assertProPaymentsEnabled, assertProStripeSecretKey, proSiteOrigin } from "./payment-environment";
import { authorizationConfig } from "../inspora-catalog/mcp-authorization";
import proRehearsal from "../../../config/inspora-pro-rehearsal.json";

const fixture = {
  DATA_ENVIRONMENT: "rehearsal", VERCEL_ENV: "preview", RELEASE_REHEARSAL_TARGET: "pro-fixture",
  DATABASE_URL: "postgresql://fixture:dummy@ep-royal-credit-asjgs5he-pooler.c-4.eu-central-1.aws.neon.tech/neondb",
  DATABASE_URL_UNPOOLED: "postgresql://fixture:dummy@ep-royal-credit-asjgs5he.c-4.eu-central-1.aws.neon.tech/neondb",
  R2_BUCKET_NAME: "inspora-media-preview", R2_SUBMISSIONS_BUCKET_NAME: "inspora-submissions-preview",
  R2_PUBLIC_BASE_URL: "https://pub-718bed60501b40dd93b963d33386383e.r2.dev",
  STRIPE_PRO_REHEARSAL_ACCOUNT_ID: "acct_1USgzLRtLZ8OUdCw", STRIPE_SECRET_KEY: "sk_test_fixture",
  SITE_URL: "http://127.0.0.1:3391", INSPORA_MCP_ACCESS_POLICY: "pro",
  INSPORA_MCP_AUTH_URL: "http://127.0.0.1:3392/internal/authorization", INSPORA_MCP_AUTH_TOKEN: "s".repeat(43),
};

it("permits only test payments on the exact isolated Pro fixture", () => {
  expect(assertProPaymentsEnabled(fixture)).toBe("test");
  expect(() => assertProStripeSecretKey(fixture)).not.toThrow();
  expect(proSiteOrigin(fixture)).toBe(fixture.SITE_URL);
  expect(() => assertProStripeSecretKey({ ...fixture, STRIPE_SECRET_KEY: "sk_live_fixture" })).toThrow(/test key/);
  expect(() => assertProPaymentsEnabled({ ...fixture, PRO_LIVE_PAYMENTS_ENABLED: "true" })).toThrow(/forbidden/);
});

it("rejects a substituted database, media bucket, merchant or deployment marker", () => {
  for (const patch of [
    { DATABASE_URL: "postgresql://fixture:dummy@ep-other.example.neon.tech/neondb" },
    { R2_BUCKET_NAME: "another-bucket" },
    { STRIPE_PRO_REHEARSAL_ACCOUNT_ID: "acct_other" },
    { VERCEL_ENV: "production" },
  ]) expect(() => assertProPaymentsEnabled({ ...fixture, ...patch })).toThrow();
});

it("allows loopback consent only for the guarded fixture and correct local site", () => {
  expect(authorizationConfig(fixture)).toMatchObject({ site: fixture.SITE_URL, origin: "http://127.0.0.1:3392", policy: "pro" });
  for (const patch of [
    { SITE_URL: "https://www.inspora.design" },
    { INSPORA_MCP_AUTH_URL: "https://mcp.inspora.design/internal/authorization" },
    { INSPORA_MCP_ACCESS_POLICY: "team" },
    { R2_BUCKET_NAME: "another-bucket" },
    { RELEASE_REHEARSAL_TARGET: "" },
  ]) expect(authorizationConfig({ ...fixture, ...patch })).toBeNull();
});

it("keeps live Pro and ordinary Preview consent gated", () => {
  expect(() => assertProPaymentsEnabled({ DATA_ENVIRONMENT: "production", VERCEL_ENV: "production" })).toThrow(/disabled/);
  expect(authorizationConfig({ ...fixture, RELEASE_REHEARSAL_TARGET: "", DATA_ENVIRONMENT: "preview" })).toBeNull();
});

it("admits only the exact hosted Preview pair with the isolated data and branch", () => {
  const hosted = { ...fixture, SITE_URL: proRehearsal.siteOrigin, INSPORA_MCP_AUTH_URL: proRehearsal.mcpOrigin + "/internal/authorization", VERCEL_GIT_COMMIT_REF: proRehearsal.branch };
  expect(authorizationConfig(hosted)).toMatchObject({ site: proRehearsal.siteOrigin, origin: proRehearsal.mcpOrigin, policy: "pro" });
  for (const patch of [
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_GIT_COMMIT_REF: "preview/archive-updates" },
    { VERCEL_ENV: "production" },
    { SITE_URL: "https://other-preview.vercel.app" },
    { SITE_URL: "https://www.inspora.design" },
    { INSPORA_MCP_AUTH_URL: "https://mcp.inspora.design/internal/authorization" },
    { INSPORA_MCP_AUTH_URL: fixture.INSPORA_MCP_AUTH_URL },
    { SITE_URL: proRehearsal.siteOrigin + "?token=unsafe" },
    { RELEASE_REHEARSAL_TARGET: "" },
  ]) expect(authorizationConfig({ ...hosted, ...patch })).toBeNull();
});
