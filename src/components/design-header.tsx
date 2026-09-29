import type { PostCategory, PostView } from "@/domain/post";

import { CategoryFilter } from "./category-filter";
import { SiteNavbar } from "./site-navbar";
import { ViewFilter } from "./view-filter";

export function DesignHeader({
  category,
  categories,
  view = "latest",
}: {
  category?: PostCategory;
  categories?: string[];
  view?: PostView;
}) {
  return (
    <>
      <SiteNavbar page="design" />
      <div className="archive-frame">
        <div className="mt-[var(--archive-header-gap)] flex min-w-0 items-center justify-between gap-3">
          <CategoryFilter categories={categories} current={category} view={view} />
          <ViewFilter category={category} view={view} />
        </div>
      </div>
    </>
  );
}

