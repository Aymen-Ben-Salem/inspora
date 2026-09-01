import type { Route } from "next";
import type { ReactNode } from "react";

import type { Post } from "@/domain/post";

import { NewsletterForm } from "./newsletter-form";
import {
  DetailArrowIcon,
  DetailCloseIcon,
  DetailIntro,
  DetailMetadataRow,
  detailOriginalLinkClassName,
} from "./detail-sidebar-primitives";
import {
  PostCloseButton,
  postNavigationControlClassName,
} from "./post-close-button";
import type { PostDialogCloseMode } from "./post-dialog";
import { PostNavigationLink } from "./post-navigation-link";
import { TrackedOriginalLink } from "./tracked-original-link";

type AdjacentPost = Pick<Post, "slug" | "title">;

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
    <PostNavigationLink
      href={href}
      replace={replace}
      prefetch={prefetch}
      aria-label={label}
      className={postNavigationControlClassName}
    >
      {children}
    </PostNavigationLink>
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
              <DetailCloseIcon />
            </PostCloseButton>
          ) : (
            <CircleLink href="/" label="Close post">
              <DetailCloseIcon />
            </CircleLink>
          )}
          <div className="flex items-center gap-3 xl:gap-4 min-[1700px]:gap-5">
            <CircleLink
              href={`/posts/${previousPost.slug}` as Route}
              label={`Previous post: ${previousPost.title}`}
              replace={overlay}
              prefetch={false}
            >
              <DetailArrowIcon direction="left" />
            </CircleLink>
            <CircleLink
              href={`/posts/${nextPost.slug}` as Route}
              label={`Next post: ${nextPost.title}`}
              replace={overlay}
              prefetch={false}
            >
              <DetailArrowIcon direction="right" />
            </CircleLink>
          </div>
        </nav>

        <div className="flex flex-1 items-start pt-8 lg:pt-6 xl:pt-[30px]">
          <div className="flex w-full flex-col">
            <DetailIntro
              category={post.category}
              title={post.title}
              creator={post.creator}
              description={post.description}
              publishedAt={post.publishedAt}
            />

            <div className="mt-7 flex flex-col gap-3 xl:mt-8 xl:gap-3.5 min-[1700px]:mt-9 min-[1700px]:gap-[15px]">
              <DetailMetadataRow label="Industries" values={post.industries} />
              <DetailMetadataRow label="Colors" values={post.colors} />
              <DetailMetadataRow label="Styles" values={post.styles} />
            </div>

            <TrackedOriginalLink
              post={post}
              className={`${detailOriginalLinkClassName} mt-6 xl:mt-7 min-[1700px]:mt-8`}
            />
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
