"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PostPage } from "@/data/post-pagination";
import type { PostCardData, PostCategory, PostView } from "@/domain/post";

import { PostFeed } from "./post-feed";

type LoadingStatus = "idle" | "loading" | "error";

function isPostPage(value: unknown): value is PostPage {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.items) &&
    (typeof candidate.nextCursor === "string" || candidate.nextCursor === null)
  );
}

export function InfinitePostFeed({
  initialPage,
  category,
  view,
}: {
  initialPage: PostPage;
  category?: PostCategory;
  view: PostView;
}) {
  const [posts, setPosts] = useState<PostCardData[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [status, setStatus] = useState<LoadingStatus>("idle");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const requestRef = useRef<AbortController>(null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingRef.current) return;

    loadingRef.current = true;
    setStatus("loading");
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const searchParams = new URLSearchParams({ cursor: nextCursor });
      if (category) searchParams.set("category", category);
      searchParams.set("view", view);

      const response = await fetch(`/api/posts?${searchParams.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const payload: unknown = await response.json();

      if (!response.ok || !isPostPage(payload)) {
        throw new Error("Could not load more posts.");
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
  }, [category, nextCursor, view]);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || status === "error") return;

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "900px 0px", threshold: 0.01 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextCursor, status]);

  return (
    <>
      <PostFeed posts={posts} />
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
            className="focus-ring rounded-full border border-black/10 bg-white px-4 py-2 text-xs text-[#666] transition-colors hover:bg-[#f3f3f3] hover:text-black"
          >
            Try loading more
          </button>
        ) : null}
      </div>
    </>
  );
}
