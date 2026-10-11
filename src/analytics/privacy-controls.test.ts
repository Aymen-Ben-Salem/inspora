// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanObsoleteAnalyticsCookies,
  isAnalyticsDisabled,
  setAnalyticsDisabled,
} from "./privacy";
afterEach(() => {
  for (const cookie of document.cookie.split(";"))
    document.cookie = `${cookie.trim().split("=")[0]}=; Path=/; Max-Age=0`;
  vi.unstubAllGlobals();
});
it("gates all collectors with the functional preference, DNT and GPC", () => {
  vi.stubGlobal("navigator", { doNotTrack: "0", globalPrivacyControl: false });
  setAnalyticsDisabled(true);
  expect(isAnalyticsDisabled()).toBe(true);
  setAnalyticsDisabled(false);
  expect(isAnalyticsDisabled()).toBe(false);
  vi.stubGlobal("navigator", { doNotTrack: "1" });
  expect(isAnalyticsDisabled()).toBe(true);
  vi.stubGlobal("navigator", { globalPrivacyControl: true });
  expect(isAnalyticsDisabled()).toBe(true);
});
it("preserves an older opt-out and authentication/payment cookies while removing PostHog identity", () => {
  document.cookie = "ph_fixture_posthog=old; Path=/";
  document.cookie = "__ph_opt_in_out_fixture=0; Path=/";
  document.cookie = "__session=auth; Path=/";
  document.cookie = "payment_choice=monthly; Path=/";
  cleanObsoleteAnalyticsCookies();
  expect(document.cookie).not.toContain("ph_fixture_posthog");
  expect(document.cookie).not.toContain("__ph_opt_in_out_fixture");
  expect(document.cookie).toContain("__session=auth");
  expect(document.cookie).toContain("payment_choice=monthly");
  expect(isAnalyticsDisabled()).toBe(true);
});
