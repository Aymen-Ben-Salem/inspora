import "server-only";
import type { DataBullConfig } from "./databull";

export function getDataBullConfig(values: Record<string, string | undefined> = process.env): DataBullConfig | null {
  if (values.DATABULL_ENABLED !== "true" || values.VERCEL_ENV !== "production") return null;
  if (!/^dc_[a-z0-9]{8,64}$/.test(values.DATABULL_WEBSITE_ID ?? "")) return null;
  try {
    const collector = new URL(values.DATABULL_URL ?? "");
    const site = new URL(values.SITE_URL ?? "");
    if (collector.protocol !== "https:" || site.protocol !== "https:" ||
        collector.username || collector.password || collector.search || collector.hash) return null;
    return {
      endpoint: new URL("/api/events", collector.origin).href,
      websiteId: values.DATABULL_WEBSITE_ID!,
      domain: site.hostname.replace(/^www\./, ""),
    };
  } catch { return null; }
}
