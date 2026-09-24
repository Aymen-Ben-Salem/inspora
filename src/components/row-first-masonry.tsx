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

    function sizeCards(gridElement: HTMLDivElement, items: HTMLElement[]) {
      const rowGap = Number.parseFloat(getComputedStyle(gridElement).rowGap) || 0;
      // Read all layout heights before writing spans to avoid a reflow per card.
      // offsetHeight includes padding and ignores the reveal animation transform.
      const spans = items.map((card) => Math.max(
        1,
        Math.ceil((card.offsetHeight + rowGap) / (GRID_ROW_HEIGHT + rowGap)),
      ));
      items.forEach((card, index) => {
        card.style.gridRowEnd = `span ${spans[index]}`;
      });
    }

    sizeCards(grid, cards);
    grid.dataset.masonryReady = "";
    grid.dataset.masonryState = "ready";

    const observer = new ResizeObserver((entries) => {
      sizeCards(grid, entries.map((entry) => entry.target as HTMLElement));
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
