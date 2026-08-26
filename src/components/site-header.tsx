import Image from "next/image";
import Link from "next/link";

import type { PostCategory, PostView } from "@/domain/post";
import type { ActiveSponsor } from "@/domain/sponsor";

import { BrandMark } from "./brand-mark";
import { CategoryFilter } from "./category-filter";
import { NewsletterForm } from "./newsletter-form";
import { ResponsiveR2Image } from "./responsive-r2-image";
import { StickyHeader } from "./sticky-header";
import { ViewFilter } from "./view-filter";

export function SiteHeader({
  category,
  view,
  sponsor,
  showFilters = true,
}: {
  category?: PostCategory;
  view: PostView;
  sponsor?: ActiveSponsor | null;
  showFilters?: boolean;
}) {
  return (
    <StickyHeader
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
                href="https://x.com/neropursue?s=11"
                target="_blank"
                rel="noopener noreferrer"
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
            {sponsor?.iconUrl ? (
              <a
                href={sponsor.url}
                target="_blank"
                rel="noopener noreferrer"
                title={`Sponsored by ${sponsor.title}`}
                aria-label={`Sponsored by ${sponsor.title}`}
                className="focus-ring group relative flex size-8 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-white transition-transform hover:scale-105 hover:border-black/20"
              >
                {sponsor.iconStorageProvider === "r2" ? (
                  <ResponsiveR2Image
                    src={sponsor.iconUrl}
                    alt={sponsor.title}
                    width={32}
                    height={32}
                    sizes="32px"
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <Image
                    src={sponsor.iconUrl}
                    alt={sponsor.title}
                    width={32}
                    height={32}
                    unoptimized
                    className="size-full rounded-full object-cover"
                  />
                )}
              </a>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-[#262626] animate-[status-pulse_2.4s_ease-in-out_infinite] motion-reduce:animate-none"
                />
                <span className="text-[16px] text-[#262626] min-[1700px]:text-[18px]">
                  Updated hourly
                </span>
              </>
            )}
          </div>
        </>
      }
      secondary={
        showFilters ? (
          <div className="flex min-w-0 items-center justify-between gap-3">
            <CategoryFilter current={category} view={view} />
            <ViewFilter category={category} view={view} />
          </div>
        ) : undefined
      }
    />
  );
}
