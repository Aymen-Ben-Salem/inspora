"use client";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ActiveSponsor } from "@/domain/sponsor";
const Context = createContext<{
  sponsors: ActiveSponsor[];
  ready: boolean;
  refresh: () => Promise<void>;
  initialize: (initial: ActiveSponsor[]) => void;
}>({ sponsors: [], ready: false, refresh: async () => {}, initialize: () => {} });
export function PublicSponsorsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/admin-access-denied";
  const [sponsors, setSponsors] = useState<ActiveSponsor[]>([]),
    [ready, setReady] = useState(false);
  const inFlight = useRef(false),
    controller = useRef<AbortController | null>(null);
  const snapshot = useRef<{ sponsors: ActiveSponsor[]; offset: number } | null>(
    null,
  );
  const expire = useCallback(() => {
    if (!snapshot.current) return;
    const { sponsors: current, offset } = snapshot.current;
    const valid = current.filter(
      (s) => !s.paidThrough || Date.parse(s.paidThrough) > Date.now() + offset,
    );
    setSponsors((previous) =>
      previous.length === valid.length &&
      previous.every((s, i) => s === valid[i])
        ? previous
        : valid,
    );
  }, []);
  const initialize = useCallback(
    (initial: ActiveSponsor[]) => {
      // The server-rendered list needs the same deadline enforcement as API data.
      // Never replace a confirmed snapshot, including an empty API response.
      if (snapshot.current || !initial.length) return;
      const serverTime = Date.parse(initial[0].serverTime ?? "");
      snapshot.current = {
        sponsors: initial,
        offset: Number.isFinite(serverTime) ? serverTime - Date.now() : 0,
      };
      setReady(true);
      expire();
    },
    [expire],
  );
  const refresh = useCallback(async () => {
    if (isAdmin || inFlight.current) return;
    inFlight.current = true;
    const request = new AbortController();
    controller.current = request;
    try {
      const response = await fetch("/api/sponsorship/placements", {
        cache: "no-store",
        signal: request.signal,
      });
      const body = await response.json();
      if (
        request.signal.aborted ||
        !response.ok ||
        !Array.isArray(body.sponsors) ||
        !Number.isFinite(Date.parse(body.serverTime))
      )
        return;
      snapshot.current = {
        sponsors: body.sponsors,
        offset: Date.parse(body.serverTime) - Date.now(),
      };
      setReady(true);
      expire();
    } catch {
      /* Keep the last confirmed snapshot, still enforcing its deadline. */
    } finally {
      inFlight.current = false;
    }
  }, [expire, isAdmin]);
  useEffect(() => {
    if (isAdmin) return;
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void refresh();
    });
    const poll = setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, 30000);
    const deadline = setInterval(expire, 250);
    const foreground = () => {
      expire();
      if (document.visibilityState !== "hidden") void refresh();
    };
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("focus", foreground);
    window.addEventListener("sponsorship-changed", foreground);
    return () => {
      mounted = false;
      clearInterval(poll);
      clearInterval(deadline);
      controller.current?.abort();
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("sponsorship-changed", foreground);
    };
  }, [expire, refresh, isAdmin]);
  return (
    <Context.Provider value={{ sponsors, ready, refresh, initialize }}>
      {children}
    </Context.Provider>
  );
}
export function usePublicSponsors(initial: ActiveSponsor[] = []) {
  const { initialize, ...value } = useContext(Context);
  useEffect(() => {
    initialize(initial);
  }, [initial, initialize]);
  return { ...value, sponsors: value.ready ? value.sponsors : initial };
}
