"use client";

import Link from "next/link";
import type { Route } from "next";

import { POST_CATEGORIES, type PostCategory, type PostView } from "@/domain/post";

function archiveHref({
  category,
  view,
}: {
  category?: PostCategory;
  view: PostView;
}) {
  const searchParams = new URLSearchParams();
  if (view === "featured") searchParams.set("view", view);
  if (category) searchParams.set("category", category);
  const query = searchParams.toString();
  return (query ? `/?${query}` : "/") as Route;
}

export function CategoryFilter({
  current,
  view,
}: {
  current?: PostCategory;
  view: PostView;
}) {
  const categories = ["All", ...POST_CATEGORIES] as const;

  return (
    <nav
      aria-label="Filter posts by category"
      className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max items-center gap-3">
        {categories.map((category) => {
          const active = category === "All" ? !current : current === category;
          const href = archiveHref({
            category: category === "All" ? undefined : category,
            view,
          });

          return (
            <Link
              key={category}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`focus-ring inline-flex h-10 w-[92px] shrink-0 items-center justify-center px-3 text-[13px] leading-none tracking-[0.2px] transition-colors duration-150 sm:h-[41px] sm:w-[120px] min-[1700px]:text-[14px] ${
                active
                  ? "bg-[#262626] text-white"
                  : "bg-[#f0f0f0] text-[#7b7b7b] hover:bg-[#DCDCDC] hover:text-[#5D5D5D] focus-visible:bg-[#DCDCDC] focus-visible:text-[#5D5D5D]"
              }`}
            >
              {category}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
