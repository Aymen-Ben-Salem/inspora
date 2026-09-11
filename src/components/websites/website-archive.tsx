"use client";

import { useCallback, useMemo, useState } from "react";

import type { Website } from "@/domain/website";
import type { PostView } from "@/domain/post";

import {
  ArchiveFilterMenu,
  ArchiveSearchIcon,
  uniqueArchiveValues,
  type ArchiveFilterOption,
} from "../archive-filter-menu";
import { FeedMotion } from "../feed-motion";
import { ViewFilter } from "../view-filter";
import { WebsiteCard } from "./website-card";
import { WebsiteDetailDialog } from "./website-detail-dialog";

type FilterKey = "categories" | "themes" | "colors";

function updateWebsiteQueryParam(website?: Website) {
  const url = new URL(window.location.href);
  if (website) url.searchParams.set("website", website.slug);
  else url.searchParams.delete("website");
  window.history.replaceState(null, "", url);
}

export function WebsiteArchive({
  websites,
  initialSlug,
  view,
}: {
  websites: Website[];
  initialSlug?: string;
  view: PostView;
}) {
  const [query, setQuery] = useState("");
  const [selections, setSelections] = useState<Record<FilterKey, string[]>>({
    categories: [],
    themes: [],
    colors: [],
  });
  const [selectedId, setSelectedId] = useState(
    websites.find((website) => website.slug === initialSlug)?.id,
  );

  const options = useMemo(() => {
    const withCounts = (
      values: string[],
      includesValue: (website: Website, value: string) => boolean,
    ): ArchiveFilterOption[] =>
      uniqueArchiveValues(values).map((value) => ({
        value,
        count: websites.filter((website) => includesValue(website, value)).length,
      }));
    return {
      categories: withCounts(websites.flatMap((website) => website.categories), (website, value) => website.categories.includes(value)),
      themes: withCounts(websites.flatMap((website) => website.themes), (website, value) => website.themes.includes(value)),
      colors: withCounts(websites.flatMap((website) => website.colors), (website, value) => website.colors.includes(value)),
    };
  }, [websites]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = websites.filter((website) => {
    const searchable = [website.title, website.tagline, website.creator.name, ...website.categories, ...website.themes, ...website.colors].join(" ").toLowerCase();
    return (
      (!normalizedQuery || searchable.includes(normalizedQuery)) &&
      selections.categories.every((value) => website.categories.includes(value)) &&
      selections.themes.every((value) => website.themes.includes(value)) &&
      selections.colors.every((value) => website.colors.includes(value))
    );
  });
  const selectedWebsite = websites.find((website) => website.id === selectedId);
  const hasFilters = normalizedQuery.length > 0 || Object.values(selections).some((values) => values.length > 0);

  const selectWebsite = useCallback((website: Website) => {
    setSelectedId(website.id);
    updateWebsiteQueryParam(website);
  }, []);
  const closeWebsite = useCallback(() => {
    setSelectedId(undefined);
    updateWebsiteQueryParam();
  }, []);
  const navigateWebsite = useCallback((direction: -1 | 1) => {
    if (!selectedId) return;
    const source = filtered.length > 0 ? filtered : websites;
    const currentIndex = source.findIndex((website) => website.id === selectedId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const next = source[(safeIndex + direction + source.length) % source.length];
    if (next) selectWebsite(next);
  }, [filtered, selectWebsite, selectedId, websites]);

  function toggleFilter(key: FilterKey, value: string) {
    setSelections((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  }

  return (
    <>
      <main className="archive-frame pb-16 pt-[var(--archive-description-gap)]">
        <section aria-label="Browse websites">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="archive-control-surface flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:gap-[var(--archive-search-gap)]">
              <label className="relative block w-full shrink-0 lg:w-[var(--archive-search-width)]">
                <span className="sr-only">Search websites</span>
                <span className="pointer-events-none absolute left-[11px] top-1/2 size-5 -translate-y-1/2 text-[#777]"><ArchiveSearchIcon /></span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search websites, styles, industries..." className="ios-no-focus-zoom focus-ring h-[var(--archive-control-height)] w-full border border-transparent bg-white py-2.5 pl-[41px] pr-3 text-[var(--archive-control-size)] text-[#505050] outline-none placeholder:text-[#8a8a8a] focus:border-black/10" />
              </label>
              <div className="flex min-w-0 flex-wrap gap-2 overflow-visible">
                <ArchiveFilterMenu label="Category" options={options.categories} selected={selections.categories} onToggle={(value) => toggleFilter("categories", value)} />
                <ArchiveFilterMenu label="Theme" options={options.themes} selected={selections.themes} onToggle={(value) => toggleFilter("themes", value)} />
                <ArchiveFilterMenu align="right" label="Color" options={options.colors} selected={selections.colors} onToggle={(value) => toggleFilter("colors", value)} />
              </div>
            </div>
            <div className="self-end xl:self-auto">
              <ViewFilter basePath="/websites" view={view} />
            </div>
          </div>

          {filtered.length > 0 ? (
            <div className="mt-[var(--archive-feed-gap)]">
              <FeedMotion itemCount={filtered.length}>
                <div className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 xl:gap-x-[35px] xl:gap-y-10">
                  {filtered.map((website) => <WebsiteCard key={website.id} website={website} onSelect={selectWebsite} />)}
                </div>
              </FeedMotion>
            </div>
          ) : (
            <div className="mt-10 flex min-h-64 flex-col items-center justify-center border border-[#e6e6e6] bg-[#fafafa] px-6 text-center">
              <p className="text-[18px] text-[#262626]">{websites.length === 0 ? "No published websites yet." : "No websites match these filters."}</p>
              {hasFilters ? <button type="button" onClick={() => { setQuery(""); setSelections({ categories: [], themes: [], colors: [] }); }} className="focus-ring mt-3 text-[14px] text-[#777] underline underline-offset-4 hover:text-black">Clear filters</button> : null}
            </div>
          )}
        </section>
      </main>

      {selectedWebsite ? (
        <WebsiteDetailDialog website={selectedWebsite} onClose={closeWebsite} onPrevious={() => navigateWebsite(-1)} onNext={() => navigateWebsite(1)} />
      ) : null}
    </>
  );
}
