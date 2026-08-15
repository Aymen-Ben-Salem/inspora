import Image from "next/image";

import { isGifUrl, type Post } from "@/domain/post";

import { DetailMotion } from "./detail-motion";
import { LoopingVideo } from "./looping-video";
import { ResponsiveR2Image } from "./responsive-r2-image";

export function PostGallery({ post, overlay = false }: { post: Post; overlay?: boolean }) {
  return (
    <DetailMotion overlay={overlay}>
      {post.media.map((media) => {
        const isPortrait = media.height / media.width >= 1.15;
        const maxViewportHeight = overlay
          ? isPortrait
            ? 85
            : 72
          : 79.2;
        const aspectRatio = media.width / media.height;
        const maxViewportWidth = maxViewportHeight * aspectRatio;
        const isAnimated = media.type === "video" || isGifUrl(media.url);
        const isConvertedGif =
          media.type === "video" && media.sourceMimeType === "image/gif";
        const mediaUrl = media.url;
        const posterUrl = media.posterUrl;

        return (
          <figure
            key={media.id}
            data-detail-media
            className={`flex min-w-full snap-center items-center justify-center ${
              overlay
                ? "h-auto px-4 py-6 sm:px-8 sm:py-8 md:px-10 md:py-10 lg:h-full lg:py-0"
                : "h-full px-4 py-10 sm:px-8 lg:px-10 lg:py-0"
            }`}
          >
            <div
              data-post-dialog-surface={overlay ? "" : undefined}
              data-post-dialog-hero={overlay && media.position === 0 ? "" : undefined}
              data-post-dialog-animated-media={isAnimated ? "" : undefined}
              data-post-dialog-max-viewport-height={maxViewportHeight}
              data-post-dialog-max-pixel-width={isConvertedGif ? media.width : undefined}
              className={`relative shrink-0 overflow-hidden bg-[#f3f3f3] ${
                overlay ? "rounded-none" : "rounded-[10px]"
              }`}
              style={{
                aspectRatio: `${media.width} / ${media.height}`,
                width: isConvertedGif
                  ? `min(100%, ${maxViewportWidth}dvh, ${media.width}px)`
                  : `min(100%, ${maxViewportWidth}dvh)`,
              }}
            >
              {media.type === "video" ? (
                <LoopingVideo
                  src={mediaUrl}
                  poster={posterUrl}
                  aria-label={media.alt}
                  draggable={false}
                  eager
                  width={media.width}
                  height={media.height}
                  className="size-full object-cover"
                />
              ) : media.storageProvider === "r2" ? (
                <ResponsiveR2Image
                  src={mediaUrl}
                  alt={media.alt}
                  width={media.width}
                  height={media.height}
                  variants={media.variants}
                  sizes="(min-width: 1024px) 48vw, 90vw"
                  priority={media.position === 0}
                  className="size-full object-cover"
                />
              ) : (
                <Image
                  src={mediaUrl}
                  alt={media.alt}
                  fill
                  unoptimized={isGifUrl(media.url)}
                  sizes="(min-width: 1024px) 48vw, 90vw"
                  priority={media.position === 0}
                  className="object-cover"
                />
              )}
            </div>
          </figure>
        );
      })}
    </DetailMotion>
  );
}
