import { afterEach, describe, expect, it, vi } from "vitest";

const captureState = vi.hoisted(() => ({ enabled:true, session:"one", events:[] as string[] }));
const cleanups = vi.hoisted(() => [] as Array<() => void>);
vi.mock("react", () => ({useEffect:(effect:()=>void | (()=>void)) => {
  const cleanup = effect();
  if (cleanup) cleanups.push(cleanup);
}}));
vi.mock("@/analytics/client", () => ({ captureAnalyticsEvent: vi.fn(() => {
  if (captureState.enabled) captureState.events.push(captureState.session);
}) }));
vi.mock("@/analytics/events", () => import("../analytics/events"));
vi.mock("@/analytics/privacy", () => import("../analytics/privacy"));

import {
  WorkAnalytics,
  shouldCaptureWorkOpen,
} from "./work-analytics";

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

function publicWindow() {
  return Object.assign(new EventTarget(), { location: { pathname: "/logos" } });
}


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
  vi.stubGlobal("window", publicWindow());
  captureState.events = [];
  captureState.enabled = false;
  WorkAnalytics({workId:"fixture",workKind:"logo"});
  captureState.enabled = true;
  WorkAnalytics({workId:"fixture",workKind:"logo"});
  captureState.session = "two";
  WorkAnalytics({workId:"fixture",workKind:"logo"});
  expect(captureState.events).toEqual(["one","two"]);
});

it("records the currently open work when analytics is re-enabled without reopening it", () => {
  const browser = publicWindow();
  vi.stubGlobal("window", browser);
  captureState.events = [];
  captureState.session = "enabled-later";
  captureState.enabled = false;
  WorkAnalytics({ workId: "fixture", workKind: "logo" });
  captureState.enabled = true;
  browser.dispatchEvent(new Event("analytics-preference-changed"));
  expect(captureState.events).toEqual(["enabled-later"]);
  cleanups.splice(0).forEach((cleanup) => cleanup());
  browser.dispatchEvent(new Event("analytics-preference-changed"));
  expect(captureState.events).toEqual(["enabled-later"]);
});
