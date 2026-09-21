import { describe, expect, it, vi } from "vitest";

const captureState = vi.hoisted(() => ({ enabled:true, session:"one", events:[] as string[] }));
vi.mock("react", () => ({useEffect:(effect:()=>void) => effect()}));
vi.mock("@/analytics/client", () => ({ captureAnalyticsEvent: vi.fn(() => {
  if (captureState.enabled) captureState.events.push(captureState.session);
}) }));
vi.mock("@/analytics/events", () => import("../analytics/events"));
vi.mock("@/analytics/privacy", () => import("../analytics/privacy"));

import {
  WorkAnalytics,
  shouldCaptureWorkOpen,
} from "./work-analytics";



describe("work-open analytics", () => {
  it("allows reopening after SDK session rollover and leaves exact deduplication to the server", () => {
    expect(
      shouldCaptureWorkOpen({
        pathname: "/logos",
        workId: "shared-id",
        workKind: "logo",
      }),
    ).toBe(true);
    expect(
      shouldCaptureWorkOpen({
        pathname: "/logos",
        workId: "shared-id",
        workKind: "logo",
      }),
    ).toBe(true);
  });

  it("keeps content-kind collisions separate", () => {
    expect(
      shouldCaptureWorkOpen({
        pathname: "/posts/example",
        workId: "shared-id",
        workKind: "design",
      }),
    ).toBe(true);
    expect(
      shouldCaptureWorkOpen({
        pathname: "/websites",
        workId: "shared-id",
        workKind: "website",
      }),
    ).toBe(true);
  });

  it("never captures opens from private profile or admin routes", () => {
    expect(
      shouldCaptureWorkOpen({
        pathname: "/profile",
        workId: "design-id",
        workKind: "design",
      }),
    ).toBe(false);
    expect(
      shouldCaptureWorkOpen({
        pathname: "/admin/submissions/id",
        workId: "design-id",
        workKind: "design",
      }),
    ).toBe(false);
  });
});

it("permits capture after disabled or opted-out opens and after SDK session changes in one tab", () => {
  vi.stubGlobal("window", {location:{pathname:"/logos"}});
  captureState.events = [];
  captureState.enabled = false;
  WorkAnalytics({workId:"fixture",workKind:"logo"});
  captureState.enabled = true;
  WorkAnalytics({workId:"fixture",workKind:"logo"});
  captureState.session = "two";
  WorkAnalytics({workId:"fixture",workKind:"logo"});
  expect(captureState.events).toEqual(["one","two"]);
  vi.unstubAllGlobals();
});
