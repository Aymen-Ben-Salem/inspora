"use client";

import { useCallback, useSyncExternalStore } from "react";

import { formatPostAddedTime } from "@/lib/post-added-time";

export function RelativeAddedTime({
  className,
  publishedAt,
}: {
  className?: string;
  publishedAt: string;
}) {
  const subscribe = useCallback((notify: () => void) => {
    const interval = window.setInterval(notify, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const getSnapshot = useCallback(
    () => formatPostAddedTime(publishedAt),
    [publishedAt],
  );
  const getServerSnapshot = useCallback(() => "Recently added", []);
  const label = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <time
      dateTime={publishedAt}
      aria-label={`Added to Inspora ${label}`}
      className={className}
    >
      {label}
    </time>
  );
}
