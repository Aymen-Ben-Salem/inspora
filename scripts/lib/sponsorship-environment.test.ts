import { expect, it } from "vitest";
import { validatePreviewSponsorshipEnvironment, validateSponsorRecoveryEnvironment } from "./sponsorship-environment";

it("requires billing and reporting configuration even when recovery purchases are disabled", () => {
  expect(() => validateSponsorRecoveryEnvironment({ SPONSORSHIP_ENABLED: "true", SPONSORSHIP_WRITES_ENABLED: "false", SPONSORSHIP_CHECKOUT_ENABLED: "false" })).toThrow(/STRIPE_SECRET_KEY/);
  expect(() => validateSponsorRecoveryEnvironment({ SPONSORSHIP_ENABLED: "false" })).toThrow(/paid/);
});
it("permits unconfigured checkout but rejects live keys and incomplete enabled configuration", () => {
  expect(() => validatePreviewSponsorshipEnvironment({})).not.toThrow();
  expect(() =>
    validatePreviewSponsorshipEnvironment({
      STRIPE_SECRET_KEY: "sk_live_fixture",
    }),
  ).toThrow("test");
  expect(() =>
    validatePreviewSponsorshipEnvironment({
      SPONSORSHIP_CHECKOUT_ENABLED: "true",
    }),
  ).toThrow("STRIPE_SECRET_KEY");
});
it("requires explicit tax behavior and a private maintenance credential", () => {
  const values = {
    SPONSORSHIP_CHECKOUT_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_SPONSOR_PRICE_ID: "price_fixture",
    STRIPE_SPONSOR_PORTAL_CONFIGURATION_ID: "bpc_fixture",
    CRON_SECRET: "a".repeat(32),
    SITE_URL: "http://localhost:3000",
    STRIPE_SPONSOR_AUTOMATIC_TAX: "false",
  };
  expect(() => validatePreviewSponsorshipEnvironment(values)).not.toThrow();
  const recovery = { ...values, SPONSORSHIP_ENABLED: "true", SPONSORSHIP_WRITES_ENABLED: "false", SPONSORSHIP_CHECKOUT_ENABLED: "false", ANALYTICS_KEY_ENCRYPTION_SECRET: "k".repeat(32) };
  expect(() => validateSponsorRecoveryEnvironment(recovery)).not.toThrow();
  expect(() => validateSponsorRecoveryEnvironment({ ...recovery, SPONSORSHIP_WRITES_ENABLED: "true" })).toThrow(/disable/);
  expect(() => validateSponsorRecoveryEnvironment({ ...recovery, ANALYTICS_KEY_ENCRYPTION_SECRET: "" })).toThrow(/ANALYTICS/);
  expect(() =>
    validatePreviewSponsorshipEnvironment({ ...values, CRON_SECRET: "short" }),
  ).toThrow();
  expect(() =>
    validatePreviewSponsorshipEnvironment({
      ...values,
      STRIPE_SPONSOR_AUTOMATIC_TAX: "",
    }),
  ).toThrow("tax");
});
