import Link from "next/link";

import type { PostCategory, PostView } from "@/domain/post";

import { BrandMark } from "./brand-mark";
import { CategoryFilter } from "./category-filter";
import { MaintenanceTicker } from "./maintenance-ticker";
import { NewsletterForm } from "./newsletter-form";
import { StickyHeader } from "./sticky-header";
import { ViewFilter } from "./view-filter";

export function SiteHeader({
  category,
  view,
  showFilters = true,
}: {
  category?: PostCategory;
  view: PostView;
  showFilters?: boolean;
}) {
  return (
    <StickyHeader
      notice={<MaintenanceTicker />}
      primary={
        <>
          <div className="flex shrink-0 items-center gap-6 xl:w-[214px]">
            <Link href="/" aria-label="Inspora home" className="focus-ring">
              <BrandMark priority responsive />
            </Link>
            <nav
              aria-label="Primary navigation"
              className="hidden items-center gap-6 text-[16px] font-medium min-[1440px]:flex min-[1700px]:text-[18px]"
            >
              <Link href="/" className="focus-ring text-[#262626]">
                Explore
              </Link>
              <a
                href="mailto:Neroodesigner@gmail.com"
                className="focus-ring text-[#7b7b7b] transition-colors hover:text-[#262626]"
              >
                Contact
              </a>
            </nav>
          </div>

          <div className="min-w-0 flex-1 xl:w-[489px] xl:flex-none">
            <NewsletterForm compact />
          </div>

          <div className="hidden w-[214px] shrink-0 items-center justify-end gap-2 xl:flex">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[#262626] animate-[status-pulse_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
            />
            <span className="text-[16px] text-[#262626] min-[1700px]:text-[18px]">
              Updated hourly
            </span>
          </div>
        </>
      }
      secondary={showFilters ? (
        <div className="flex min-w-0 items-center justify-between gap-3">
          <CategoryFilter current={category} view={view} />
          <ViewFilter category={category} view={view} />
        </div>
      ) : undefined}
    />
  );
}
