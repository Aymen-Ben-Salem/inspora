import type { PostPage } from "@/data/post-pagination";
import type { PostCategory, PostView } from "@/domain/post";

import { InfinitePostFeed } from "./infinite-post-feed";
import { SiteHeader } from "./site-header";

export function ArchiveView({
  page,
  category,
  view = "latest",
}: {
  page: PostPage;
  category?: PostCategory;
  view?: PostView;
}) {
  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-white">
      <SiteHeader category={category} view={view} />
      <section
        aria-label="Design inspiration"
        className="mx-auto max-w-[1705px] px-4 pb-16 pt-[68px] sm:px-5 xl:px-6 xl:pt-[112px] 2xl:px-8 min-[1700px]:px-11"
      >
        <InfinitePostFeed
          key={`${view}:${category ?? "All"}`}
          initialPage={page}
          category={category}
          view={view}
        />
      </section>
    </main>
  );
}
