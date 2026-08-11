import Image from "next/image";

import { isGifUrl, type Post } from "@/domain/post";
import {
  optimizeCloudinaryAnimatedImageUrl,
  optimizeCloudinaryPosterUrl,
  optimizeCloudinaryVideoUrl,
} from "@/storage/cloudinary-delivery";

import { DetailMotion } from "./detail-motion";
import { LoopingVideo } from "./looping-video";
import { ResponsiveR2Image } from "./responsive-r2-image";

export function PostGallery({ post, overlay = false }: { post: Post; overlay?: boolean }) {
  return (
    <DetailMotion overlay={overlay}>
      {post.media.map((media) => {
        const minimumVerticalInset = 32;
        const fluidVerticalInset = 18;
        const maximumVerticalInset = 124;
        const maxViewportHeight = overlay ? 79.7 : 79.2;
        const aspectRatio = media.width / media.height;
        const maxViewportWidth = maxViewportHeight * aspectRatio;
        const maxContainerWidth = `calc(${aspectRatio * 100}cqh - clamp(${aspectRatio * minimumVerticalInset}px, ${aspectRatio * fluidVerticalInset}cqh, ${aspectRatio * maximumVerticalInset}px))`;
        const isAnimated = media.type === "video" || isGifUrl(media.url);
        const isConvertedGif =
          media.type === "video" && media.sourceMimeType === "image/gif";
        const isManagedMedia = media.storageProvider === "cloudinary";
        const mediaUrl =
          isManagedMedia && media.type === "video"
            ? optimizeCloudinaryVideoUrl(media.url)
            : isManagedMedia && isAnimated
              ? optimizeCloudinaryAnimatedImageUrl(media.url)
              : media.url;
        const posterUrl = isManagedMedia && media.posterUrl
          ? optimizeCloudinaryPosterUrl(media.posterUrl)
          : media.posterUrl;

        return (
          <figure
            key={media.id}
            data-detail-media
            className={`flex h-full min-w-full snap-center items-center justify-center px-4 sm:px-8 lg:px-10 lg:py-0 ${overlay ? "py-4" : "py-10"}`}
          >
            <div
              data-post-dialog-surface={overlay ? "" : undefined}
              data-post-dialog-hero={overlay && media.position === 0 ? "" : undefined}
              data-post-dialog-animated-media={isAnimated ? "" : undefined}
              data-post-dialog-max-viewport-height={maxViewportHeight}
              data-post-dialog-container-inset-min={minimumVerticalInset}
              data-post-dialog-container-inset-fluid={fluidVerticalInset}
              data-post-dialog-container-inset-max={maximumVerticalInset}
              data-post-dialog-max-pixel-width={isConvertedGif ? media.width : undefined}
              className={`relative shrink-0 overflow-hidden bg-[#f3f3f3] ${
                overlay ? "rounded-none" : "rounded-[10px]"
              }`}
              style={{
                aspectRatio: `${media.width} / ${media.height}`,
                width: isConvertedGif
                  ? `min(100%, ${maxViewportWidth}dvh, ${media.width}px, ${maxContainerWidth})`
                  : `min(100%, ${maxViewportWidth}dvh, ${maxContainerWidth})`,
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
