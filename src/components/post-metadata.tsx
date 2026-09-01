import type { Route } from "next";
import type { ReactNode } from "react";

import type { Post } from "@/domain/post";

import {
  DetailArrowIcon,
  DetailCloseIcon,
  DetailIntro,
  DetailMetadataList,
  DetailSidebarLayout,
  DetailSidebarNavigation,
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
    <DetailSidebarLayout
      mode={overlay ? "overlay" : "page"}
      newsletterSource="post-detail"
      navigation={
        <DetailSidebarNavigation
          label="Post navigation"
          closeControl={
            closeMode ? (
              <PostCloseButton closeMode={closeMode}>
                <DetailCloseIcon />
              </PostCloseButton>
            ) : (
              <CircleLink href="/" label="Close post">
                <DetailCloseIcon />
              </CircleLink>
            )
          }
          previousControl={
            <CircleLink
              href={`/posts/${previousPost.slug}` as Route}
              label={`Previous post: ${previousPost.title}`}
              replace={overlay}
              prefetch={false}
            >
              <DetailArrowIcon direction="left" />
            </CircleLink>
          }
          nextControl={
            <CircleLink
              href={`/posts/${nextPost.slug}` as Route}
              label={`Next post: ${nextPost.title}`}
              replace={overlay}
              prefetch={false}
            >
              <DetailArrowIcon direction="right" />
            </CircleLink>
          }
        />
      }
    >
      <DetailIntro
        category={post.category}
        title={post.title}
        creator={post.creator}
        description={post.description}
        layout="logo"
        publishedAt={post.publishedAt}
      />

      <DetailMetadataList
        capitalizeValues
        rows={[
          { label: "Industries", values: post.industries },
          { label: "Colors", values: post.colors },
          { label: "Styles", values: post.styles },
        ]}
      />

      <div className="detail-fit-actions flex flex-col gap-3">
        <TrackedOriginalLink
          post={post}
          className={`${detailOriginalLinkClassName} detail-fit-action`}
        />
      </div>
    </DetailSidebarLayout>
  );
}
