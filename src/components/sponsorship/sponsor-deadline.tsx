"use client";
import { useEffect, useState, type ReactNode } from "react";
export function SponsorDeadline({
  paidThrough,
  serverTime,
  children,
}: {
  paidThrough?: string;
  serverTime?: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!paidThrough || !serverTime) return;
    const deadline = Date.parse(paidThrough),
      receivedAt = Date.now(),
      serverNow = Date.parse(serverTime);
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const remaining = deadline - serverNow - (Date.now() - receivedAt);
      setVisible(remaining > 0);
      clearTimeout(timer);
      if (remaining > 0)
        timer = setTimeout(refresh, Math.min(2147483647, remaining));
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [paidThrough, serverTime]);
  return visible ? children : null;
}
