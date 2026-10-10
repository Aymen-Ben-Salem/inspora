import type { CreativeSnapshot } from "./types";
import type { PublicSponsorAsset } from "./public-media";
// The activation and editing paths replace exactly the same complete public fields.
export function sponsorPublicCreative(
  creative: CreativeSnapshot,
  promoted: PublicSponsorAsset[],
) {
  const asset = (id: string | undefined) => promoted.find((a) => a.id === id);
  const verified = (id: string | undefined) =>
    creative.assets.find((a) => a.id === id);
  if (
    !asset(creative.iconId) ||
    !asset(creative.wordmarkId) ||
    creative.assets.some((a) => a.kind !== "original" && !asset(a.id))
  )
    throw new Error("Incomplete public sponsor media.");
  const media = asset(creative.mediaId),
    source = verified(creative.mediaId),
    preview = asset(creative.videoPreviewId),
    previewSource = verified(creative.videoPreviewId);
  return {
    title: creative.title,
    url: creative.url,
    tagline: creative.tagline,
    mediaType: source?.contentType.startsWith("video/") ? "video" : "image",
    mediaUrl: media?.url ?? null,
    mediaStorageKey: media?.key ?? null,
    mediaStorageProvider: media ? "r2" : null,
    mediaWidth: source?.width ?? 1200,
    mediaHeight: source?.height ?? 800,
    mediaPosterUrl: asset(creative.posterId)?.url ?? null,
    mediaPosterStorageKey: asset(creative.posterId)?.key ?? null,
    iconUrl: asset(creative.iconId)!.url,
    iconStorageKey: asset(creative.iconId)!.key,
    iconStorageProvider: "r2",
    wordmarkUrl: asset(creative.wordmarkId)!.url,
    wordmarkStorageKey: asset(creative.wordmarkId)!.key,
    mediaAlt: creative.title,
    mediaVariants: creative.variantIds.map((id) => ({
      url: asset(id)!.url,
      storageKey: asset(id)!.key,
      width: verified(id)!.width,
      height: verified(id)!.height,
      bytes: verified(id)!.sizeBytes,
      format: "webp" as const,
    })),
    mediaVideoPreview:
      preview && previewSource
        ? {
            url: preview.url,
            storageKey: preview.key,
            width: previewSource.width,
            height: previewSource.height,
            bytes: previewSource.sizeBytes,
            format: "mp4" as const,
          }
        : null,
  };
}
