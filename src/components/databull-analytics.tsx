"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackDataBullPage, type DataBullConfig } from "@/analytics/databull";

export function DataBullAnalytics({ config }: { config: DataBullConfig }) {
  const pathname = usePathname();
  const { endpoint, websiteId, domain } = config;
  useEffect(
    () => trackDataBullPage({ endpoint, websiteId, domain }, pathname),
    [endpoint, websiteId, domain, pathname],
  );
  return null;
}
