"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";

import type { Logo, LogoKind } from "@/domain/logo";
import { matchesLogoFilters, type LogoFilters } from "@/data/logo-filters";

import { FeedMotion } from "../feed-motion";
import { RowFirstMasonry } from "../row-first-masonry";
import { LogoCard } from "./logo-card";
import { LogoDetailDialog } from "./logo-detail-dialog";

type FilterKey = "colors" | "industries" | "styles" | "shapes";

const SEARCH_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAVCAYAAABG1c6oAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAAe9JREFUeAGtlUvLcVEUx/+PpFwGGLgWJpQoEwYupWTkA8hIMldmJFOKic+gJCMmZgZKkQG5DKSMJEUhJAk5r7Pr0ZP3HHnfx6/O5Ozdb6+1zlr7fJ3PZwofhIMPw2Vb2O/36PV62G63EAgE0Ol00Ov1+GfharVCPp/HcDgEj8eDUCjE6XTC4XCAXC5HMBiExWJhFX79rOF8PkcqlQKfz0c4HIbJZHpsXC6XKJVK6Ha7CIVC8Hg8zEZaSD/31KhoNEolk0lqs9lQ3++fn3K5TPn9fmowGDCuPz5Ko9HAer1GJBKBSCRiTcnn85GUK5UK4/pD2Ol04HQ6IZFI8AoOhwO3243xeIzFYsEunE6n0Gq1eAez2Yzb7YbZbMYuvOcPLpf7lvB73/V6ZRcqFArSe+9AdwONTCZjF9psNtTrdbxDs9mEUqlkLNFDaLfbSfPSvfaKyWSCWq0Gr9fLWKKHUK1WIxAIoFqtolgs4nK5/LW53W4jl8sRkdVqZTzw6/m2abVaKBQKoCgKRqMRKpWKRN7v98lYOhwO0hE0sVgMUqn0tZDmeDySet6nAfepIaNoMBhI/2k0Gux2O6TTaXJoIpGAWCx+LXwH+qBMJkOk8Xj8Eel/34e0gI6OJpvN4tcR/ox0NBrB5XJ9RvjMx38BfwDi9w0treTAFwAAAABJRU5ErkJggg==";

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function updateLogoQueryParam(logo?: Logo) {
  const url = new URL(window.location.href);
  if (logo) url.searchParams.set("logo", logo.slug);
  else url.searchParams.delete("logo");
  window.history.replaceState(null, "", url);
}

function FilterMenu({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <details className="group relative shrink-0 open:z-40">
      <summary
        className={`focus-ring flex h-[41px] min-w-[120px] cursor-pointer list-none items-center justify-center gap-2.5 border px-4 text-[14px] tracking-[0.2px] [&::-webkit-details-marker]:hidden ${
          selected.length > 0
            ? "border-[#262626] text-[#262626]"
            : "border-[#e6e6e6] text-[#7b7b7b]"
        }`}
      >
        {label}
        <Image
          src="/icons/logos-filter-chevron.svg"
          alt=""
          aria-hidden="true"
          width={9.2}
          height={5.2}
          className="h-[5.2px] w-[9.2px] shrink-0 transition-transform group-open:rotate-180"
        />
        {selected.length > 0 ? (
          <span className="flex min-w-[21px] items-center justify-center rounded-full bg-[#262626] px-1 py-0.5 text-[14px] leading-normal text-white">
            {selected.length}
          </span>
        ) : null}
      </summary>
      <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-60 border border-[#e6e6e6] bg-white p-2 shadow-[0_14px_35px_rgba(0,0,0,0.12)]">
        {options.length > 0 ? (
          <div className="grid max-h-64 gap-0.5 overflow-y-auto">
            {options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 px-2 py-2 text-[13px] text-[#505050] hover:bg-[#f3f3f1]"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => onToggle(option)}
                />
                {option}
              </label>
            ))}
          </div>
        ) : (
          <p className="px-2 py-3 text-[13px] text-[#8a8a8a]">No options yet</p>
        )}
      </div>
    </details>
  );
}

export function LogoArchive({
  logos,
  initialSlug,
}: {
  logos: Logo[];
  initialSlug?: string;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<LogoKind>(
    logos.find((logo) => logo.slug === initialSlug)?.kind ?? "logo",
  );
  const [selections, setSelections] = useState<Record<FilterKey, string[]>>({
    colors: [],
    industries: [],
    styles: [],
    shapes: [],
  });
  const [selectedId, setSelectedId] = useState(
    logos.find((logo) => logo.slug === initialSlug)?.id,
  );

  const options = useMemo(
    () => ({
      colors: uniqueSorted(logos.flatMap((logo) => logo.colors)),
      industries: uniqueSorted(logos.map((logo) => logo.industry)),
      styles: uniqueSorted(logos.flatMap((logo) => logo.styles)),
      shapes: uniqueSorted(logos.map((logo) => logo.shape)),
    }),
    [logos],
  );

  const filters: LogoFilters = {
    query,
    kind,
    colors: selections.colors,
    industries: selections.industries,
    styles: selections.styles,
    shapes: selections.shapes,
  };
  const filtered = logos.filter((logo) => matchesLogoFilters(logo, filters));
  const selectedLogo = logos.find((logo) => logo.id === selectedId);
  const hasFilters =
    query.trim().length > 0 ||
    Object.values(selections).some((values) => values.length > 0);

  const selectLogo = useCallback((logo: Logo) => {
    setSelectedId(logo.id);
    updateLogoQueryParam(logo);
  }, []);

  const closeLogo = useCallback(() => {
    setSelectedId(undefined);
    updateLogoQueryParam();
  }, []);

  const navigateLogo = useCallback(
    (direction: -1 | 1) => {
      if (!selectedId) return;
      const source = filtered.length > 0 ? filtered : logos;
      const currentIndex = source.findIndex((logo) => logo.id === selectedId);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const next = source[(safeIndex + direction + source.length) % source.length];
      if (next) selectLogo(next);
    },
    [filtered, logos, selectLogo, selectedId],
  );

  function toggleFilter(key: FilterKey, value: string) {
    setSelections((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  }

  function clearFilters() {
    setQuery("");
    setSelections({ colors: [], industries: [], styles: [], shapes: [] });
  }

  return (
    <>
      <main className="mx-auto w-full max-w-[1705px] px-4 pb-16 pt-9 sm:px-5 lg:pt-10 xl:px-6 min-[1700px]:px-11 min-[1700px]:pt-11">
        <section aria-label="Browse logos and icons">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:gap-10">
              <label className="relative block w-full shrink-0 lg:w-[397px]">
                <span className="sr-only">Search logos and icons</span>
                <Image
                  src={SEARCH_ICON_DATA_URL}
                  alt=""
                  aria-hidden="true"
                  width={20}
                  height={21}
                  className="pointer-events-none absolute left-[11px] top-1/2 size-5 -translate-y-1/2 object-contain"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search logos, colors, styles..."
                  className="ios-no-focus-zoom focus-ring h-[43px] w-full border border-[#e6e6e6] bg-[#fafafa] py-2.5 pl-[41px] pr-3 text-[16px] text-[#505050] outline-none placeholder:text-[#8a8a8a]"
                />
              </label>

              <div className="flex min-w-0 flex-wrap gap-2 overflow-visible">
                <FilterMenu
                  label="Color"
                  options={options.colors}
                  selected={selections.colors}
                  onToggle={(value) => toggleFilter("colors", value)}
                />
                <FilterMenu
                  label="Industry"
                  options={options.industries}
                  selected={selections.industries}
                  onToggle={(value) => toggleFilter("industries", value)}
                />
                <FilterMenu
                  label="Style"
                  options={options.styles}
                  selected={selections.styles}
                  onToggle={(value) => toggleFilter("styles", value)}
                />
                <FilterMenu
                  label="Shape"
                  options={options.shapes}
                  selected={selections.shapes}
                  onToggle={(value) => toggleFilter("shapes", value)}
                />
              </div>
            </div>

            <div className="flex items-center self-end xl:self-auto">
              {(["logo", "icon"] as const).map((option) => {
                const active = kind === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setKind(option)}
                    className={`focus-ring h-[41px] min-w-[72px] border px-3 text-[16px] ${
                      active
                        ? "border-[#262626] bg-[#262626] text-white"
                        : "border-[#e6e6e6] bg-white text-black/60"
                    }`}
                  >
                    {option === "logo" ? "Logos" : "Icons"}
                  </button>
                );
              })}
            </div>
          </div>

          {filtered.length > 0 ? (
            <div className="mt-10">
              {kind === "icon" ? (
                <FeedMotion itemCount={filtered.length}>
                  <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 min-[1500px]:grid-cols-9 min-[1500px]:gap-7">
                    {filtered.map((logo) => (
                      <LogoCard key={logo.id} logo={logo} onSelect={selectLogo} />
                    ))}
                  </div>
                </FeedMotion>
              ) : (
                <FeedMotion itemCount={filtered.length}>
                  <RowFirstMasonry itemCount={filtered.length}>
                    {filtered.map((logo) => (
                      <LogoCard key={logo.id} logo={logo} onSelect={selectLogo} />
                    ))}
                  </RowFirstMasonry>
                </FeedMotion>
              )}
            </div>
          ) : (
            <div className="mt-10 flex min-h-64 flex-col items-center justify-center border border-[#e6e6e6] bg-[#fafafa] px-6 text-center">
              <p className="text-[18px] text-[#262626]">
                {logos.length === 0
                  ? "No published logos or icons yet."
                  : `No ${kind === "logo" ? "logos" : "icons"} match these filters.`}
              </p>
              {hasFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="focus-ring mt-3 text-[14px] text-[#777] underline underline-offset-4 hover:text-black"
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )}
        </section>
      </main>

      {selectedLogo ? (
        <LogoDetailDialog
          logo={selectedLogo}
          onClose={closeLogo}
          onPrevious={() => navigateLogo(-1)}
          onNext={() => navigateLogo(1)}
        />
      ) : null}
    </>
  );
}
