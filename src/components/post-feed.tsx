import type { PostCardData } from "@/domain/post";

import { FeedMotion } from "./feed-motion";
import { PostCard } from "./post-card";
import { RowFirstMasonry } from "./row-first-masonry";

export function PostFeed({ posts }: { posts: PostCardData[] }) {
  if (posts.length === 0) {
    return (
      <div className="flex min-h-[45dvh] items-center justify-center px-6 text-center text-sm text-[#777]">
        No posts in this category yet.
      </div>
    );
  }

  return (
    <FeedMotion itemCount={posts.length}>
      <RowFirstMasonry itemCount={posts.length}>
        {posts.map((post, index) => (
          <PostCard key={post.id} post={post} priority={index < 4} />
        ))}
      </RowFirstMasonry>
    </FeedMotion>
  );
}
