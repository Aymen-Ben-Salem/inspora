import type {
  CampaignInput,
  CreativeSnapshot,
  SponsorshipResult,
  VerifiedSponsorAsset,
} from "./types";
export async function resolveSponsorCreative(
  input: CampaignInput,
  find: (id: string) => Promise<VerifiedSponsorAsset | null>,
): Promise<SponsorshipResult<CreativeSnapshot>> {
  const { expectedRevision: _revision, ...fields } = input;
  void _revision;
  const attachments = [
    [fields.iconId, "icon"],
    [fields.wordmarkId, "wordmark"],
    [fields.mediaId, "media"],
    [fields.posterId, "poster"],
    [fields.videoPreviewId, "video-preview"],
    ...fields.variantIds.map((id) => [id, "variant"]),
  ];
  const assets: VerifiedSponsorAsset[] = [];
  for (const [id, kind] of attachments) {
    if (!id) continue;
    const asset = await find(id);
    if (!asset || asset.kind !== kind)
      return {
        ok: false,
        code: "forbidden",
        message:
          "Use verified assets from your own campaign or current uploads.",
      };
    if (!assets.some((a) => a.id === id)) assets.push(asset);
    if (asset.sourceAssetId) {
      const source = await find(asset.sourceAssetId);
      if (!source || source.kind !== "original" || source.sourceAssetId)
        return {
          ok: false,
          code: "forbidden",
          message:
            "Use a verified original from your own campaign or current uploads.",
        };
      if (!assets.some((a) => a.id === source.id)) assets.push(source);
    }
  }
  const video = assets
    .find((a) => a.id === fields.mediaId)
    ?.contentType.startsWith("video/");
  if (video && (!fields.posterId || !fields.videoPreviewId))
    return {
      ok: false,
      code: "invalid_input",
      message: "Video requires a verified poster and preview.",
    };
  if (!video && (fields.posterId || fields.videoPreviewId))
    return {
      ok: false,
      code: "invalid_input",
      message: "Poster and video preview require a video.",
    };
  if (!fields.mediaId && fields.variantIds.length)
    return {
      ok: false,
      code: "invalid_input",
      message: "Image variants require feed media.",
    };
  return { ok: true, value: { ...fields, assets } };
}
