"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  isAnalyticsDisabled,
  isPrivateAnalyticsPath,
} from "@/analytics/privacy";
import { measureSponsorPlacement } from "@/analytics/first-party/measurement";
import { createPageViewContext } from "@/analytics/first-party/page-context";
import type { AnalyticsEvent, Placement } from "@/analytics/first-party/types";
type Token = {
  campaignId: string;
  versionId: string;
  placement: Placement;
  token: string;
};
export function PlacementAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    const { pageId } = createPageViewContext(pathname);
    if (isPrivateAnalyticsPath(pathname)) return;
    const sent = new Set<string>(),
      queue: AnalyticsEvent[] = [];
    let tokens: Token[] = [],
      pageToken = "",
      offset = 0,
      stopped = false,
      fetching = false,
      flushing = false,
      generation = 0;
    const observers = new Map<HTMLElement, { key: string; dispose(): void }>();
    function enqueue(
      kind: AnalyticsEvent["kind"],
      token: string,
      milestone?: 25 | 50 | 75 | 100,
    ) {
      if (stopped || isAnalyticsDisabled()) return;
      queue.push({
        occurrenceId: crypto.randomUUID(),
        kind,
        occurredAt: new Date(Date.now() + offset).toISOString(),
        token,
        ...(milestone ? { milestone } : {}),
      });
    }
    function disconnect() {
      observers.forEach((o) => o.dispose());
      observers.clear();
    }
    function scan() {
      if (stopped || isAnalyticsDisabled()) return;
      for (const [element, observer] of observers)
        if (
          !element.isConnected ||
          observer.key !==
            [
              element.dataset.campaignId,
              element.dataset.versionId,
              element.dataset.sponsorPlacement,
            ].join(":")
        ) {
          observer.dispose();
          observers.delete(element);
        }
      let missing = false;
      document
        .querySelectorAll<HTMLElement>("[data-sponsor-placement]")
        .forEach((element) => {
          if (observers.has(element) || element.closest('[aria-hidden="true"]'))
            return;
          const binding = tokens.find(
            (t) =>
              t.campaignId === element.dataset.campaignId &&
              t.versionId === element.dataset.versionId &&
              t.placement === element.dataset.sponsorPlacement,
          );
          if (!binding) {
            if (element.dataset.campaignId && element.dataset.versionId)
              missing = true;
            return;
          }
          const observer = measureSponsorPlacement(
            element,
            (kind, milestone) => {
              const fresh = tokens.find(
                (t) =>
                  t.campaignId === binding.campaignId &&
                  t.versionId === binding.versionId &&
                  t.placement === binding.placement,
              );
              if (!fresh) return;
              const key = [
                kind,
                pageId,
                binding.campaignId,
                binding.placement,
                milestone,
              ].join(":");
              if (kind !== "sponsor_click" && sent.has(key)) return;
              if (kind !== "sponsor_click") sent.add(key);
              enqueue(kind, fresh.token, milestone);
            },
          );
          observers.set(element, {
            ...observer,
            key: [
              binding.campaignId,
              binding.versionId,
              binding.placement,
            ].join(":"),
          });
        });
      if (missing) void context();
    }
    async function context() {
      if (fetching || stopped || isAnalyticsDisabled()) return;
      fetching = true;
      const current = generation;
      try {
        let referrerDomain: string | undefined;
        try {
          const referrer = new URL(document.referrer);
          if (
            referrer.hostname !== location.hostname &&
            /^[a-z0-9.-]+$/.test(referrer.hostname)
          )
            referrerDomain = referrer.hostname;
        } catch {}
        const response = await fetch("/api/analytics/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageId,
            path: pathname,
            ...(referrerDomain ? { referrerDomain } : {}),
          }),
          cache: "no-store",
        });
        const body = await response.json();
        if (
          stopped ||
          current !== generation ||
          isAnalyticsDisabled() ||
          !response.ok ||
          body.disabled ||
          !Array.isArray(body.tokens)
        )
          return;
        tokens = body.tokens;
        pageToken = body.pageToken;
        offset = body.serverTime - Date.now();
        scan();
        if (!sent.has("page")) {
          sent.add("page");
          enqueue("site_page_view", pageToken);
        }
      } catch {
        /* Collection gaps are not fabricated delivery. */
      } finally {
        fetching = false;
      }
    }
    async function flush() {
      if (flushing || stopped || isAnalyticsDisabled() || !queue.length) return;
      while (
        queue.length &&
        Date.parse(queue[0].occurredAt) < Date.now() + offset - 900000
      )
        queue.shift();
      const events = queue.slice(0, 20);
      if (!events.length) return;
      flushing = true;
      try {
        const response = await fetch("/api/analytics/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events }),
          keepalive: true,
        });
        if (!response.ok) return;
        const body = await response.json();
        const ids = new Set<string>([
          ...(body.accepted ?? []),
          ...(body.duplicate ?? []),
          ...(body.excluded ?? []),
        ]);
        for (let i = queue.length - 1; i >= 0; i--)
          if (ids.has(queue[i].occurrenceId)) queue.splice(i, 1);
      } catch {
        /* Same occurrence IDs remain for bounded retries. */
      } finally {
        flushing = false;
      }
    }
    const copyClick = (event: MouseEvent) => {
      const copy =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("a[data-sponsor-copy]")
          : null;
      if (!copy || (event.type === "auxclick" && event.button !== 1)) return;
      const binding = tokens.find(
        (t) =>
          t.campaignId === copy.dataset.campaignId &&
          t.versionId === copy.dataset.versionId &&
          t.placement === "detail",
      );
      if (binding) enqueue("sponsor_click", binding.token);
    };
    const preference = () => {
      generation++;
      disconnect();
      queue.length = 0;
      if (!isAnalyticsDisabled()) void context();
    };
    const foreground = () => {
      if (document.visibilityState !== "hidden") {
        scan();
        void context();
      } else if (!isAnalyticsDisabled() && queue.length)
        navigator.sendBeacon?.(
          "/api/analytics/events",
          new Blob([JSON.stringify({ events: queue.slice(0, 20) })], {
            type: "application/json",
          }),
        );
    };
    const mutations = new MutationObserver(scan);
    mutations.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-campaign-id", "data-version-id"],
    });
    const tick = setInterval(() => void flush(), 1000),
      refresh = setInterval(() => void context(), 240000);
    document.addEventListener("click", copyClick);
    document.addEventListener("auxclick", copyClick);
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("analytics-preference-changed", preference);
    window.addEventListener("sponsorship-changed", context);
    void context();
    return () => {
      void flush();
      stopped = true;
      generation++;
      disconnect();
      mutations.disconnect();
      clearInterval(tick);
      clearInterval(refresh);
      document.removeEventListener("click", copyClick);
      document.removeEventListener("auxclick", copyClick);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("analytics-preference-changed", preference);
      window.removeEventListener("sponsorship-changed", context);
    };
  }, [pathname]);
  return null;
}
