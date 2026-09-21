import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/analytics/client", () => ({ captureAnalyticsEvent: vi.fn() }));
vi.mock("@/analytics/events", () => import("../analytics/events"));
vi.mock("@/analytics/privacy", () => import("../analytics/privacy"));

import {
  resetCapturedWorkOpensForTests,
  shouldCaptureWorkOpen,
} from "./work-analytics";

beforeEach(() => resetCapturedWorkOpensForTests());

describe("work-open analytics", () => {
  it("suppresses obvious remount duplicates for the same kind and work", () => {
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
    ).toBe(false);
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
