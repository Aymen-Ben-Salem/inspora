import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import type { Post } from "@/domain/post";

import { NewsletterForm } from "./newsletter-form";
import {
  PostCloseButton,
  postNavigationControlClassName,
} from "./post-close-button";
import type { PostDialogCloseMode } from "./post-dialog";
import { TrackedOriginalLink } from "./tracked-original-link";
import { ResponsiveR2Image } from "./responsive-r2-image";

const originalLinkClassName =
  "focus-ring inline-flex h-9 w-full items-center justify-center bg-[#262626] px-3 text-[14px] font-medium leading-normal tracking-[0.036px] text-white transition-colors hover:bg-black xl:h-[42px] xl:text-[16px] min-[1700px]:h-[43px] min-[1700px]:px-[14px] min-[1700px]:text-[18px]";

type AdjacentPost = Pick<Post, "slug" | "title">;

function MetadataRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;

  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-3 xl:grid-cols-[92px_minmax(0,1fr)] xl:gap-4 min-[1700px]:grid-cols-[112px_minmax(0,1fr)] min-[1700px]:gap-5">
      <p className="pt-1 text-[14px] tracking-[0.04px] text-[#262626] xl:text-[16px] min-[1700px]:text-[20px]">
        {label}
      </p>
      <div className="flex flex-wrap gap-2.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex min-h-7 items-center bg-[#e6e6e6] px-2 py-1.5 text-[11px] tracking-[0.024px] text-[#262626] xl:min-h-8 xl:px-2.5 xl:py-2 xl:text-[12px]"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5 xl:size-[22px] min-[1800px]:size-6"
      fill="none"
    >
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 27 27"
      aria-hidden="true"
      className={`size-[22px] xl:size-6 min-[1800px]:size-[27px] ${direction === "right" ? "rotate-180" : ""}`}
      fill="none"
    >
      <path d="M22 13.5H5m0 0 7-7m-7 7 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CircleLink({
  href,
  label,
  children,
  replace = false,
  prefetch,
}: {
  href: Route;
  label: string;
  children: ReactNode;
  replace?: boolean;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      replace={replace}
      prefetch={prefetch}
      aria-label={label}
      className={postNavigationControlClassName}
    >
      {children}
    </Link>
  );
}

export function PostMetadata({
  post,
  previousPost,
  nextPost,
  closeMode,
  overlay = false,
}: {
  post: Post;
  previousPost: AdjacentPost;
  nextPost: AdjacentPost;
  closeMode?: PostDialogCloseMode;
  overlay?: boolean;
}) {
  return (
    <aside
      data-post-dialog-surface={overlay ? "" : undefined}
      data-post-dialog-sidebar={overlay ? "" : undefined}
      className={`flex w-full flex-col border-t border-[#e6e6e6] bg-white lg:border-l lg:border-t-0 ${
        overlay
          ? "min-h-fit flex-none lg:min-h-full lg:w-[clamp(360px,30vw,510px)] lg:shrink-0"
          : "order-first min-h-[100dvh] shrink-0 lg:order-last lg:h-[100dvh] lg:w-[clamp(360px,30vw,510px)]"
      }`}
    >
      <div className="flex flex-1 flex-col px-5 py-5 sm:px-7 lg:min-h-full lg:px-6 lg:py-5 xl:px-8 xl:py-6 min-[1700px]:px-10 min-[1700px]:py-7">
        <nav className="flex h-10 items-center justify-between" aria-label="Post navigation">
          {closeMode ? (
            <PostCloseButton closeMode={closeMode}>
              <CloseIcon />
            </PostCloseButton>
          ) : (
            <CircleLink href="/" label="Close post">
              <CloseIcon />
            </CircleLink>
          )}
          <div className="flex items-center gap-3 xl:gap-4 min-[1700px]:gap-5">
            <CircleLink
              href={`/posts/${previousPost.slug}` as Route}
              label={`Previous post: ${previousPost.title}`}
              replace={overlay}
              prefetch={false}
            >
              <ArrowIcon direction="left" />
            </CircleLink>
            <CircleLink
              href={`/posts/${nextPost.slug}` as Route}
              label={`Next post: ${nextPost.title}`}
              replace={overlay}
              prefetch={false}
            >
              <ArrowIcon direction="right" />
            </CircleLink>
          </div>
        </nav>

        <div className="flex flex-1 items-start pt-8 lg:pt-6 xl:pt-[30px]">
          <div className="flex w-full flex-col gap-6 xl:gap-8 min-[1700px]:gap-10">
            <div className="flex flex-col gap-3 xl:gap-4 min-[1700px]:gap-5">
              <div className="flex flex-col items-start gap-2.5">
                <span className="inline-flex min-h-6 items-center bg-[#f0f0f0] px-2.5 py-1 text-[12px] tracking-[0.2px] text-[#7b7b7b] xl:min-h-[27px] xl:px-3 xl:py-1.5 xl:text-[13px] min-[1700px]:text-[14px]">
                  {post.category}
                </span>
                <div>
                  <h1 className="text-[18px] font-medium leading-normal tracking-[0.044px] text-black xl:text-[20px] min-[1700px]:text-[22px]">
                    {post.title}
                  </h1>
                  <div className="mt-1 flex h-6 items-center gap-1.5 text-[13px] tracking-[0.032px] text-[rgba(88,88,88,0.8)] xl:mt-1.5 xl:h-7 xl:text-[14px] min-[1700px]:mt-2 min-[1700px]:h-[30px] min-[1700px]:gap-[7px] min-[1700px]:text-[16px]">
                    {post.creator.avatarStorageProvider === "r2" ? (
                      <ResponsiveR2Image
                        src={post.creator.avatarUrl}
                        alt=""
                        width={25}
                        height={25}
                        sizes="25px"
                        className="size-5 rounded-full object-cover xl:size-[22px] min-[1700px]:size-[25px]"
                      />
                    ) : (
                      <Image
                        src={post.creator.avatarUrl}
                        alt=""
                        width={25}
                        height={25}
                        className="size-5 rounded-full object-cover xl:size-[22px] min-[1700px]:size-[25px]"
                      />
                    )}
                    <span>{post.creator.name}</span>
                  </div>
                </div>
              </div>

              <p className="max-w-[429px] text-[14px] leading-[1.3] tracking-[0.036px] text-[#505050] xl:text-[16px] min-[1700px]:text-[18px]">
                {post.description}
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:gap-3.5 min-[1700px]:gap-[15px]">
              <MetadataRow label="Industries" values={post.industries} />
              <MetadataRow label="Colors" values={post.colors} />
              <MetadataRow label="Styles" values={post.styles} />
            </div>

            <TrackedOriginalLink post={post} className={originalLinkClassName} />
          </div>
        </div>

        <div className="mt-auto flex flex-col items-center gap-2 pt-8 lg:pt-5 xl:pt-6 min-[1700px]:gap-2.5">
          <NewsletterForm />
          <p className="text-center text-[11px] leading-[1.3] tracking-[-0.024px] text-[#95959d] xl:text-[12px]">
            <span className="text-[#505050]">Subscribe</span> to a weekly email
          </p>
        </div>
      </div>
    </aside>
  );
}
