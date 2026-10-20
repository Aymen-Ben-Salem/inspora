"use client";
import { campaignType } from "./campaign-typography";
import Image from "next/image";
import { useState } from "react";
import { SponsoredPostCard } from "@/components/sponsored-post-card";
import type { VerifiedSponsorAsset } from "@/features/sponsorship/types";
export type PreviewFields = {
  title: string;
  url: string;
  feedDescription: string;
  iconId: string;
  wordmarkId: string;
  mediaId: string;
  posterId: string;
  videoPreviewId: string;
};
export function CampaignPreview({
  fields,
  assets,
  paid = false,
}: {
  fields: PreviewFields;
  assets: VerifiedSponsorAsset[];
  paid?: boolean;
}) {
  const [feedVariant, setFeedVariant] = useState<"website" | "default">("website");
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
        <h2 className={campaignType.heading}>Your three placements</h2>
        <p className={`${campaignType.body} mt-1 text-[#767676]`}>
          {paid ? "Preview your changes." : "Only visible to you."}
        </p>
      </div>
      <section className="rounded-md border border-[#e6e6e6] p-4">
        <h3 className={`${campaignType.caption} mb-3 text-[#767676]`}>Navbar · compact icon</h3>
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
            <span className={`${campaignType.caption} flex size-[35px] items-center justify-center rounded-md bg-[#f0f0f0]`}>
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
        <h3 className={`${campaignType.caption} mb-3 text-[#767676]`}>
          Feed · image, video or brand card
        </h3>
        <div role="group" aria-label="Feed preview" className="mb-3 flex gap-2">
          {([["website", "Websites"], ["default", "Design & logos"]] as const).map(([variant, label]) => (
            <button
              key={variant}
              type="button"
              aria-pressed={feedVariant === variant}
              onClick={() => setFeedVariant(variant)}
              className={`${campaignType.caption} focus-ring cursor-pointer rounded-md border px-2 py-1 ${feedVariant === variant ? "border-[#262626] bg-[#262626] text-white" : "border-[#e6e6e6] text-[#767676]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <SponsoredPostCard
          variant={feedVariant}
          sponsor={{
            id: "private-preview",
            title,
            url,
            feedDescription: fields.feedDescription,
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
        <h3 className={`${campaignType.caption} mb-3 text-[#767676]`}>
          Detail sidebar · full wordmark
        </h3>
        <div className="flex h-12 items-center justify-center">
          {wordmark ? (
            <Image
              src={wordmark.url}
              alt={title}
              width={112}
              height={18}
              unoptimized
              className="max-h-[18px] w-auto max-w-[112px] object-contain"
            />
          ) : (
            <span className={`${campaignType.body} text-[#767676]`}>Wordmark not imported</span>
          )}
        </div>
      </section>
    </aside>
  );
}
