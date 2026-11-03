import { captureAnalyticsEvent } from "./client";
import { ANALYTICS_EVENTS } from "./events";
import { isAnalyticsDisabled, isPrivateAnalyticsPath } from "./privacy";
import { getWorkSessionKey } from "./work-session";

const selector = "[data-feed-work-kind][data-feed-post-id]";
const minimumRatio = 0.75;
const dwellMs = 1000;
type WorkKind = "design" | "logo" | "website";
type Exposure = { id: string; kind: WorkKind; ratio: number; qualified: boolean; timer?: ReturnType<typeof setTimeout> };

// Memory only, like work opens. Keep deduplication across client-side routes,
// and discard it when the existing thirty-minute idle session rolls over.
let session: string | undefined;
const sent = new Set<string>();

function record(work: Exposure) {
  const nextSession = getWorkSessionKey();
  if (nextSession !== session) {
    session = nextSession;
    sent.clear();
  }
  const key = `${work.kind}:${work.id}`;
  if (sent.has(key)) return true;
  const accepted = captureAnalyticsEvent(ANALYTICS_EVENTS.workFeedViewed, {
    work_id: work.id, work_kind: work.kind, work_session_key: nextSession,
  });
  if (accepted) sent.add(key);
  return accepted;
}

function mediaReady(element: HTMLElement) {
  return Array.from(element.querySelectorAll("img,video,canvas")).some((media) => {
    if (getComputedStyle(media).visibility === "hidden") return false;
    if (media instanceof HTMLImageElement) return media.complete && media.naturalWidth > 0;
    if (media instanceof HTMLVideoElement) return media.readyState >= 2 && media.videoWidth > 0;
    return media instanceof HTMLCanvasElement && media.width > 0 && media.height > 0;
  });
}

/** One observer for all public work previews, including newly appended cards. */
export function observeWorkFeedViews(pathname: string) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
      process.env.NEXT_PUBLIC_POSTHOG_COOKIELESS_ENABLED !== "true" ||
      isPrivateAnalyticsPath(pathname) || pathname.startsWith("/posts/") ||
      typeof IntersectionObserver === "undefined") return;

  const targets = new Map<HTMLElement, Exposure>();
  let stopped = false;
  let topInset = 0;
  let observer: IntersectionObserver;
  const headerResize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(refreshHeader);
  const headers = new Set<Element>();

  function enabled() {
    return !stopped && document.visibilityState === "visible" && !isAnalyticsDisabled() &&
      !isPrivateAnalyticsPath(window.location.pathname) && !window.location.pathname.startsWith("/posts/");
  }
  function qualifies(element: HTMLElement, work: Exposure) {
    return enabled() && element.isConnected && work.ratio >= minimumRatio &&
      !element.closest('[hidden],[inert],[aria-hidden="true"]') && mediaReady(element);
  }
  function clear(work: Exposure) {
    clearTimeout(work.timer);
    work.timer = undefined;
  }
  function update(element: HTMLElement, work: Exposure) {
    if (!qualifies(element, work)) { clear(work); work.qualified = false; return; }
    if (work.qualified || work.timer !== undefined) return;
    const timer = setTimeout(() => {
      // Apply queued crossings first: a backgrounded or briefly scrolled-away
      // card must qualify for a fresh continuous second, not reuse elapsed time.
      onIntersection(observer.takeRecords());
      if (work.timer !== timer) return;
      work.timer = undefined;
      if (targets.get(element) === work && qualifies(element, work)) work.qualified = record(work);
    }, dwellMs);
    work.timer = timer;
  }
  function onIntersection(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      const work = targets.get(element);
      if (!work) continue;
      work.ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      update(element, work);
    }
  }
  function replaceObserver() {
    observer?.disconnect();
    observer = new IntersectionObserver(onIntersection, {
      threshold: [0, minimumRatio, 1], rootMargin: `-${topInset}px 0px 0px 0px`,
    });
    for (const [element, work] of targets) {
      clear(work);
      work.ratio = 0;
      observer.observe(element);
    }
  }
  function refreshHeader() {
    const next = Math.max(0, ...Array.from(document.querySelectorAll<HTMLElement>(
      '[data-feed-header],[data-header-filters="visible"]',
    ), (header) => {
      if (!headers.has(header)) { headers.add(header); headerResize?.observe(header); }
      return Math.ceil(header.getBoundingClientRect().bottom);
    }));
    for (const header of headers) if (!header.isConnected) {
      headerResize?.unobserve(header);
      headers.delete(header);
    }
    if (next !== topInset) { topInset = next; replaceObserver(); }
  }
  function register(element: HTMLElement) {
    const id = element.dataset.feedPostId;
    const kind = element.dataset.feedWorkKind as WorkKind;
    const previous = targets.get(element);
    if (!id || !["design", "logo", "website"].includes(kind)) {
      if (previous) { clear(previous); observer.unobserve(element); targets.delete(element); }
      return;
    }
    if (previous?.id === id && previous.kind === kind) return;
    if (previous) { clear(previous); observer.unobserve(element); }
    targets.set(element, { id, kind, ratio: 0, qualified: false });
    observer.observe(element);
  }
  function scan(node: Node) {
    if (!(node instanceof Element)) return;
    if (node.matches(selector)) register(node as HTMLElement);
    node.querySelectorAll<HTMLElement>(selector).forEach(register);
  }
  function refresh() {
    for (const [element, work] of targets) update(element, work);
  }
  function preferenceChanged() {
    // A queued event may have been discarded after an opt-out. Allow a fresh
    // attempt on re-enable; the aggregate still deduplicates accepted events.
    if (isAnalyticsDisabled()) sent.clear();
    refresh();
  }
  function mediaLoaded(event: Event) {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
    const work = element && targets.get(element);
    if (element && work) update(element, work);
  }
  const mutations = new MutationObserver((records) => {
    if (stopped) return;
    for (const [element, work] of targets) if (!element.isConnected || !element.matches(selector)) {
      clear(work); observer.unobserve(element); targets.delete(element);
    }
    for (const mutation of records) {
      if (mutation.type === "childList") mutation.addedNodes.forEach(scan);
      else if (mutation.target instanceof HTMLElement && mutation.target.matches(selector)) register(mutation.target);
    }
    refreshHeader();
    refresh();
  });
  replaceObserver();
  refreshHeader();
  scan(document.body);
  mutations.observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["data-feed-post-id", "data-feed-work-kind", "data-header-filters", "hidden", "inert", "aria-hidden"],
  });
  document.addEventListener("visibilitychange", refresh);
  document.addEventListener("load", mediaLoaded, true);
  document.addEventListener("loadeddata", mediaLoaded, true);
  window.addEventListener("analytics-preference-changed", preferenceChanged);
  window.addEventListener("resize", refreshHeader);
  return () => {
    stopped = true;
    targets.forEach(clear);
    observer.disconnect();
    mutations.disconnect();
    headerResize?.disconnect();
    document.removeEventListener("visibilitychange", refresh);
    document.removeEventListener("load", mediaLoaded, true);
    document.removeEventListener("loadeddata", mediaLoaded, true);
    window.removeEventListener("analytics-preference-changed", preferenceChanged);
    window.removeEventListener("resize", refreshHeader);
  };
}
