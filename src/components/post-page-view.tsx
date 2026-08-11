import Image from "next/image";

import type { PostPage } from "@/data/post-pagination";
import type { Post } from "@/domain/post";

import { InfinitePostFeed } from "./infinite-post-feed";
import { PostDetail } from "./post-detail";
import type { PostDialogCloseMode } from "./post-dialog";
import { SiteHeader } from "./site-header";

type AdjacentPost = Pick<Post, "slug" | "title">;

function FeedReveal({ className }: { className: string }) {
  return (
    <div
      data-post-feed-preview
      aria-hidden="true"
      className={`pointer-events-none z-20 bg-white/30 backdrop-blur-[10px] ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-14 bg-white sm:h-16" />
      <Image
        src="/brand/down-arrow.svg"
        alt=""
        width={60}
        height={60}
        className="absolute left-1/2 top-0 z-10 size-[52px] -translate-x-1/2 min-[1700px]:size-[60px]"
      />
    </div>
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
  return (
    <main className="pointer-events-auto min-h-full w-full max-w-full overflow-x-clip bg-transparent [--post-feed-peek:132px] sm:[--post-feed-peek:144px]">
      <SiteHeader view="latest" showFilters={false} />
      <PostDetail
        post={post}
        previousPost={previousPost}
        nextPost={nextPost}
        closeMode={closeMode}
      />
      {closeMode === "back" ? (
        <section
          data-post-feed-start
          aria-label="Return to design inspiration"
          className="relative min-h-[100dvh] bg-transparent"
        >
          <FeedReveal className="sticky top-0 h-[100dvh]" />
        </section>
      ) : page ? (
        <section
          data-post-feed-start
          aria-label="Design inspiration"
          className="relative mx-auto min-h-[100dvh] max-w-[1705px] px-4 pb-16 pt-16 sm:px-5 xl:px-6 2xl:px-8 min-[1700px]:px-11"
        >
          <InfinitePostFeed initialPage={page} view="latest" />
          <FeedReveal className="absolute inset-0" />
        </section>
      ) : null}
    </main>
  );
}
