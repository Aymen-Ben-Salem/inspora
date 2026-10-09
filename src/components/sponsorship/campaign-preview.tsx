import Image from "next/image";
import { SponsoredPostCard } from "@/components/sponsored-post-card";
import type { VerifiedSponsorAsset } from "@/features/sponsorship/types";
export type PreviewFields = {
  title: string;
  url: string;
  tagline: string;
  iconId: string;
  wordmarkId: string;
  mediaId: string;
  posterId: string;
  videoPreviewId: string;
};
export function CampaignPreview({
  fields,
  assets,
}: {
  fields: PreviewFields;
  assets: VerifiedSponsorAsset[];
}) {
  const asset = (id: string) => assets.find((a) => a.id === id);
  const icon = asset(fields.iconId),
    wordmark = asset(fields.wordmarkId),
    media = asset(fields.mediaId),
    poster = asset(fields.posterId),
    video = asset(fields.videoPreviewId);
  const title = fields.title || "Your product",
    url = /^https?:\/\//.test(fields.url) ? fields.url : "https://example.com";
  return (
    <aside
      aria-label="Placement previews"
      className="space-y-6 lg:sticky lg:top-28 lg:self-start"
    >
      <div>
        <h2 className="text-lg font-medium">Your three placements</h2>
        <p className="mt-1 text-sm text-[#767676]">
          Private preview. Nothing is public or paid.
        </p>
      </div>
      <section className="rounded-md border border-[#e6e6e6] p-4">
        <h3 className="mb-3 text-xs text-[#767676]">Navbar · compact icon</h3>
        <div className="flex h-12 items-center justify-end gap-2">
          {icon ? (
            <Image
              src={icon.url}
              alt={title}
              width={35}
              height={35}
              unoptimized
              className="size-[35px] rounded-md border border-[#e6e6e6] object-contain p-1"
            />
          ) : (
            <span className="flex size-[35px] items-center justify-center rounded-md bg-[#f0f0f0] text-xs">
              Icon
            </span>
          )}
          <span className="flex size-[35px] items-center justify-center rounded-md border border-dashed border-[#e6e6e6] text-xl text-[#767676]">
            +
          </span>
          <span className="ml-2 size-[35px] rounded-full bg-[#f0f0f0]" />
        </div>
      </section>
      <section className="rounded-md border border-[#e6e6e6] p-4">
        <h3 className="mb-3 text-xs text-[#767676]">
          Feed · image, video or brand card
        </h3>
        <SponsoredPostCard
          sponsor={{
            id: "private-preview",
            title,
            url,
            tagline: fields.tagline,
            mediaType: media?.contentType.startsWith("video/")
              ? "video"
              : "image",
            mediaUrl: media?.url,
            mediaPosterUrl: poster?.url,
            mediaWidth: media?.width ?? 1200,
            mediaHeight: media?.height ?? 800,
            mediaAlt: `${title} preview`,
            iconUrl: icon?.url,
            mediaVideoPreview: video
              ? {
                  url: video.url,
                  storageKey: video.id,
                  width: video.width,
                  height: video.height,
                  bytes: video.sizeBytes,
                  format: "mp4",
                }
              : undefined,
          }}
        />
      </section>
      <section className="rounded-md border border-[#e6e6e6] p-4">
        <h3 className="mb-3 text-xs text-[#767676]">
          Detail sidebar · full wordmark
        </h3>
        <div className="flex h-12 items-center justify-center">
          {wordmark ? (
            <Image
              src={wordmark.url}
              alt={title}
              width={160}
              height={28}
              unoptimized
              className="max-h-7 max-w-[160px] object-contain"
            />
          ) : (
            <span className="text-lg font-semibold">{title}</span>
          )}
        </div>
      </section>
    </aside>
  );
}
