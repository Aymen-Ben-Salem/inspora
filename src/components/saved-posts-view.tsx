import type {
  SavedPostCounts,
  SavedPostPage,
} from "@/data/saved-posts-repository";
import type { SavedCategory } from "@/domain/saved-post";

import { InfiniteSavedPostFeed } from "./infinite-saved-post-feed";
import { SiteNavbar } from "./site-navbar";

export function SavedPostsView({
  initialPage,
  initialTotal,
  initialCounts,
  category,
}: {
  initialPage: SavedPostPage;
  initialTotal: number;
  initialCounts: SavedPostCounts;
  category?: SavedCategory;
}) {
  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-white">
      <SiteNavbar page="saved" />
      <InfiniteSavedPostFeed
        key={category ?? "All"}
        initialPage={initialPage}
        initialTotal={initialTotal}
        initialCounts={initialCounts}
        category={category}
      />
    </main>
  );
}
