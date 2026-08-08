"use client";

import { useEffect, useRef } from "react";

import { captureAnalyticsEvent } from "@/analytics/client";
import { ANALYTICS_EVENTS } from "@/analytics/events";
import type { Post } from "@/domain/post";

export function PostAnalytics({ post }: { post: Post }) {
  const capturedPostId = useRef<string | null>(null);

  useEffect(() => {
    if (capturedPostId.current === post.id) return;
    capturedPostId.current = post.id;

    captureAnalyticsEvent(ANALYTICS_EVENTS.postOpened, {
      category: post.category,
      creator_id: post.creator.id,
      creator_name: post.creator.name,
      post_id: post.id,
      post_slug: post.slug,
      post_title: post.title,
    });
  }, [post]);

  return null;
}
