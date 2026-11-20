"use client";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ActiveSponsor } from "@/domain/sponsor";
import { FeedMotion } from "../feed-motion";
import { RowFirstMasonry } from "../row-first-masonry";
import { SponsoredPostCard } from "../sponsored-post-card";
import { buildPlacementSequence } from "./placement-sequence";
import { usePublicSponsors } from "./public-sponsors";
export function SponsorFeed({
  ordinary,
  initialSponsors = [],
  layout = "masonry",
  hasMore = false,
  emptyLabel,
}: {
  ordinary: { id: string; node: ReactNode; mediaAspectRatio?: number }[];
  initialSponsors?: ActiveSponsor[];
  layout?: "masonry" | "websites";
  hasMore?: boolean;
  emptyLabel?: string;
}) {
  const { sponsors } = usePublicSponsors(initialSponsors);
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const placements = useMemo(
    () =>
      buildPlacementSequence({
        ordinaryIds: ordinary.map((o) => o.id),
        sponsors: sponsors.map((s) => s.id),
        columns,
        hasMore,
      }),
    [ordinary, sponsors, columns, hasMore],
  );
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const grid = container.querySelector(".feed-grid, [data-sponsor-grid]");
    if (!grid) return;
    const measure = () => {
      const columns = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      setColumns(columns || 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [layout]);
  const ordinaryById = new Map(ordinary.map(item => [item.id, item]));
  const sponsorsById = new Map(sponsors.map(sponsor => [sponsor.id, sponsor]));
  const items = placements.map((item, index) => {
    if (item.kind === "ordinary") return ordinaryById.get(item.id)?.node;

    // Website recordings can have different crops. Match a recording in this
    // row, or the nearest following/preceding recording on a single column.
    let referenceId: string | undefined;
    if (layout === "websites") {
      const rowStart = index - (index % columns);
      const next = placements[index + 1];
      referenceId = placements.slice(rowStart, rowStart + columns).find(entry => entry.kind === "ordinary")?.id
        ?? (next?.kind === "ordinary" ? next.id : ordinary.at(-1)?.id);
    }
    return (
      <SponsoredPostCard
        key={`sponsor-${item.id}-${item.round}`}
        sponsor={sponsorsById.get(item.id)!}
        variant={layout === "websites" ? "website" : "default"}
        mediaAspectRatio={referenceId === undefined ? undefined : ordinaryById.get(referenceId)?.mediaAspectRatio}
      />
    );
  });
  return (
    <div ref={ref}>
      {!items.length && emptyLabel && (
        <div className="flex min-h-[45dvh] items-center justify-center px-6 text-center text-sm text-[#777]">
          {emptyLabel}
        </div>
      )}
      <FeedMotion itemCount={items.length}>
        {layout === "masonry" ? (
          <RowFirstMasonry itemCount={items.length} fixedColumns={sponsors.length > 0} layoutKey={sponsors.map(sponsor => sponsor.id).join(",")}>
            {items}
          </RowFirstMasonry>
        ) : (
          <div
            data-sponsor-grid
            className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-4"
          >
            {items}
          </div>
        )}
      </FeedMotion>
    </div>
  );
}
