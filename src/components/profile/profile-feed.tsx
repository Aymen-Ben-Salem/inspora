"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { FeedMotion } from "@/components/feed-motion";
import { LogoCard } from "@/components/logos/logo-card";
import { LogoDetailDialog } from "@/components/logos/logo-detail-dialog";
import { PostCard } from "@/components/post-card";
import { RowFirstMasonry } from "@/components/row-first-masonry";
import { WebsiteCard } from "@/components/websites/website-card";
import { WebsiteDetailDialog } from "@/components/websites/website-detail-dialog";
import { replaceDetailQueryParam } from "@/lib/detail-query";
import { POST_CATEGORIES } from "@/domain/post";
import type { WorkCardData } from "@/domain/work-card";
import type {
  CreatorWorkFilter,
  CreatorWorkPage,
  ProfileWorkCounts,
} from "@/features/profiles/types";

const typeFilters = [
  ...POST_CATEGORIES,
  "websites",
  "logos",
  "app-icons",
] as const;

const labels: Record<Exclude<CreatorWorkFilter, "all">, string> = {
  Web: "Web",
  Branding: "Branding",
  Product: "Product",
  Motion: "Motion",
  Illustration: "Illustration",
  "3D": "3D",
  Print: "Print",
  websites: "Websites",
  logos: "Logos",
  "app-icons": "App Icons",
};

export function ProfileFeed({
  baseHref,
  counts,
  creatorId,
  filter,
  initialPage,
  owner = false,
}: {
  baseHref: string;
  counts: ProfileWorkCounts;
  creatorId: string;
  filter: CreatorWorkFilter;
  initialPage: CreatorWorkPage;
  owner?: boolean;
}) {
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [selectedId, setSelectedId] = useState<string>();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;
    loadingRef.current = true;
    setStatus("loading");
    try {
      const params = new URLSearchParams({ filter, cursor: nextCursor });
      const response = await fetch(`/api/creators/${creatorId}/works?${params}`, {
        headers: { Accept: "application/json" },
      });
      const page = (await response.json()) as CreatorWorkPage;
      if (!response.ok || !Array.isArray(page.items)) throw new Error();
      setItems((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !ids.has(item.id))];
      });
      setNextCursor(page.nextCursor);
      setStatus("idle");
    } catch {
      setStatus("error");
    } finally {
      loadingRef.current = false;
    }
  }, [creatorId, filter, nextCursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || status === "error" || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void loadMore();
    }, { rootMargin: "400px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextCursor, status]);

  const selected = items.find((item) => item.id === selectedId);
  const select = (item: WorkCardData) => {
    if (item.kind !== "logo" && item.kind !== "website") return;
    setSelectedId(item.id);
    replaceDetailQueryParam({
      key: item.kind,
      value: item.kind === "logo" ? item.logo.slug : item.website.slug,
    });
  };
  const close = () => {
    setSelectedId(undefined);
    replaceDetailQueryParam();
  };
  const navigate = (direction: -1 | 1) => {
    if (!selected || (selected.kind !== "logo" && selected.kind !== "website")) return;
    const siblings = items.filter((item) => item.kind === selected.kind);
    const index = siblings.findIndex((item) => item.id === selected.id);
    const next = siblings[(index + direction + siblings.length) % siblings.length];
    if (next) select(next);
  };

  return (
    <>
      <div className="archive-frame pb-28 [&_.feed-grid>[data-feed-card]]:pb-[18px]">
        <nav aria-label="Filter creator work" className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-2 py-2">
            <ProfileFilterLink active={filter === "all"} href={baseHref} label="All" />
            {typeFilters.filter((item) => (counts.filters[item] ?? 0) > 0).map((item) => (
              <ProfileFilterLink key={item} active={filter === item} href={`${baseHref}?filter=${encodeURIComponent(item)}`} label={`${labels[item]} (${counts.filters[item]})`} />
            ))}
          </div>
        </nav>
        <section aria-label="Published work" className="pt-[18px]">
          {items.length === 0 ? (
            <div className="grid min-h-[35dvh] place-items-center px-6 text-center text-sm text-[#767676]">
              {filter === "all" ? "No published work yet." : "No published work in this category."}
            </div>
          ) : (
            <FeedMotion itemCount={items.length}>
              <RowFirstMasonry itemCount={items.length}>
                {items.map((item, index) => item.kind === "logo" ? (
                  <LogoCard key={item.id} logo={item.logo} onSelect={() => select(item)} showCreator={!owner} iconLayout="profile" />
                ) : item.kind === "website" ? (
                  <WebsiteCard key={item.id} website={item.website} onSelect={() => select(item)} />
                ) : (
                  <PostCard key={item.id} post={item} priority={index === 0} showCreator={!owner} />
                ))}
              </RowFirstMasonry>
            </FeedMotion>
          )}
          <div ref={sentinelRef} className="flex min-h-16 items-center justify-center py-5">
            {status === "loading" ? <p role="status" className="text-xs text-[#767676]">Loading more</p> : null}
            {status === "error" ? <button type="button" onClick={() => void loadMore()} className="focus-ring rounded-lg bg-[#f3f3f3] px-4 py-2 text-xs">Try loading more</button> : null}
          </div>
        </section>
      </div>
      {selected?.kind === "logo" ? <LogoDetailDialog logo={selected.logo} onClose={close} onPrevious={() => navigate(-1)} onNext={() => navigate(1)} /> : null}
      {selected?.kind === "website" ? <WebsiteDetailDialog website={selected.website} onClose={close} onPrevious={() => navigate(-1)} onNext={() => navigate(1)} /> : null}
    </>
  );
}

function ProfileFilterLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link href={href as Route} aria-current={active ? "page" : undefined} className={`focus-ring inline-flex min-h-[41px] min-w-[104px] shrink-0 items-center justify-center whitespace-nowrap px-4 py-3 text-sm leading-[normal] tracking-[0.2px] transition-colors ${active ? "bg-[#262626] text-white" : "bg-[#fafafa] text-[#767676] hover:bg-[#f0f0f0] hover:text-[#262626]"}`}>
      {label}
    </Link>
  );
}
