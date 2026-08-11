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
      className="pointer-events-auto flex min-h-[calc(100dvh_-_72px_-_56px_-_112px)] w-full max-w-full flex-col overflow-hidden border-y border-[#e6e6e6] bg-white sm:min-h-[calc(100dvh_-_72px_-_64px_-_124px)] lg:min-h-[calc(100dvh_-_80px_-_64px_-_124px)] lg:flex-row"
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
