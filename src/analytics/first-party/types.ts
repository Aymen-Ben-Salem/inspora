export const EVENT_KINDS = [
  "site_page_view",
  "sponsor_impression",
  "sponsor_click",
  "sponsor_preview_started",
  "sponsor_preview_view",
  "sponsor_preview_progress",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export type Placement = "header" | "feed" | "detail";
export type DeviceKind = "desktop" | "mobile" | "tablet" | "unknown";
export type SponsorRange = "1d" | "7d" | "30d";
export type AnalyticsEvent = {
  occurrenceId: string;
  kind: EventKind;
  occurredAt: string;
  token: string;
  milestone?: 25 | 50 | 75 | 100;
};
export type DeliveryContext = {
  pageId: string;
  path: string;
  issuedAt: number;
  expiresAt: number;
  campaignId?: string;
  versionId?: string;
  placement?: Placement;
  previewVideo?: boolean;
  referrerDomain?: string;
};
export type VisitorContext = {
  visitorKey: string | null;
  /** Minute-scoped abuse control only; never a reach identity or report field. */
  abuseKey?: string;
  countryCode: string | null;
  device: DeviceKind;
  referrerDomain: string | null;
};
export type AcceptedEvent = AnalyticsEvent &
  Omit<DeliveryContext, "referrerDomain"> &
  VisitorContext;
export type AcceptedBatch = {
  accepted: string[];
  duplicate: string[];
  excluded: string[];
};
