"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { observeWorkFeedViews } from "@/analytics/work-feed-views";
import { useFeedSuspended } from "./looping-video";

export function WorkFeedAnalytics() {
  const pathname = usePathname();
  const suspended = useFeedSuspended();
  useEffect(() => {
    if (!suspended) return observeWorkFeedViews(pathname);
  }, [pathname, suspended]);
  return null;
}
