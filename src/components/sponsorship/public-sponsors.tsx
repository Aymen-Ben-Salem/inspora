"use client";
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
}>({ sponsors: [], ready: false, refresh: async () => {} });
export function PublicSponsorsProvider({ children }: { children: ReactNode }) {
  const [sponsors, setSponsors] = useState<ActiveSponsor[]>([]),
    [ready, setReady] = useState(false);
  const inFlight = useRef(false),
    controller = useRef<AbortController | null>(null);
  const snapshot = useRef<{ sponsors: ActiveSponsor[]; offset: number }>({
    sponsors: [],
    offset: 0,
  });
  const expire = useCallback(() => {
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
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
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
  }, [expire]);
  useEffect(() => {
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
  }, [expire, refresh]);
  return (
    <Context.Provider value={{ sponsors, ready, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function usePublicSponsors(initial: ActiveSponsor[] = []) {
  const value = useContext(Context);
  return { ...value, sponsors: value.ready ? value.sponsors : initial };
}
