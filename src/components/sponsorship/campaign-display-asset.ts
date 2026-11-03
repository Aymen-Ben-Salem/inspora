import type { VerifiedSponsorAsset } from "@/features/sponsorship/types";

// Presentation only: these props never confer upload ownership or publication.
export type CampaignDisplayAsset = Pick<VerifiedSponsorAsset,
  "id" | "url" | "contentType" | "width" | "height" | "sizeBytes"
>;
