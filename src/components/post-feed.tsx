import type { PostCardData } from "@/domain/post";
import type { ActiveSponsor } from "@/domain/sponsor";

import { FeedMotion } from "./feed-motion";
import { PostCard } from "./post-card";
import { RowFirstMasonry } from "./row-first-masonry";
import { SponsoredPostCard } from "./sponsored-post-card";

export function PostFeed({
  posts,
  sponsor,
}: {
  posts: PostCardData[];
  sponsor?: ActiveSponsor | null;
}) {
  if (posts.length === 0 && !sponsor) {
    return (
      <div className="flex min-h-[45dvh] items-center justify-center px-6 text-center text-sm text-[#777]">
        No posts in this category yet.
      </div>
    );
  }

  const totalCount = posts.length + (sponsor ? 1 : 0);
  const sponsorIndex = 3; // Fixed top-right corner (4th slot in 4-column grid)

  return (
    <FeedMotion itemCount={totalCount}>
      <RowFirstMasonry itemCount={totalCount}>
        {posts.flatMap((post, index) => {
          const items = [];
          if (sponsor && index === sponsorIndex) {
            items.push(
              <SponsoredPostCard key={`sponsor-${sponsor.id}`} sponsor={sponsor} priority />,
            );
          }
          items.push(<PostCard key={post.id} post={post} priority={index === 0} />);
          return items;
        })}
        {sponsor && posts.length < sponsorIndex ? (
          <SponsoredPostCard key={`sponsor-${sponsor.id}`} sponsor={sponsor} priority />
        ) : null}
      </RowFirstMasonry>
    </FeedMotion>
  );
}
