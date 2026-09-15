"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

export function subscribeToAuthPath(onChange: () => void) {
  // Clerk can use a captured native history method, bypassing Next's router.
  // Observe the committed browser entry, without patching either router.
  let active = true;
  const notify = () => queueMicrotask(() => { if (active) onChange(); });
  const navigation = window.navigation;
  navigation?.addEventListener("currententrychange", notify);
  window.addEventListener("popstate", notify);

  // Older browsers lack the Navigation API. Check only while auth is mounted;
  // history.pushState does not emit popstate and may bypass history wrappers.
  let previousPath = window.location.pathname;
  const timer = !navigation ? window.setInterval(() => {
    if (window.location.pathname !== previousPath) {
      previousPath = window.location.pathname;
      notify();
    }
  }, 100) : undefined;

  return () => {
    active = false;
    navigation?.removeEventListener("currententrychange", notify);
    window.removeEventListener("popstate", notify);
    if (timer !== undefined) window.clearInterval(timer);
  };
}

export function useAuthPathname() {
  const pathname = usePathname();
  return useSyncExternalStore(subscribeToAuthPath, () => window.location.pathname, () => pathname);
}
