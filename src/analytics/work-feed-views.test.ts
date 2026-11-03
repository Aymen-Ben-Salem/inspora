// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => vi.fn<(event: string, properties: Record<string, string>) => boolean>(() => true));
vi.mock("./client", () => ({ captureAnalyticsEvent: capture }));
let observe: typeof import("./work-feed-views").observeWorkFeedViews;
let cleanup: (() => void) | undefined;
let visibility: DocumentVisibilityState;
const observers: FakeObserver[] = [];
class FakeObserver {
  targets = new Set<Element>();
  records: IntersectionObserverEntry[] = [];
  constructor(public callback: IntersectionObserverCallback, public options: IntersectionObserverInit) { observers.push(this); }
  observe = (element: Element) => { this.targets.add(element); };
  unobserve = (element: Element) => { this.targets.delete(element); };
  disconnect = () => this.targets.clear();
  takeRecords = () => this.records.splice(0);
}
function entry(target: Element, ratio: number) {
  return { target, intersectionRatio: ratio, isIntersecting: ratio > 0 } as IntersectionObserverEntry;
}
function intersect(target: Element, ratio: number) {
  const observer = observers.findLast((item) => item.targets.has(target))!;
  observer.callback([entry(target, ratio)], observer as unknown as IntersectionObserver);
}
function card(id = "work-a", kind = "design", loaded = true) {
  const element = document.createElement("button");
  element.dataset.feedPostId = id;
  element.dataset.feedWorkKind = kind;
  const img = document.createElement("img");
  Object.defineProperties(img, {
    complete: { value: loaded, configurable: true },
    naturalWidth: { value: loaded ? 100 : 0, configurable: true },
  });
  element.append(img);
  document.body.append(element);
  return element;
}
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  capture.mockReset().mockReturnValue(true);
  observers.length = 0;
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("ResizeObserver", undefined);
  vi.stubGlobal("navigator", { doNotTrack: "0", globalPrivacyControl: false });
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "preview-fixture");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_COOKIELESS_ENABLED", "true");
  observe = (await import("./work-feed-views")).observeWorkFeedViews;
});
afterEach(() => {
  cleanup?.(); cleanup = undefined;
  document.cookie = "inspora_analytics_disabled=; Path=/; Max-Age=0";
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();
});

it("requires 75% visibility for a continuous second, not a fast or partial scroll", () => {
  const element = card(); cleanup = observe("/");
  intersect(element, 0.749); vi.advanceTimersByTime(5000);
  expect(capture).not.toHaveBeenCalled();
  intersect(element, 0.75); vi.advanceTimersByTime(999);
  expect(capture).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(capture).toHaveBeenCalledExactlyOnceWith("work viewed in feed", {
    work_kind: "design", work_id: "work-a", work_session_key: expect.any(String),
  });
});
it("restarts the dwell period after dipping below the threshold", () => {
  const element = card(); cleanup = observe("/");
  intersect(element, 1); vi.advanceTimersByTime(750);
  intersect(element, 0.74); intersect(element, 1); vi.advanceTimersByTime(999);
  expect(capture).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(capture).toHaveBeenCalledTimes(1);
});
it("applies queued exit and re-entry before accepting a timer that just expired", () => {
  const element = card(); cleanup = observe("/"); intersect(element, 1);
  observers.at(-1)!.records.push(entry(element, 0.5), entry(element, 1));
  vi.advanceTimersByTime(1000); expect(capture).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000); expect(capture).toHaveBeenCalledTimes(1);
});
it("requires a fresh second after the tab returns from the background", () => {
  const element = card(); cleanup = observe("/"); intersect(element, 1);
  vi.advanceTimersByTime(500); visibility = "hidden";
  document.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(5000);
  expect(capture).not.toHaveBeenCalled();
  visibility = "visible"; document.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(999); expect(capture).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(capture).toHaveBeenCalledTimes(1);
});
it.each(["preference", "dnt", "gpc"])("honors %s and permits a fresh view after privacy is re-enabled", (mode) => {
  const element = card(); cleanup = observe("/"); intersect(element, 1);
  vi.advanceTimersByTime(500);
  if (mode === "preference") document.cookie = "inspora_analytics_disabled=1; Path=/";
  else vi.stubGlobal("navigator", mode === "dnt" ? { doNotTrack: "1" } : { globalPrivacyControl: true });
  window.dispatchEvent(new Event("analytics-preference-changed")); vi.advanceTimersByTime(2000);
  expect(capture).not.toHaveBeenCalled();
  document.cookie = "inspora_analytics_disabled=0; Path=/";
  vi.stubGlobal("navigator", { doNotTrack: "0" });
  window.dispatchEvent(new Event("analytics-preference-changed")); vi.advanceTimersByTime(1000);
  expect(capture).toHaveBeenCalledTimes(1);
});
it("does not count unloaded placeholders, but starts measuring when their image loads", () => {
  const element = card("work-a", "design", false); cleanup = observe("/");
  intersect(element, 1); vi.advanceTimersByTime(1000); expect(capture).not.toHaveBeenCalled();
  const img = element.querySelector("img")!;
  Object.defineProperties(img, { complete: { value: true }, naturalWidth: { value: 100 } });
  img.dispatchEvent(new Event("load")); vi.advanceTimersByTime(1000);
  expect(capture).toHaveBeenCalledTimes(1);
});
it("deduplicates repeated cards and remounts while keeping different kinds distinct", () => {
  const first = card(), copy = card(), logo = card("work-a", "logo");
  cleanup = observe("/"); [first, copy, logo].forEach((el) => intersect(el, 1));
  vi.advanceTimersByTime(1000); expect(capture).toHaveBeenCalledTimes(2);
  cleanup?.(); cleanup = observe("/"); intersect(first, 1); vi.advanceTimersByTime(1000);
  expect(capture).toHaveBeenCalledTimes(2);
  cleanup?.(); vi.advanceTimersByTime(30 * 60 * 1000); cleanup = observe("/");
  intersect(first, 1); vi.advanceTimersByTime(1000); expect(capture).toHaveBeenCalledTimes(3);
  expect(capture.mock.calls[0][1].work_session_key).not.toBe(capture.mock.calls[2][1].work_session_key);
});
it("tracks appended and reused cards, without creating one observer per card", async () => {
  cleanup = observe("/"); const element = card(); await vi.advanceTimersByTimeAsync(0);
  expect(observers).toHaveLength(1); intersect(element, 1); vi.advanceTimersByTime(1000);
  element.dataset.feedPostId = "work-b"; await vi.advanceTimersByTimeAsync(0);
  intersect(element, 1); vi.advanceTimersByTime(1000);
  expect(capture.mock.calls.map((call) => call[1].work_id)).toEqual(["work-a", "work-b"]);
});
it("does not count removed cards or callbacks after disposal", () => {
  const element = card(); cleanup = observe("/"); intersect(element, 1);
  element.remove(); vi.advanceTimersByTime(1000); expect(capture).not.toHaveBeenCalled();
  document.body.append(element); intersect(element, 1); cleanup?.(); vi.advanceTimersByTime(1000);
  expect(capture).not.toHaveBeenCalled();
});
it.each(["/saved", "/profile", "/admin", "/sponsor/start", "/posts/example"])("does not observe private or detail-route cards at %s", (path) => {
  card(); cleanup = observe(path); expect(observers).toHaveLength(0);
});
it("checks the current route again before a pending view can be emitted", () => {
  const element = card(); cleanup = observe("/"); intersect(element, 1);
  window.history.replaceState(null, "", "/saved"); vi.advanceTimersByTime(1000);
  expect(capture).not.toHaveBeenCalled();
});
it("does not suppress a future capture when the SDK rejected the first attempt", () => {
  const element = card(); capture.mockReturnValueOnce(false);
  cleanup = observe("/"); intersect(element, 1); vi.advanceTimersByTime(1000);
  window.dispatchEvent(new Event("analytics-preference-changed")); vi.advanceTimersByTime(1000);
  expect(capture).toHaveBeenCalledTimes(2);
});
it("excludes hidden or inert previews", () => {
  const element = card(); element.setAttribute("inert", ""); cleanup = observe("/");
  intersect(element, 1); vi.advanceTimersByTime(1000); expect(capture).not.toHaveBeenCalled();
});
it("subtracts the sticky header and visible filters from the viewing area", () => {
  const header = document.createElement("header"); header.dataset.feedHeader = "";
  vi.spyOn(header, "getBoundingClientRect").mockReturnValue({ bottom: 72 } as DOMRect);
  const filters = document.createElement("div"); filters.dataset.headerFilters = "visible";
  vi.spyOn(filters, "getBoundingClientRect").mockReturnValue({ bottom: 150 } as DOMRect);
  header.append(filters); document.body.append(header); card(); cleanup = observe("/");
  expect(observers.at(-1)!.options.rootMargin).toBe("-150px 0px 0px 0px");
});
