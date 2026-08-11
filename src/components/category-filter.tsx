"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

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
  const selectedIndex = current ? categories.indexOf(current) : 0;
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const highlightedIndex = previewIndex ?? selectedIndex;

  return (
    <nav
      aria-label="Filter posts by category"
      onMouseLeave={() => setPreviewIndex(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPreviewIndex(null);
        }
      }}
      className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="relative flex w-max items-center gap-3">
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 h-10 w-[92px] bg-[#262626] transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none sm:h-[41px] sm:w-[120px]"
          style={{
            transform: `translateX(calc(${highlightedIndex} * (100% + 12px)))`,
          }}
        />
        {categories.map((category, index) => {
          const active = category === "All" ? !current : current === category;
          const highlighted = highlightedIndex === index;
          const href = archiveHref({
            category: category === "All" ? undefined : category,
            view,
          });

          return (
            <Link
              key={category}
              href={href}
              aria-current={active ? "page" : undefined}
              onMouseEnter={() => setPreviewIndex(index)}
              onFocus={() => setPreviewIndex(index)}
              className={`focus-ring relative z-10 inline-flex h-10 w-[92px] shrink-0 items-center justify-center px-3 text-[13px] leading-none tracking-[0.2px] transition-colors duration-150 sm:h-[41px] sm:w-[120px] min-[1700px]:text-[14px] ${
                highlighted ? "text-white" : "bg-[#f0f0f0] text-[#7b7b7b]"
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
