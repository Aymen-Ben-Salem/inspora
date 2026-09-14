import type { PostCategory, PostView } from "@/domain/post";

import { CategoryFilter } from "./category-filter";
import { SiteNavbar } from "./site-navbar";
import { ViewFilter } from "./view-filter";

export function DesignHeader({
  category,
  view = "latest",
}: {
  category?: PostCategory;
  view?: PostView;
}) {
  return (
    <>
      <SiteNavbar page="design" />
      <div className="archive-frame">
        <h1 className="mt-[var(--archive-header-gap)] text-[length:var(--archive-heading-size)] font-normal leading-normal tracking-[-0.02em] text-[#767676] md:whitespace-nowrap">
          A <span className="text-[#262626]">curated</span> archive of recent{" "}
          <span className="text-[#262626]">visual design</span> inspiration and{" "}
          <span className="text-[#262626]">creative work</span>.
        </h1>

        <div className="mt-[var(--archive-description-gap)] flex min-w-0 items-center justify-between gap-3">
          <CategoryFilter current={category} view={view} />
          <ViewFilter category={category} view={view} />
        </div>
      </div>
    </>
  );
}

