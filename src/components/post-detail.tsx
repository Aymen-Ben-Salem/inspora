import type { Post } from "@/domain/post";

import { PostAnalytics } from "./post-analytics";
import { PostGallery } from "./post-gallery";
import { PostMetadata } from "./post-metadata";
import type { PostDialogCloseMode } from "./post-dialog";

type AdjacentPost = Pick<Post, "slug" | "title">;

export function PostDetail({
  post,
  previousPost,
  nextPost,
  closeMode,
}: {
  post: Post;
  previousPost: AdjacentPost;
  nextPost: AdjacentPost;
  closeMode: PostDialogCloseMode;
}) {
  return (
    <section
      data-post-dialog-post-id={post.id}
      aria-label={`Post: ${post.title}`}
      className="pointer-events-auto flex h-[calc(100dvh-72px-var(--post-feed-peek))] min-h-0 w-full max-w-full flex-col overflow-hidden border-y border-[#e6e6e6] bg-white lg:h-[max(560px,calc(100dvh-272px))] lg:flex-row xl:h-[max(540px,calc(100dvh-300px))]"
    >
      <PostAnalytics post={post} />
      <PostGallery post={post} overlay />
      <PostMetadata
        post={post}
        previousPost={previousPost}
        nextPost={nextPost}
        closeMode={closeMode}
        overlay
      />
    </section>
  );
}
