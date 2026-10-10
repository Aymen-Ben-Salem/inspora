import type { PostCardData } from "@/domain/post";
import type { ActiveSponsor } from "@/domain/sponsor";
import { PostCard } from "./post-card";
import { SponsorFeed } from "./sponsorship/sponsor-feed";
export function PostFeed({
  posts,
  sponsor,
  sponsors,
  hasMore = false,
}: {
  posts: PostCardData[];
  sponsor?: ActiveSponsor | null;
  sponsors?: ActiveSponsor[];
  hasMore?: boolean;
}) {
  return (
    <SponsorFeed
      emptyLabel="No posts in this category yet."
      hasMore={hasMore}
      initialSponsors={sponsors ?? (sponsor ? [sponsor] : [])}
      ordinary={posts.map((post, i) => ({
        id: post.id,
        node: <PostCard key={post.id} post={post} priority={i < 4} />,
      }))}
    />
  );
}
