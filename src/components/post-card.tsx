import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import { isGifUrl, type PostCardData } from "@/domain/post";

import { LoopingVideo } from "./looping-video";
import { IntentPrefetchLink } from "./intent-prefetch-link";
import { ResponsiveR2Image } from "./responsive-r2-image";
import { CreatorAvatar } from "./creator-avatar";
import { creatorProfileHref } from "./creator-avatar";
import { FeedSaveButton } from "./feed-save-overlay";

export function PostCard({
  post,
  priority = false,
  initiallySaved = false,
  onSavedChange,
  showCreator = true,
}: {
  post: PostCardData;
  priority?: boolean;
  initiallySaved?: boolean;
  onSavedChange?: (saved: boolean) => void;
  showCreator?: boolean;
}) {
  const cover = post.media[0];

  if (!cover) return null;

  const isAnimatedImage = cover.type === "image" && isGifUrl(cover.url);
  const mediaUrl = cover.url;
  const feedMediaUrl = cover.videoPreview?.url ?? mediaUrl;
  const posterUrl = cover.posterUrl;

  return (
    <article data-feed-card>
      <div className="group relative">
      <IntentPrefetchLink
        data-feed-post-id={post.id}
        data-feed-post-pathname={`/posts/${post.slug}`}
        data-feed-post-title={post.title}
        data-feed-creator-name={post.creator.name}
        href={`/posts/${post.slug}` as Route}
        aria-label={`View work: ${post.title}${post.mediaCount > 1 ? `, ${post.mediaCount} slides` : ""}`}
        className="focus-ring relative block overflow-hidden bg-[#f3f3f3]"
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
              lazyPoster
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
        {post.mediaCount > 1 ? (
          <span className="absolute right-[10px] top-[10px] z-10 flex h-6 min-w-6 items-center justify-center border border-black/10 bg-white/90 px-1.5 text-[10px] text-[#262626] backdrop-blur-md xl:h-[26px] xl:min-w-[26px] xl:text-[11px] min-[1800px]:right-3 min-[1800px]:top-3 min-[1800px]:h-7 min-[1800px]:min-w-7 min-[1800px]:text-xs">
            <span className="sr-only">{post.mediaCount} slides</span>
            <span aria-hidden="true">{post.mediaCount}</span>
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-0 border border-black/[0.06]" />
      </IntentPrefetchLink>
      {showCreator && creatorProfileHref(post.creator) ? (
        <Link href={creatorProfileHref(post.creator)! as Route} aria-label={`View ${post.creator.name}'s profile`} className="focus-ring absolute bottom-[var(--archive-card-overlay-inset)] left-[var(--archive-card-overlay-inset)] z-20 rounded-full">
          <CreatorAvatar creator={post.creator} role="feed" width={35} height={35} sizes="35px" className="size-[var(--archive-card-overlay-size)] shrink-0 rounded-full border border-[#e6e6e6] object-cover" />
        </Link>
      ) : null}
      <FeedSaveButton
        postId={post.id}
        initiallySaved={initiallySaved}
        onSavedChange={onSavedChange}
      />
      </div>
    </article>
  );
}
