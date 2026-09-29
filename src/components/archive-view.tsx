import type { PostPage } from "@/data/post-pagination";
import type { PostCategory, PostView } from "@/domain/post";
import type { ActiveSponsor } from "@/domain/sponsor";

import { DesignHeader } from "./design-header";
import { InfinitePostFeed } from "./infinite-post-feed";

export function ArchiveView({
  page,
  category,
  categories,
  view = "latest",
  sponsor,
}: {
  page: PostPage;
  category?: PostCategory;
  categories?: string[];
  view?: PostView;
  sponsor?: ActiveSponsor | null;
}) {
  return (
    <main className="flex min-h-[100dvh] w-full max-w-full flex-col overflow-x-clip bg-white">
      <DesignHeader categories={categories} category={category} view={view} />
      <section
        aria-label="Design inspiration"
        className="archive-frame flex flex-1 flex-col pb-16 pt-[var(--archive-feed-gap)]"
      >
        <InfinitePostFeed
          key={`${view}:${category ?? "All"}`}
          initialPage={page}
          category={category}
          view={view}
          sponsor={sponsor}
        />
        {/* Keep the heading server-rendered and outside the feed's loading state. */}
        <h1 className="mt-auto text-center text-[length:calc(var(--archive-heading-size)_-_2px)] font-normal leading-normal tracking-[-0.02em] text-[#767676]">
          A <span className="text-[#262626]">curated</span> archive of recent{" "}
          <span className="text-[#262626]">visual design</span> inspiration and{" "}
          <span className="text-[#262626]">creative work</span>.
        </h1>
      </section>
    </main>
  );
}
