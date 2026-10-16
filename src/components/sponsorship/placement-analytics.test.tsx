// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/logos" }));
vi.mock("server-only", () => ({}));
import { PlacementAnalytics } from "./placement-analytics";
import { setAnalyticsDisabled } from "@/analytics/privacy";
import { createAnalyticsCollector } from "@/analytics/first-party/collector";
import type {
  AcceptedEvent,
  AnalyticsEvent,
  DeliveryContext,
} from "@/analytics/first-party/types";

const campaignId = "c5a87e57-17a8-4256-927b-a59eda690ce5";
const versionId = "8ed83fb2-1761-4cc9-a019-6ba0b2af4ae3";
let root: Root;
let placement: HTMLAnchorElement;
let visibility: Map<object, (ratio: number) => void>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  visibility = new Map();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        visibility.set(this, (ratio) =>
          callback(
            [{ intersectionRatio: ratio } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          ),
        );
      }
      observe() {}
      disconnect() {
        visibility.delete(this);
      }
    },
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.cookie = "inspora_analytics_disabled=0; Path=/";
  document.body.innerHTML = `<a href="https://example.com" data-sponsor-placement="feed" data-campaign-id="${campaignId}" data-version-id="${versionId}"></a><div id="root"></div>`;
  placement = document.querySelector("a")!;
  // Prevent happy-dom from following the external sponsor link.
  placement.addEventListener("click", (event) => event.preventDefault());
  root = createRoot(document.getElementById("root")!);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function intersect(ratio: number) {
  for (const callback of visibility.values()) callback(ratio);
}

function fixture() {
  const contexts = new Map<string, DeliveryContext>();
  const rows: AcceptedEvent[] = [];
  const batches: AnalyticsEvent[][] = [];
  const receipts = new Set<string>();
  const semanticKeys = new Set<string>();
  const control = {
    contextCalls: 0,
    contextAvailable: true,
    eventsAvailable: true,
    loseNextAcknowledgment: false,
    pendingContext: undefined as
      | undefined
      | ((response: Response) => void),
    deferNextContext: false,
  };
  const collector = createAnalyticsCollector({
    now: () => new Date(),
    decode: (token) => contexts.get(token)!,
    visitor: async () => ({
      visitorKey: "2026-10:opaque",
      countryCode: null,
      device: "desktop",
      referrerDomain: null,
    }),
    allowed: async () => true,
    store: async (events) => {
      const result = {
        accepted: [] as string[],
        duplicate: [] as string[],
        excluded: [] as string[],
      };
      for (const event of events) {
        const key = [
          event.kind,
          event.pageId,
          event.campaignId,
          event.placement,
          event.milestone,
        ].join(":");
        if (
          receipts.has(event.occurrenceId) ||
          (event.kind !== "sponsor_click" && semanticKeys.has(key))
        )
          result.duplicate.push(event.occurrenceId);
        else {
          rows.push(event);
          semanticKeys.add(key);
          result.accepted.push(event.occurrenceId);
        }
        receipts.add(event.occurrenceId);
      }
      return result;
    },
  });
  const request = new Request("https://example.com/api/analytics/events", {
    method: "POST",
  });
  function contextResponse(pageId: string) {
    const key = crypto.randomUUID();
    const base = {
      pageId,
      path: "/logos",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 300000,
    };
    contexts.set(`${key}-page`, base);
    contexts.set(key, { ...base, campaignId, versionId, placement: "feed" });
    return Response.json({
      pageToken: `${key}-page`,
      tokens: [{ campaignId, versionId, placement: "feed", token: key }],
      serverTime: Date.now(),
      expiresAt: base.expiresAt,
    });
  }
  let pendingResponse: Response;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("context")) {
        control.contextCalls++;
        if (!control.contextAvailable)
          return Response.json({}, { status: 503 });
        const { pageId } = JSON.parse(String(init.body));
        const response = contextResponse(pageId);
        if (control.deferNextContext) {
          control.deferNextContext = false;
          pendingResponse = response;
          return new Promise<Response>((resolve) => {
            control.pendingContext = resolve;
          });
        }
        return response;
      }
      const input = JSON.parse(String(init.body));
      batches.push(input.events);
      if (!control.eventsAvailable) throw new Error("network unavailable");
      try {
        const result = await collector(request, input);
        if (control.loseNextAcknowledgment) {
          control.loseNextAcknowledgment = false;
          throw new Error("acknowledgment lost");
        }
        return Response.json(result);
      } catch (error) {
        if (error instanceof Error && error.message === "acknowledgment lost")
          throw error;
        return Response.json({}, { status: 400 });
      }
    }),
  );
  return {
    control,
    rows,
    batches,
    resolveContext() {
      control.pendingContext!(pendingResponse);
    },
    async mount() {
      await act(async () => root.render(createElement(PlacementAnalytics)));
    },
    clicks: () => rows.filter((event) => event.kind === "sponsor_click"),
    impressions: () => rows.filter((event) => event.kind === "sponsor_impression"),
  };
}

it("collects after re-enabling while an earlier context request is pending", async () => {
  const f = fixture();
  f.control.deferNextContext = true;
  await f.mount();
  await act(async () => {
    setAnalyticsDisabled(true);
    setAnalyticsDisabled(false);
    f.resolveContext();
  });
  placement.click();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(f.control.contextCalls).toBe(2);
  expect(f.clicks()).toHaveLength(1);
  expect(f.rows.filter((event) => event.kind === "site_page_view")).toHaveLength(1);
});

it("drops clicks without a valid context and accepts new clicks after refresh recovery", async () => {
  const f = fixture();
  await f.mount();
  f.control.contextAvailable = false;
  await act(async () => vi.advanceTimersByTimeAsync(360000));
  // Refresh at four minutes and expiry at five each try once, without a loop.
  expect(f.control.contextCalls).toBe(3);
  const expiredClickAt = Date.now();
  placement.click();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  f.control.contextAvailable = true;
  await act(async () => vi.advanceTimersByTimeAsync(119000));
  const validClickAt = Date.now();
  placement.click();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(f.clicks()).toHaveLength(1);
  expect(f.clicks()[0].occurredAt).toBe(new Date(validClickAt).toISOString());
  expect(f.batches.flat().some((event) =>
    event.kind === "sponsor_click" &&
    event.occurredAt === new Date(expiredClickAt).toISOString(),
  )).toBe(false);
});

it("remeasures a full visible second after expired context recovers", async () => {
  const f = fixture();
  await f.mount();
  f.control.contextAvailable = false;
  await act(async () => vi.advanceTimersByTimeAsync(360000));
  intersect(1);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  f.control.contextAvailable = true;
  await act(async () => vi.advanceTimersByTimeAsync(119000));
  intersect(1);
  await act(async () => vi.advanceTimersByTimeAsync(999));
  expect(f.impressions()).toHaveLength(0);
  await act(async () => vi.advanceTimersByTimeAsync(1001));
  expect(f.impressions()).toHaveLength(1);
});

it("preserves valid pre-expiry occurrences for grace-period delivery", async () => {
  const f = fixture();
  await f.mount();
  f.control.contextAvailable = false;
  await act(async () => vi.advanceTimersByTimeAsync(299000));
  const clickedAt = Date.now();
  f.control.eventsAvailable = false;
  placement.click();
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  f.control.eventsAvailable = true;
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(f.clicks()).toHaveLength(1);
  expect(f.clicks()[0].occurredAt).toBe(new Date(clickedAt).toISOString());
  const attempts = f.batches.flat().filter((event) => event.kind === "sponsor_click");
  expect(attempts.length).toBeGreaterThan(1);
  expect(new Set(attempts.map((event) => event.occurrenceId)).size).toBe(1);
});

it("retries lost acknowledgments with the same IDs without adding another exposure", async () => {
  const f = fixture();
  await f.mount();
  intersect(1);
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  f.control.loseNextAcknowledgment = true;
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(f.impressions()).toHaveLength(1);
  const attempts = f.batches.flat().filter((event) => event.kind === "sponsor_impression");
  expect(attempts).toHaveLength(2);
  expect(attempts[0].occurrenceId).toBe(attempts[1].occurrenceId);
});

it("stops collection while opted out, including a pending context response", async () => {
  const f = fixture();
  f.control.deferNextContext = true;
  await f.mount();
  await act(async () => {
    setAnalyticsDisabled(true);
    f.resolveContext();
  });
  intersect(1);
  placement.click();
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(f.rows).toEqual([]);
  expect(f.batches).toEqual([]);
  expect(f.control.contextCalls).toBe(1);
});

it("recovers a page view dropped from the unsent queue by a preference reset", async () => {
  const f = fixture();
  await f.mount();
  await act(async () => {
    setAnalyticsDisabled(true);
    setAnalyticsDisabled(false);
  });
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(f.rows.filter((event) => event.kind === "site_page_view")).toHaveLength(1);
});

it("remeasures an unsent impression after re-enable and deduplicates accepted exposure", async () => {
  const f = fixture();
  await f.mount();
  intersect(1);
  // The interval flushes the page before the one-second impression is queued.
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(f.rows.filter((event) => event.kind === "site_page_view")).toHaveLength(1);
  expect(f.impressions()).toHaveLength(0);
  await act(async () => {
    setAnalyticsDisabled(true);
    setAnalyticsDisabled(false);
  });
  intersect(1);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(f.impressions()).toHaveLength(1);
  expect(f.rows.filter((event) => event.kind === "site_page_view")).toHaveLength(1);
  await act(async () => {
    setAnalyticsDisabled(true);
    setAnalyticsDisabled(false);
  });
  intersect(1);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(f.impressions()).toHaveLength(1);
  expect(f.rows.filter((event) => event.kind === "site_page_view")).toHaveLength(1);
});
