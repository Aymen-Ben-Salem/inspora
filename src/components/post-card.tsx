import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import { isGifUrl, type Post } from "@/domain/post";
import {
  optimizeCloudinaryAnimatedImageUrl,
  optimizeCloudinaryPosterUrl,
  optimizeCloudinaryVideoUrl,
} from "@/storage/cloudinary-delivery";

import { LoopingVideo } from "./looping-video";
import { ResponsiveR2Image } from "./responsive-r2-image";

export function PostCard({ post, priority = false }: { post: Post; priority?: boolean }) {
  const cover = post.media[0];

  if (!cover) return null;

  const isAnimatedImage = cover.type === "image" && isGifUrl(cover.url);
  const isManagedMedia = cover.storageProvider === "cloudinary";
  const mediaUrl =
    isManagedMedia && cover.type === "video"
      ? optimizeCloudinaryVideoUrl(cover.url)
      : isManagedMedia && isAnimatedImage
        ? optimizeCloudinaryAnimatedImageUrl(cover.url)
        : cover.url;
  const posterUrl = isManagedMedia && cover.posterUrl
    ? optimizeCloudinaryPosterUrl(cover.posterUrl)
    : cover.posterUrl;

  return (
    <article data-feed-card>
      <Link
        data-feed-post-id={post.id}
        href={`/posts/${post.slug}` as Route}
        aria-label={`View post: ${post.title}`}
        className="focus-ring group relative block overflow-hidden rounded-[20px] bg-[#f3f3f3]"
        style={{ aspectRatio: `${cover.width}/${cover.height}` }}
      >
        {cover.type === "video" ? (
          <LoopingVideo
            data-feed-transition-media
            src={mediaUrl}
            poster={posterUrl}
            aria-label={cover.alt}
            draggable={false}
            className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
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
            className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
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
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        )}
        <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/0 opacity-40 transition-opacity duration-300 group-hover:opacity-100" />
        <span className="absolute inset-x-[10px] bottom-[10px] z-10 flex items-end gap-[7px] min-[1800px]:inset-x-3 min-[1800px]:bottom-3 min-[1800px]:gap-2">
          {post.creator.avatarStorageProvider === "r2" ? (
            <ResponsiveR2Image
              src={post.creator.avatarUrl}
              alt=""
              width={35}
              height={35}
              sizes="35px"
              className="size-7 shrink-0 rounded-full border border-[#e6e6e6] object-cover xl:size-[30px] min-[1800px]:size-[35px]"
            />
          ) : (
            <Image
              src={post.creator.avatarUrl}
              alt=""
              width={35}
              height={35}
              className="size-7 shrink-0 rounded-full border border-[#e6e6e6] object-cover xl:size-[30px] min-[1800px]:size-[35px]"
            />
          )}
          <span className="min-w-0 translate-y-1 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            <span className="block truncate text-[12px] font-medium leading-tight text-white min-[1800px]:text-[13px]">
              {post.title}
            </span>
            <span className="block truncate text-[10px] leading-tight text-white/75 min-[1800px]:text-[11px]">
              {post.creator.name}
            </span>
          </span>
        </span>
        {post.media.length > 1 ? (
          <span className="absolute right-[10px] top-[10px] z-10 flex size-6 items-center justify-center rounded-full bg-black/35 text-[10px] text-white shadow-sm backdrop-blur-md xl:size-[26px] xl:text-[11px] min-[1800px]:right-3 min-[1800px]:top-3 min-[1800px]:size-7 min-[1800px]:text-xs">
            <span className="sr-only">{post.media.length} slides</span>
            <span aria-hidden="true">{post.media.length}</span>
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-0 rounded-[20px] border border-black/10" />
      </Link>
    </article>
  );
}
