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
      <div className="archive-control-surface flex w-max items-center gap-[var(--archive-control-gap)]">
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
              className={`focus-ring inline-flex h-[var(--archive-control-height)] shrink-0 items-center justify-center px-[var(--archive-control-x)] text-[var(--archive-control-size)] leading-none tracking-[0.2px] transition-colors duration-150 ${
                active
                  ? "bg-white text-[#262626] shadow-[0_1px_1px_#e6e6e6]"
                  : "bg-white/0 text-[#585858]/80 hover:bg-white/60 hover:text-[#262626] focus-visible:bg-white/60 focus-visible:text-[#262626]"
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
