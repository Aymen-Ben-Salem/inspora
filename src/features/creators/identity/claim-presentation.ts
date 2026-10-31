import "server-only";

import { eq } from "drizzle-orm";
import { requireDatabase } from "@/db/client";
import { creators } from "@/db/schema";
import { getPublishedCreatorWorkCounts, getPublishedCreatorWorkPage } from "@/features/profiles/repository";
import { profileValuesForApprovedClaimMerge } from "./claim-review";
import { mapCreatorSummary } from "./projections";
import type { CreatorClaimPreview } from "../types";

// Presentation only. Ownership and X evidence are checked again when claiming.
export async function getCreatorClaimPreview(target: typeof creators.$inferSelect, verifiedUserId?: string): Promise<CreatorClaimPreview> {
  const [counts, page, source] = await Promise.all([
    getPublishedCreatorWorkCounts(target.id),
    getPublishedCreatorWorkPage({ creatorId: target.id, filter: "all" }),
    verifiedUserId ? requireDatabase().query.creators.findFirst({ where: eq(creators.ownerUserId, verifiedUserId) }) : undefined,
  ]);
  const merging = source && source.id !== target.id && !source.trashedAt ? source : undefined;
  const result = merging ? { ...target, ...profileValuesForApprovedClaimMerge(target, merging) } : target;
  const sourceCount = merging ? (await getPublishedCreatorWorkCounts(merging.id)).total : 0;
  return {
    profile: mapCreatorSummary(target),
    resultingProfile: verifiedUserId ? mapCreatorSummary(result) : undefined,
    workCount: counts.total,
    combinedWorkCount: counts.total + sourceCount,
    merging: Boolean(merging),
    thumbnails: page.items.slice(0, 3).flatMap(item => {
      if (item.kind === "website") return [{ url: item.website.recording.posterUrl, title: item.website.title }];
      if (item.kind === "logo") return [{ url: item.logo.media.variants?.[0]?.url ?? item.logo.media.url, title: item.logo.title }];
      const media = item.media[0];
      const url = media?.type === "video" ? media.posterUrl : media?.variants?.[0]?.url ?? media?.url;
      return url ? [{ url, title: item.title }] : [];
    }),
  };
}
