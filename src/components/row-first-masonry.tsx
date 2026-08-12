"use client";

import {
  type PropsWithChildren,
  useLayoutEffect,
  useRef,
} from "react";

const GRID_ROW_HEIGHT = 1;

export function RowFirstMasonry({
  children,
  itemCount,
}: PropsWithChildren<{ itemCount: number }>) {
  const gridRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const cards = Array.from(
      grid.querySelectorAll<HTMLElement>("[data-feed-card]"),
    );

    function sizeCard(gridElement: HTMLDivElement, card: HTMLElement) {
      const rowGap = Number.parseFloat(getComputedStyle(gridElement).rowGap) || 0;
      // offsetHeight reflects layout size without GSAP's reveal transform.
      const height = card.offsetHeight;
      const span = Math.max(
        1,
        Math.ceil((height + rowGap) / (GRID_ROW_HEIGHT + rowGap)),
      );
      card.style.gridRowEnd = `span ${span}`;
    }

    cards.forEach((card) => sizeCard(grid, card));
    grid.dataset.masonryReady = "";
    grid.dataset.masonryState = "ready";

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => sizeCard(grid, entry.target as HTMLElement));
    });
    cards.forEach((card) => observer.observe(card));

    return () => {
      observer.disconnect();
    };
  }, [itemCount]);

  return (
    <div
      ref={gridRef}
      className="feed-grid"
      data-masonry-state="pending"
    >
      {children}
    </div>
  );
}
