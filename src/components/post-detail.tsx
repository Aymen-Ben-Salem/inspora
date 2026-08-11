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
    <main
      data-post-dialog-post-id={post.id}
      className="pointer-events-auto flex h-[100dvh] w-full max-w-full flex-col overflow-y-auto bg-transparent lg:flex-row lg:overflow-hidden"
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
    </main>
  );
}
