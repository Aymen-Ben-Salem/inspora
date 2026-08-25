import Image from "next/image";

import type { ActiveSponsor } from "@/domain/sponsor";

import { LoopingVideo } from "./looping-video";
import { ResponsiveR2Image } from "./responsive-r2-image";

function getHostname(urlStr: string) {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, "");
  } catch {
    return urlStr;
  }
}

export function SponsoredPostCard({
  sponsor,
  priority = false,
}: {
  sponsor: ActiveSponsor;
  priority?: boolean;
}) {
  const isVideo = sponsor.mediaType === "video";
  const mediaUrl = sponsor.mediaUrl;
  const feedMediaUrl = sponsor.mediaVideoPreview?.url ?? mediaUrl;
  const posterUrl = sponsor.mediaPosterUrl;
  const hostname = getHostname(sponsor.url);

  return (
    <article data-feed-card className="flex flex-col -order-1 min-[460px]:order-none">
      <a
        href={sponsor.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Sponsored: ${sponsor.title}`}
        className="focus-ring group relative block overflow-hidden bg-[#f3f3f3]"
        style={{ aspectRatio: `${sponsor.mediaWidth || 1200}/${sponsor.mediaHeight || 800}` }}
      >
        {mediaUrl ? (
          isVideo ? (
            <>
              {priority && posterUrl ? (
                <link
                  rel="preload"
                  as="image"
                  href={posterUrl}
                  fetchPriority="high"
                />
              ) : null}
              <LoopingVideo
                src={feedMediaUrl}
                poster={posterUrl}
                aria-label={sponsor.mediaAlt || `${sponsor.title} preview`}
                draggable={false}
                eager={priority}
                preload={priority ? "auto" : undefined}
                suspendWithFeed
                className="absolute inset-0 size-full object-cover"
              />
            </>
          ) : sponsor.mediaStorageProvider === "r2" ? (
            <ResponsiveR2Image
              src={mediaUrl}
              alt={sponsor.mediaAlt || `${sponsor.title} sponsored`}
              width={sponsor.mediaWidth || 1200}
              height={sponsor.mediaHeight || 800}
              variants={sponsor.mediaVariants}
              sizes="(min-width: 1120px) 395px, (min-width: 760px) 33vw, (min-width: 460px) 50vw, 100vw"
              priority={priority}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <Image
              src={mediaUrl}
              alt={sponsor.mediaAlt || `${sponsor.title} sponsored`}
              fill
              unoptimized
              priority={priority}
              sizes="(min-width: 1120px) 395px, (min-width: 760px) 33vw, (min-width: 460px) 50vw, 100vw"
              className="object-cover"
            />
          )
        ) : (
          /* Web fallback card when no custom media is uploaded */
          <div className="flex size-full flex-col items-center justify-center bg-[#111] p-6 text-center text-white">
            {sponsor.iconUrl ? (
              <div className="mb-3 flex size-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-2">
                <Image
                  src={sponsor.iconUrl}
                  alt={sponsor.title}
                  width={48}
                  height={48}
                  unoptimized
                  className="size-full object-contain"
                />
              </div>
            ) : null}
            <span className="text-base font-semibold tracking-tight sm:text-lg">
              {sponsor.title}
            </span>
            <span className="mt-0.5 text-xs text-white/60">
              {hostname}
            </span>
          </div>
        )}

        {/* Sponsor badge on top-right of the card */}
        <span className="absolute right-[10px] top-[10px] z-10 rounded-full bg-[#262626]/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white min-[1800px]:right-3 min-[1800px]:top-3 min-[1800px]:text-[11px]">
          SPONSOR
        </span>

        <span className="pointer-events-none absolute inset-0 border border-black/[0.06]" />
      </a>

      {/* Optional small text under the sponsored post */}
      {sponsor.tagline ? (
        <div className="pt-2 px-0.5">
          <a
            href={sponsor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring block text-[13px] font-medium leading-snug text-[#262626] transition-colors hover:text-black sm:text-[14px]"
          >
            {sponsor.tagline}
          </a>
        </div>
      ) : null}
    </article>
  );
}
