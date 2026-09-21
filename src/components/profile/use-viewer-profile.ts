"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CreatorProfile } from "@/features/creators/types";

const VIEWER_PROFILE_UPDATED = "inspora:viewer-profile-updated";

export function refreshViewerProfile() {
  window.dispatchEvent(new Event(VIEWER_PROFILE_UPDATED));
}

export function useViewerProfile(userId: string | undefined) {
  const pathname = usePathname();
  const [result, setResult] = useState<{ userId: string; profile: CreatorProfile } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      void fetch("/api/profile", { cache: "no-store", signal: request.signal })
        .then(async (response) => {
          if (!response.ok) return;
          const profile = await response.json() as CreatorProfile;
          if (active && !request.signal.aborted) setResult({ userId, profile });
        })
        .catch(() => { /* Keep the current viewer's photo on a transient failure. */ });
    };
    refresh();
    window.addEventListener(VIEWER_PROFILE_UPDATED, refresh);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener(VIEWER_PROFILE_UPDATED, refresh);
    };
  }, [userId, pathname]);
  // Never show the previous viewer's saved photo after an account switch.
  return userId && result?.userId === userId ? result.profile : null;
}
