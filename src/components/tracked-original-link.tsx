"use client";

import { captureAnalyticsEvent } from "@/analytics/client";
import { ANALYTICS_EVENTS } from "@/analytics/events";
import type { Post } from "@/domain/post";

export function TrackedOriginalLink({
  post,
  className,
}: {
  post: Post;
  className: string;
}) {
  return (
    <a
      href={post.sourceUrl}
      target="_blank"
      rel="noreferrer"
      onClick={() =>
        captureAnalyticsEvent(ANALYTICS_EVENTS.postSourceVisited, {
          category: post.category,
          creator_id: post.creator.id,
          post_id: post.id,
          post_slug: post.slug,
          post_title: post.title,
        })
      }
      className={className}
    >
      View original
    </a>
  );
}
