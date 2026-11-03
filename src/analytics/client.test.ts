// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));
beforeEach(() => {
  vi.resetModules(); sdk.capture.mockReset().mockReturnValue({ event: "accepted" });
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "preview-fixture");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_COOKIELESS_ENABLED", "true");
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  vi.unstubAllEnvs();
  document.cookie = "inspora_analytics_disabled=; Path=/; Max-Age=0";
});
const properties = { work_id: "fixture", work_kind: "design" as const, work_session_key: "session" };
it("reports SDK acceptance so only admitted feed events suppress duplicates", async () => {
  const { captureAnalyticsEvent } = await import("./client");
  expect(captureAnalyticsEvent("work viewed in feed", properties)).toBe(true);
  sdk.capture.mockReturnValue(undefined);
  expect(captureAnalyticsEvent("work viewed in feed", properties)).toBe(false);
});
it.each(["missing-token", "disabled-configuration", "private-route", "opt-out"])("does not admit %s events", async (reason) => {
  if (reason === "missing-token") vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
  if (reason === "disabled-configuration") vi.stubEnv("NEXT_PUBLIC_POSTHOG_COOKIELESS_ENABLED", "false");
  if (reason === "private-route") window.history.replaceState(null, "", "/saved");
  if (reason === "opt-out") document.cookie = "inspora_analytics_disabled=1; Path=/";
  const { captureAnalyticsEvent } = await import("./client");
  expect(captureAnalyticsEvent("work viewed in feed", properties)).toBe(false);
  expect(sdk.capture).not.toHaveBeenCalled();
});
