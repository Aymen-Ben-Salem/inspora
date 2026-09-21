"use client";

import { createContext, useContext } from "react";
import type { CreatorProfile } from "@/features/creators/types";

export const VIEWER_PROFILE_UPDATED = "inspora:viewer-profile-updated";

export type ViewerProfileState = {
  userId?: string;
  profile: CreatorProfile | null;
  isLoading: boolean;
};

export const ViewerProfileContext = createContext<ViewerProfileState>({
  profile: null,
  isLoading: false,
});

export function refreshViewerProfile() {
  window.dispatchEvent(new Event(VIEWER_PROFILE_UPDATED));
}

export function useViewerProfile(userId: string | undefined) {
  const state = useContext(ViewerProfileContext);
  // A switched account must not see the preceding viewer's profile.
  return userId && state.userId === userId
    ? state
    : { profile: null, isLoading: Boolean(userId) };
}
