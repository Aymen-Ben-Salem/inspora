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

const originalLinkClassName =
  "focus-ring inline-flex h-9 w-full items-center justify-center rounded-full bg-[#262626] px-3 text-[15px] font-medium leading-normal tracking-[0.036px] text-white transition-colors hover:bg-black xl:h-[38px] xl:text-[16px] min-[1700px]:h-[42px] min-[1700px]:px-[14px] min-[1700px]:text-[18px]";

type AdjacentPost = Pick<Post, "slug" | "title">;

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
}: {
  href: Route;
  label: string;
  children: ReactNode;
  replace?: boolean;
}) {
  return (
    <Link
      href={href}
      replace={replace}
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
      className={`flex w-full shrink-0 flex-col border-l border-[#e5e7eb] bg-white ${
        overlay
          ? "min-h-fit lg:h-[100dvh] lg:w-[clamp(300px,28vw,478px)]"
          : "order-first min-h-[100dvh] lg:order-last lg:h-[100dvh] lg:w-[clamp(300px,28vw,478px)]"
      }`}
    >
      <div
        className={`flex min-h-full flex-1 flex-col px-5 pb-6 pt-5 lg:pb-5 lg:pt-5 xl:px-6 xl:pb-6 xl:pt-6 min-[1700px]:pb-7 min-[1700px]:pt-7 ${
          overlay ? "lg:px-5 xl:px-6" : "sm:px-7 lg:px-5 xl:px-6"
        }`}
      >
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
          <div className="flex items-center gap-3 xl:gap-4 min-[1800px]:gap-5">
            <CircleLink
              href={`/posts/${previousPost.slug}` as Route}
              label={`Previous post: ${previousPost.title}`}
              replace={overlay}
            >
              <ArrowIcon direction="left" />
            </CircleLink>
            <CircleLink
              href={`/posts/${nextPost.slug}` as Route}
              label={`Next post: ${nextPost.title}`}
              replace={overlay}
            >
              <ArrowIcon direction="right" />
            </CircleLink>
          </div>
        </nav>

        <div className="mt-6 flex flex-col gap-8 xl:mt-7 xl:gap-9 min-[1700px]:mt-[30px] min-[1700px]:gap-10">
          <div className="flex flex-col gap-4 min-[1700px]:gap-5">
            <div className="flex flex-col items-start gap-[10px]">
              <span className="inline-flex h-[27px] items-center rounded-full bg-[#f0f0f0] px-[10px] text-[13px] tracking-[0.2px] text-[#7b7b7b] min-[1700px]:h-[29px] min-[1700px]:px-3 min-[1700px]:text-[14px]">
                {post.category}
              </span>
              <div>
                <h1 className="text-[20px] font-medium leading-normal tracking-[0.044px] text-black xl:text-[21px] min-[1700px]:text-[22px]">
                  {post.title}
                </h1>
                <div className="mt-[6px] flex h-7 items-center gap-[6px] text-[14px] tracking-[0.032px] text-[rgba(88,88,88,0.8)] xl:text-[15px] min-[1700px]:mt-2 min-[1700px]:h-[30px] min-[1700px]:gap-[7px] min-[1700px]:text-[16px]">
                  <Image
                    src={post.creator.avatarUrl}
                    alt=""
                    width={25}
                    height={25}
                    className="size-[22px] rounded-full object-cover xl:size-[23px] min-[1700px]:size-[25px]"
                  />
                  <span>{post.creator.name}</span>
                </div>
              </div>
            </div>

            <p className="max-w-[429px] text-[16px] leading-[1.3] tracking-[0.036px] text-[#505050] xl:text-[17px] min-[1700px]:text-[18px]">
              {post.description}
            </p>
          </div>

          <TrackedOriginalLink post={post} className={originalLinkClassName} />
        </div>

        <div className="mt-auto flex flex-col items-center gap-2 pt-10 xl:pt-12 min-[1700px]:gap-[10px] min-[1700px]:pt-16">
          <NewsletterForm />
          <p className="text-center text-[12px] leading-[1.3] tracking-[-0.024px] text-[#95959d]">
            <span className="text-[#505050]">Subscribe</span> to a weekly email
          </p>
        </div>
      </div>
    </aside>
  );
}
