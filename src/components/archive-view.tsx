import type { PostPage } from "@/data/post-pagination";
import type { PostCategory, PostView } from "@/domain/post";
import type { ActiveSponsor } from "@/domain/sponsor";

import { HomepageHeader } from "./homepage-header";
import { InfinitePostFeed } from "./infinite-post-feed";

export function ArchiveView({
  page,
  category,
  view = "latest",
  sponsor,
}: {
  page: PostPage;
  category?: PostCategory;
  view?: PostView;
  sponsor?: ActiveSponsor | null;
}) {
  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-white">
      <HomepageHeader category={category} view={view} />
      <section
        aria-label="Design inspiration"
        className="archive-frame pb-16 pt-[var(--archive-feed-gap)]"
      >
        <InfinitePostFeed
          key={`${view}:${category ?? "All"}`}
          initialPage={page}
          category={category}
          view={view}
          sponsor={sponsor}
        />
      </section>
    </main>
  );
}
