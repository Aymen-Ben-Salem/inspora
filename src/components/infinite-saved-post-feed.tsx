"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  SavedPostCardData,
  SavedPostCounts,
  SavedPostPage,
} from "@/data/saved-posts-repository";
import { SAVED_CATEGORIES, type SavedCategory } from "@/domain/saved-post";
import { detailPageHref, replaceDetailQueryParam } from "@/lib/detail-query";
import { LogoCard } from "./logos/logo-card";
import { LogoDetailDialog } from "./logos/logo-detail-dialog";
import { WebsiteCard } from "./websites/website-card";
import { WebsiteDetailDialog } from "./websites/website-detail-dialog";

import { FeedMotion } from "./feed-motion";
import { PostCard } from "./post-card";
import { RowFirstMasonry } from "./row-first-masonry";

type LoadingStatus = "idle" | "loading" | "error";

function isSavedPostPage(value: unknown): value is SavedPostPage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.items) &&
    (typeof candidate.nextCursor === "string" || candidate.nextCursor === null)
  );
}

function savedHref(category?: SavedCategory) {
  return (category
    ? `/saved?category=${encodeURIComponent(category)}`
    : "/saved") as Route;
}

export function savedItemOpenHref(
  post: SavedPostCardData,
  currentSearch = "",
) {
  if (post.kind === "logo") {
    return detailPageHref("/saved", currentSearch, {
      key: "logo",
      value: post.logo.slug,
    });
  }
  if (post.kind === "website") {
    return detailPageHref("/saved", currentSearch, {
      key: "website",
      value: post.website.slug,
    });
  }
  return `/posts/${post.slug}`;
}

export function InfiniteSavedPostFeed({
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
  const [posts, setPosts] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [total, setTotal] = useState(initialTotal);
  const [counts, setCounts] = useState(initialCounts);
  const [status, setStatus] = useState<LoadingStatus>("idle");
  const [selectedId, setSelectedId] = useState<string>();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const requestRef = useRef<AbortController>(null);

  const updateSavedState = useCallback(
    (post: SavedPostCardData, saved: boolean) => {
      setPosts((current) => {
        const exists = current.some((candidate) => candidate.id === post.id);
        if (saved) return exists ? current : [post, ...current];
        return exists
          ? current.filter((candidate) => candidate.id !== post.id)
          : current;
      });
      setTotal((current) => Math.max(0, current + (saved ? 1 : -1)));
      setCounts((current) => ({
        ...current,
        [post.category]: Math.max(
          0,
          (current[post.category] ?? 0) + (saved ? 1 : -1),
        ),
      }));
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;

    loadingRef.current = true;
    setStatus("loading");
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const searchParams = new URLSearchParams({ cursor: nextCursor });
      if (category) searchParams.set("category", category);
      const response = await fetch(
        `/api/saved-posts/feed?${searchParams.toString()}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok || !isSavedPostPage(payload)) {
        throw new Error("Could not load more saved posts.");
      }
      setPosts((current) => {
        const existingIds = new Set(current.map((post) => post.id));
        return [
          ...current,
          ...payload.items.filter((post) => !existingIds.has(post.id)),
        ];
      });
      setNextCursor(payload.nextCursor);
      setStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("error");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      loadingRef.current = false;
    }
  }, [category, nextCursor]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || status === "error") return;
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "400px 0px", threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextCursor, status]);

  const visibleCategories = SAVED_CATEGORIES.filter(
    (postCategory) => (counts[postCategory] ?? 0) > 0,
  );
  const selectedItem = posts.find((post) => post.id === selectedId);

  const selectSavedItem = useCallback((post: SavedPostCardData) => {
    if (post.kind !== "logo" && post.kind !== "website") return;
    setSelectedId(post.id);
    replaceDetailQueryParam({
      key: post.kind,
      value: post.kind === "logo" ? post.logo.slug : post.website.slug,
    });
  }, []);

  const closeSavedItem = useCallback(() => {
    setSelectedId(undefined);
    replaceDetailQueryParam();
  }, []);

  const navigateSavedItem = useCallback(
    (direction: -1 | 1) => {
      if (!selectedItem || selectedItem.kind === undefined) return;
      const siblings = posts.filter(
        (post) => post.kind === selectedItem.kind,
      );
      const currentIndex = siblings.findIndex(
        (post) => post.id === selectedItem.id,
      );
      const next =
        siblings[(currentIndex + direction + siblings.length) % siblings.length];
      if (next) selectSavedItem(next);
    },
    [posts, selectSavedItem, selectedItem],
  );

  return (
    <>
    <div className="archive-frame pb-16">
      <p className="mt-[var(--archive-header-gap)] text-[length:var(--archive-heading-size)] font-normal leading-normal tracking-[-0.02em] text-[#767676]">
        <span className="text-[#262626]">{total}</span>{" "}
        {total === 1 ? "item" : "items"} you saved for later
      </p>

      <nav
        aria-label="Filter saved posts by category"
        className="mt-[var(--archive-description-gap)] min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max items-center gap-[var(--archive-control-gap)] py-[var(--archive-filter-pad-y)] pr-[var(--archive-filter-pad-y)]">
          <Link
            href={savedHref()}
            aria-current={!category ? "page" : undefined}
            className={`archive-control-type focus-ring inline-flex h-[var(--archive-control-height)] w-[var(--archive-category-width)] shrink-0 items-center justify-center px-[var(--archive-control-x)] leading-none tracking-[0.2px] transition-colors duration-150 ${
              !category
                ? "bg-[#262626] text-white shadow-[0_1px_1px_#e6e6e6]"
                : "bg-[#fafafa] text-[#767676] hover:bg-[#f0f0f0] hover:text-[#262626]"
            }`}
          >
            All
          </Link>
          {visibleCategories.map((postCategory) => {
            const active = category === postCategory;
            return (
              <Link
                key={postCategory}
                href={savedHref(postCategory)}
                aria-current={active ? "page" : undefined}
                className={`archive-control-type focus-ring inline-flex h-[var(--archive-control-height)] shrink-0 items-center justify-center px-[var(--archive-control-x)] leading-none tracking-[0.2px] transition-colors duration-150 ${
                  postCategory === "Illustration"
                    ? ""
                    : "w-[var(--archive-category-width)]"
                } ${
                  active
                    ? "bg-[#262626] text-white shadow-[0_1px_1px_#e6e6e6]"
                    : "bg-[#fafafa] text-[#767676] hover:bg-[#f0f0f0] hover:text-[#262626]"
                }`}
              >
                {postCategory} ({counts[postCategory]})
              </Link>
            );
          })}
        </div>
      </nav>

      <section
        aria-label="Saved inspiration"
        className="pt-[var(--archive-feed-gap)]"
      >
        {posts.length === 0 ? (
          <div className="flex min-h-[45dvh] items-center justify-center px-6 text-center text-sm text-[#777]">
            {category
              ? "No saved posts in this category."
              : "Posts you save will appear here."}
          </div>
        ) : (
          <FeedMotion itemCount={posts.length}>
            <RowFirstMasonry itemCount={posts.length}>
              {posts.map((post, index) => (
                <SavedItemCard
                  key={post.id}
                  post={post}
                  priority={index === 0}
                  onSelect={selectSavedItem}
                  onSavedChange={(saved) => updateSavedState(post, saved)}
                />
              ))}
            </RowFirstMasonry>
          </FeedMotion>
        )}

        <div
          ref={sentinelRef}
          aria-hidden={!nextCursor}
          className="flex min-h-16 items-center justify-center py-5"
        >
          {status === "loading" ? (
            <p role="status" className="animate-pulse text-xs tracking-wide text-[#8a8a8a]">
              Loading more
            </p>
          ) : status === "error" ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="focus-ring border border-black/10 bg-white px-4 py-2 text-xs text-[#666] transition-colors hover:bg-[#f3f3f3] hover:text-black"
            >
              Try loading more
            </button>
          ) : null}
        </div>
      </section>
    </div>
    {selectedItem?.kind === "logo" ? (
      <LogoDetailDialog
        logo={selectedItem.logo}
        onClose={closeSavedItem}
        onPrevious={() => navigateSavedItem(-1)}
        onNext={() => navigateSavedItem(1)}
      />
    ) : selectedItem?.kind === "website" ? (
      <WebsiteDetailDialog
        website={selectedItem.website}
        onClose={closeSavedItem}
        onPrevious={() => navigateSavedItem(-1)}
        onNext={() => navigateSavedItem(1)}
      />
    ) : null}
    </>
  );
}

function SavedItemCard({ post, priority, onSavedChange, onSelect }: {
  post: SavedPostCardData;
  priority: boolean;
  onSavedChange: (saved: boolean) => void;
  onSelect: (post: SavedPostCardData) => void;
}) {
  const saveProps = { initiallySaved: true, onSavedChange };
  if (post.kind === "logo") {
    return <LogoCard logo={post.logo} {...saveProps} onSelect={() => onSelect(post)} />;
  }
  if (post.kind === "website") {
    return <WebsiteCard website={post.website} {...saveProps} onSelect={() => onSelect(post)} />;
  }
  return <PostCard post={post} priority={priority} {...saveProps} />;
}
