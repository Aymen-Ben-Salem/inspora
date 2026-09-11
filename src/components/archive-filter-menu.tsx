"use client";

import Image from "next/image";
import { useState } from "react";

export type ArchiveFilterOption = { count: number; value: string };

const ARCHIVE_SEARCH_ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAVCAYAAABG1c6oAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAAe9JREFUeAGtlUvLcVEUx/+PpFwGGLgWJpQoEwYupWTkA8hIMldmJFOKic+gJCMmZgZKkQG5DKSMJEUhJAk5r7Pr0ZP3HHnfx6/O5Ozdb6+1zlr7fJ3PZwofhIMPw2Vb2O/36PV62G63EAgE0Ol00Ov1+GfharVCPp/HcDgEj8eDUCjE6XTC4XCAXC5HMBiExWJhFX79rOF8PkcqlQKfz0c4HIbJZHpsXC6XKJVK6Ha7CIVC8Hg8zEZaSD/31KhoNEolk0lqs9lQ3++fn3K5TPn9fmowGDCuPz5Ko9HAer1GJBKBSCRiTcnn85GUK5UK4/pD2Ol04HQ6IZFI8AoOhwO3243xeIzFYsEunE6n0Gq1eAez2Yzb7YbZbMYuvOcPLpf7lvB73/V6ZRcqFArSe+9AdwONTCZjF9psNtTrdbxDs9mEUqlkLNFDaLfbSfPSvfaKyWSCWq0Gr9fLWKKHUK1WIxAIoFqtolgs4nK5/LW53W4jl8sRkdVqZTzw6/m2abVaKBQKoCgKRqMRKpWKRN7v98lYOhwO0hE0sVgMUqn0tZDmeDySet6nAfepIaNoMBhI/2k0Gux2O6TTaXJoIpGAWCx+LXwH+qBMJkOk8Xj8Eel/34e0gI6OJpvN4tcR/ox0NBrB5XJ9RvjMx38BfwDi9w0treTAFwAAAABJRU5ErkJggg==";

export function uniqueArchiveValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function ArchiveSearchIcon() {
  return (
    <Image src={ARCHIVE_SEARCH_ICON_DATA_URL} alt="" aria-hidden="true" width={20} height={21} className="h-auto w-full object-contain" />
  );
}

export function ArchiveFilterMenu({
  align = "left",
  label,
  options,
  selected,
  onToggle,
}: {
  align?: "left" | "right";
  label: string;
  options: ArchiveFilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [menuQuery, setMenuQuery] = useState("");
  const visibleOptions = options.filter((option) =>
    option.value.toLowerCase().includes(menuQuery.trim().toLowerCase()),
  );

  return (
    <details name="archive-filter-menu" className="group relative shrink-0 open:z-40">
      <summary className={`focus-ring flex h-[var(--archive-control-height)] min-w-[96px] cursor-pointer list-none items-center justify-center gap-2.5 border bg-white px-[var(--archive-control-x)] text-[var(--archive-control-size)] tracking-[0.2px] [&::-webkit-details-marker]:hidden ${selected.length > 0 ? "border-[#e6e6e6] text-[#262626]" : "border-transparent text-[#585858]/80"}`}>
        {label}
        <Image src="/icons/logos-filter-chevron.svg" alt="" aria-hidden="true" width={9.2} height={5.2} className="h-[5.2px] w-[9.2px] shrink-0 transition-transform group-open:rotate-180" />
        {selected.length > 0 ? <span className="flex min-w-[21px] items-center justify-center rounded-full bg-[#262626] px-1 py-0.5 text-[14px] leading-normal text-white">{selected.length}</span> : null}
      </summary>
      <div className={`logo-filter-menu absolute top-[calc(100%+6px)] z-50 flex max-w-[calc(100vw-2rem)] flex-col border border-[#e6e6e6] bg-white ${align === "right" ? "right-0" : "left-0"}`}>
        <label className="relative block w-full">
          <span className="sr-only">Search {label.toLowerCase()} filters</span>
          <span className="logo-filter-search-icon pointer-events-none absolute top-1/2 -translate-y-1/2 text-[#777]"><ArchiveSearchIcon /></span>
          <input type="search" value={menuQuery} onChange={(event) => setMenuQuery(event.target.value)} placeholder="Search....." className="archive-search-input logo-filter-menu-search ios-no-focus-zoom focus-ring w-full border border-[#e6e6e6] bg-[#fafafa] py-2.5 text-[#262626] outline-none placeholder:text-[#8a8a8a]" />
        </label>
        <span aria-hidden="true" className="h-px w-full bg-[#e6e6e6]" />
        <div className="min-w-0">
          <p className="logo-filter-menu-title tracking-[0.2px] text-[#262626]">{label}</p>
          {visibleOptions.length > 0 ? (
            <div className="logo-filter-options flex flex-col overflow-y-auto">
              {visibleOptions.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <label key={option.value} className="logo-filter-option flex cursor-pointer items-center justify-between pr-2 tracking-[0.2px] text-[#262626]">
                    <span className="flex min-w-0 items-center gap-2">
                      <input type="checkbox" checked={checked} onChange={() => onToggle(option.value)} className="logo-filter-checkbox shrink-0 appearance-none border border-[#262626] bg-white checked:bg-black" />
                      <span className={checked ? "font-medium" : "font-normal"}>{option.value}</span>
                    </span>
                    <span className="shrink-0 font-normal text-[#7b7b7b]">{option.count}</span>
                  </label>
                );
              })}
            </div>
          ) : <p className="py-2 text-[14px] text-[#8a8a8a]">No options found</p>}
        </div>
      </div>
    </details>
  );
}
