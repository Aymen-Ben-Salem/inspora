"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState, type PropsWithChildren } from "react";

import type { CreatorProfile } from "@/features/creators/types";
import {
  VIEWER_PROFILE_UPDATED,
  ViewerProfileContext,
  type ViewerProfileState,
} from "./use-viewer-profile";

// Mounted inside the root Clerk provider so page/navbar remounts keep the photo.
export function ViewerProfileProvider({ children }: PropsWithChildren) {
  const { isSignedIn, userId: clerkUserId } = useAuth();
  const userId = isSignedIn ? clerkUserId ?? undefined : undefined;
  const [result, setResult] = useState<ViewerProfileState | null>(null);

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
          if (!response.ok) throw new Error("Viewer profile unavailable");
          const profile = await response.json() as CreatorProfile;
          if (active && !request.signal.aborted) {
            setResult({ userId, profile, isLoading: false });
          }
        })
        .catch(() => {
          if (active && !request.signal.aborted) {
            setResult((previous) => previous?.userId === userId
              ? previous
              : { userId, profile: null, isLoading: false });
          }
        });
    };
    refresh();
    window.addEventListener(VIEWER_PROFILE_UPDATED, refresh);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener(VIEWER_PROFILE_UPDATED, refresh);
    };
  }, [userId]);

  const value = userId && result?.userId === userId
    ? result
    : { userId, profile: null, isLoading: Boolean(userId) };
  return <ViewerProfileContext.Provider value={value}>{children}</ViewerProfileContext.Provider>;
}
