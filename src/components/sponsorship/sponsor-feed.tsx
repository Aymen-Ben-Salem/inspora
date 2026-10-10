"use client";
import {
  useId,
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
import {
  buildPlacementSequence,
  type SponsorPosition,
} from "./placement-sequence";
import { usePublicSponsors } from "./public-sponsors";
export function SponsorFeed({
  ordinary,
  initialSponsors = [],
  layout = "masonry",
  hasMore = false,
  emptyLabel,
}: {
  ordinary: { id: string; node: ReactNode }[];
  initialSponsors?: ActiveSponsor[];
  layout?: "masonry" | "websites";
  hasMore?: boolean;
  emptyLabel?: string;
}) {
  const { sponsors } = usePublicSponsors(initialSponsors);
  const id = useId(),
    ref = useRef<HTMLDivElement>(null);
  const [schedule, setSchedule] = useState<{
    columns: number;
    seed: string;
    placements: SponsorPosition[];
    measured: boolean;
  }>({ columns: 1, seed: id, placements: [], measured: false });
  const result = useMemo(
    () =>
      buildPlacementSequence({
        ordinaryIds: ordinary.map((o) => o.id),
        sponsors: sponsors.map((s) => s.id),
        columns: schedule.columns,
        seed: schedule.seed,
        hasMore,
        previous: schedule.placements,
      }),
    [ordinary, sponsors, schedule, hasMore],
  );
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const grid = container.querySelector(".feed-grid, [data-sponsor-grid]");
    if (!grid) return;
    const seed = crypto.randomUUID();
    const measure = () => {
      const columns =
        getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean)
          .length || 1;
      setSchedule((s) =>
        s.columns === columns && s.measured
          ? s
          : { ...s, columns, seed: s.measured ? s.seed : seed, measured: true },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  if (
    schedule.measured &&
    JSON.stringify(result.placements) !== JSON.stringify(schedule.placements)
  ) {
    setSchedule({ ...schedule, placements: result.placements });
  }
  const items = result.items.map((item) =>
    item.kind === "ordinary" ? (
      ordinary.find((o) => o.id === item.id)?.node
    ) : (
      <SponsoredPostCard
        key={`sponsor-${item.id}`}
        sponsor={sponsors.find((s) => s.id === item.id)!}
      />
    ),
  );
  return (
    <div ref={ref}>
      {!items.length && emptyLabel && (
        <div className="flex min-h-[45dvh] items-center justify-center px-6 text-center text-sm text-[#777]">
          {emptyLabel}
        </div>
      )}
      <FeedMotion itemCount={items.length}>
        {layout === "masonry" ? (
          <RowFirstMasonry itemCount={items.length}>{items}</RowFirstMasonry>
        ) : (
          <div
            data-sponsor-grid
            className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 xl:gap-x-[35px]"
          >
            {items}
          </div>
        )}
      </FeedMotion>
    </div>
  );
}
