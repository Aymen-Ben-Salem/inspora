import "server-only";

import { DesignHeader } from "../design-header";

const backdropCards = Array.from({ length: 16 }, (_, index) => index);

export function PublicAuthBackdrop() {
  return (
    <div className="min-h-[calc(100dvh+16px)] bg-white">
      <DesignHeader view="latest" />
      <section
        aria-hidden="true"
        className="archive-frame pt-[var(--archive-feed-gap)] pb-16"
      >
        <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 min-[760px]:grid-cols-3 min-[1120px]:grid-cols-4">
          {backdropCards.map((card) => (
            <div
              key={card}
              className="relative aspect-[1080/659] overflow-hidden bg-[#f4f3ed]"
            >
              <div className="absolute inset-0 flex items-center justify-center text-[clamp(28px,3.2vw,48px)] font-semibold tracking-[-0.08em] text-[#262626]">
                Paper
              </div>
              <div className="absolute right-3 bottom-3 size-8 rounded-full bg-[#767676]" />
              <div className="absolute bottom-3 left-3 size-8 rounded-full border border-[#e6e6e6] bg-white" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
