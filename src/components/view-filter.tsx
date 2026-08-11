"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import type { PostCategory, PostView } from "@/domain/post";

const viewOptions = [
  { value: "latest", label: "Latest" },
  { value: "featured", label: "Featured" },
] as const satisfies ReadonlyArray<{ value: PostView; label: string }>;

export function ViewFilter({
  category,
  view,
}: {
  category?: PostCategory;
  view: PostView;
}) {
  const router = useRouter();
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [previewView, setPreviewView] = useState<PostView | null>(null);
  const [isPending, startTransition] = useTransition();
  const currentLabel = view === "featured" ? "Featured" : "Latest";
  const highlightedView = previewView ?? view;

  useEffect(() => {
    if (!open) return;

    selectedOptionRef.current?.focus();

    function closeOnOutsidePress(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPreviewView(null);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setPreviewView(null);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function changeView(nextView: PostView) {
    setOpen(false);
    setPreviewView(null);
    triggerRef.current?.focus();
    if (nextView === view) return;

    const searchParams = new URLSearchParams();
    if (nextView === "featured") searchParams.set("view", nextView);
    if (category) searchParams.set("category", category);
    const query = searchParams.toString();

    startTransition(() => router.push(query ? `/?${query}` : "/"));
  }

  function toggleMenu() {
    if (open) setPreviewView(null);
    setOpen(!open);
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label="Sort posts"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={isPending}
        onClick={toggleMenu}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) toggleMenu();
          }
        }}
        className={`focus-ring group inline-flex h-10 min-w-[96px] items-center justify-center gap-1.5 border px-4 text-[13px] font-normal leading-none tracking-[0.2px] transition-[background,border-color,opacity] sm:h-[41px] min-[1200px]:min-w-[111px] min-[1200px]:px-6 min-[1700px]:text-[14px] ${
          open
            ? "border-black/20 bg-white"
            : "border-black/15 bg-white hover:border-black/20 hover:bg-[#f5f5f5]"
        } ${isPending ? "cursor-wait opacity-55" : ""}`}
      >
        <span>{currentLabel}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`size-[11px] text-[#777] transition-transform duration-150 ease-out motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        id={menuId}
        role="listbox"
        aria-label="Post order"
        aria-hidden={!open}
        onMouseLeave={() => setPreviewView(null)}
        className={`absolute right-0 top-[calc(100%+8px)] z-50 w-[148px] origin-top-right border border-black/10 bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
          open
            ? "visible translate-y-0 scale-100 opacity-100"
            : "invisible pointer-events-none -translate-y-1 scale-[0.97] opacity-0"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-x-1.5 top-1.5 h-8 bg-[#eeeeec] transition-transform duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
            highlightedView === "featured" ? "translate-y-8" : "translate-y-0"
          }`}
        />
        {viewOptions.map((option) => {
          const selected = option.value === view;
          return (
            <button
              key={option.value}
              ref={selected ? selectedOptionRef : undefined}
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={open ? 0 : -1}
              onFocus={() => setPreviewView(option.value)}
              onMouseEnter={() => setPreviewView(option.value)}
              onClick={() => changeView(option.value)}
              className={`focus-ring relative z-10 flex h-8 w-full items-center px-2.5 text-left text-[13px] leading-none tracking-[0.2px] transition-colors min-[1700px]:text-[14px] ${
                highlightedView === option.value ? "text-black" : "text-[#3f3f3f]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
