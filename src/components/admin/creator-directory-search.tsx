"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

export function CreatorDirectorySearch({ query }: { query: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestedQueryRef = useRef<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (requestedQueryRef.current === query) requestedQueryRef.current = null;
    // A preceding result must not replace text typed while it was loading.
    if (!timerRef.current && requestedQueryRef.current === null && inputRef.current) {
      inputRef.current.value = query;
    }
  }, [query]);

  useEffect(() => {
    function restoreHistorySearch() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      requestedQueryRef.current = null;
      if (inputRef.current) inputRef.current.value = new URLSearchParams(window.location.search).get("q") ?? "";
    }
    window.addEventListener("popstate", restoreHistorySearch);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("popstate", restoreHistorySearch);
    };
  }, []);

  function search(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const nextQuery = value.trim().slice(0, 100);
    const params = new URLSearchParams(window.location.search);
    if (nextQuery) params.set("q", nextQuery);
    else params.delete("q");
    params.delete("page");
    params.delete("saved");
    params.delete("deleted");
    requestedQueryRef.current = nextQuery;
    const href = `/admin/creators${params.size ? `?${params}` : ""}` as Route;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <form action="/admin/creators" role="search" aria-label="Creator directory" aria-busy={isPending}
      className="flex w-full gap-2 sm:w-80"
      onSubmit={(event) => { event.preventDefault(); search(inputRef.current?.value ?? ""); }}>
      <input ref={inputRef} type="search" name="q" defaultValue={query} maxLength={100}
        aria-label="Search creators" placeholder="Name, username, Website or X"
        className="focus-ring h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition-colors placeholder:text-[#aaa] focus:border-black/30"
        onChange={(event) => {
          if (timerRef.current) clearTimeout(timerRef.current);
          const value = event.currentTarget.value;
          timerRef.current = setTimeout(() => search(value), 300);
        }} />
      <span role="status" className="sr-only">{isPending ? "Searching creators…" : ""}</span>
    </form>
  );
}
