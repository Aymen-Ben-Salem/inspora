import Image from "next/image";
import type { Route } from "next";

import { isGifUrl, type PostCardData } from "@/domain/post";

import { LoopingVideo } from "./looping-video";
import { IntentPrefetchLink } from "./intent-prefetch-link";
import { ResponsiveR2Image } from "./responsive-r2-image";

export function PostCard({
  post,
  priority = false,
}: {
  post: PostCardData;
  priority?: boolean;
}) {
  const cover = post.media[0];

  if (!cover) return null;

  const isAnimatedImage = cover.type === "image" && isGifUrl(cover.url);
  const mediaUrl = cover.url;
  const feedMediaUrl = cover.videoPreview?.url ?? mediaUrl;
  const posterUrl = cover.posterUrl;

  return (
    <article data-feed-card>
      <IntentPrefetchLink
        data-feed-post-id={post.id}
        data-feed-post-pathname={`/posts/${post.slug}`}
        data-feed-post-title={post.title}
        data-feed-creator-name={post.creator.name}
        href={`/posts/${post.slug}` as Route}
        aria-label={`View post: ${post.title}`}
        className="focus-ring group relative block overflow-hidden bg-[#f3f3f3]"
        style={{ aspectRatio: `${cover.width}/${cover.height}` }}
      >
        {cover.type === "video" ? (
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
              data-feed-transition-media
              src={feedMediaUrl}
              poster={posterUrl}
              aria-label={cover.alt}
              draggable={false}
              eager={priority}
              preload={priority ? "auto" : undefined}
              suspendWithFeed
              className="absolute inset-0 size-full object-cover"
            />
          </>
        ) : cover.storageProvider === "r2" ? (
          <ResponsiveR2Image
            data-feed-transition-media
            src={mediaUrl}
            alt={cover.alt}
            width={cover.width}
            height={cover.height}
            variants={cover.variants}
            sizes="(min-width: 1120px) 395px, (min-width: 760px) 33vw, (min-width: 460px) 50vw, 100vw"
            priority={priority}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <Image
            data-feed-transition-media
            src={mediaUrl}
            alt={cover.alt}
            fill
            unoptimized={isAnimatedImage}
            priority={priority}
            sizes="(min-width: 1120px) 395px, (min-width: 760px) 33vw, (min-width: 460px) 50vw, 100vw"
            className="object-cover"
          />
        )}
        <span className="absolute bottom-[10px] left-[10px] z-10 flex items-end min-[1800px]:bottom-3 min-[1800px]:left-3">
          {post.creator.avatarStorageProvider === "r2" ? (
            <ResponsiveR2Image
              data-feed-creator-avatar
              src={post.creator.avatarUrl}
              alt=""
              width={35}
              height={35}
              sizes="35px"
              className="size-7 shrink-0 rounded-full border border-[#e6e6e6] object-cover xl:size-[30px] min-[1800px]:size-[35px]"
            />
          ) : (
            <Image
              data-feed-creator-avatar
              src={post.creator.avatarUrl}
              alt=""
              width={35}
              height={35}
              className="size-7 shrink-0 rounded-full border border-[#e6e6e6] object-cover xl:size-[30px] min-[1800px]:size-[35px]"
            />
          )}
        </span>
        {post.mediaCount > 1 ? (
          <span className="absolute right-[10px] top-[10px] z-10 flex h-6 min-w-6 items-center justify-center border border-black/10 bg-white/90 px-1.5 text-[10px] text-[#262626] backdrop-blur-md xl:h-[26px] xl:min-w-[26px] xl:text-[11px] min-[1800px]:right-3 min-[1800px]:top-3 min-[1800px]:h-7 min-[1800px]:min-w-7 min-[1800px]:text-xs">
            <span className="sr-only">{post.mediaCount} slides</span>
            <span aria-hidden="true">{post.mediaCount}</span>
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-0 border border-black/[0.06]" />
      </IntentPrefetchLink>
    </article>
  );
}
