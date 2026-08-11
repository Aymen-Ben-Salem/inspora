import Image from "next/image";

import type { PostPage } from "@/data/post-pagination";
import type { Post } from "@/domain/post";

import { InfinitePostFeed } from "./infinite-post-feed";
import { PostDetail } from "./post-detail";
import type { PostDialogCloseMode } from "./post-dialog";
import { SiteHeader } from "./site-header";

type AdjacentPost = Pick<Post, "slug" | "title">;

function FeedNavigation() {
  return (
    <div
      data-post-feed-navigation
      aria-hidden="true"
      className="relative z-30 flex h-14 items-center justify-center bg-white sm:h-16"
    >
      <Image
        src="/brand/down-arrow.svg"
        alt=""
        width={60}
        height={60}
        className="feed-return-cue size-[52px] min-[1700px]:size-[60px]"
      />
    </div>
  );
}

function FeedBlur({ className }: { className: string }) {
  return (
    <div
      data-post-feed-preview
      aria-hidden="true"
      className={`post-feed-blur pointer-events-none z-20 bg-white/[0.24] backdrop-blur-[8px] ${className}`}
    />
  );
}

export function PostPageView({
  post,
  page,
  previousPost,
  nextPost,
  closeMode,
}: {
  post: Post;
  page?: PostPage;
  previousPost: AdjacentPost;
  nextPost: AdjacentPost;
  closeMode: PostDialogCloseMode;
}) {
  const detail = (
    <PostDetail
      post={post}
      previousPost={previousPost}
      nextPost={nextPost}
      closeMode={closeMode}
    />
  );

  if (closeMode === "back") {
    return (
      <section
        data-inline-post-view
        aria-label={`Opened post: ${post.title}`}
        className="relative w-full bg-white"
      >
        {detail}
        <div className="relative">
          <FeedNavigation />
          <FeedBlur className="absolute inset-x-0 top-full" />
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-full w-full max-w-full overflow-x-clip bg-white">
      <SiteHeader view="latest" showFilters={false} />
      {detail}
      <FeedNavigation />
      {page ? (
        <section
          data-post-feed-start
          aria-label="Design inspiration"
          className="relative min-h-[100dvh] bg-white"
        >
          <div className="relative mx-auto max-w-[1705px] px-4 pb-16 pt-4 sm:px-5 sm:pt-5 xl:px-6 xl:pt-6 2xl:px-8 min-[1700px]:px-11">
            <InfinitePostFeed initialPage={page} view="latest" />
          </div>
          <FeedBlur className="absolute inset-0" />
        </section>
      ) : null}
    </main>
  );
}
