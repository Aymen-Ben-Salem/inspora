"use client";
import Image from "next/image";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { usePublicSponsors } from "./public-sponsors";
export function SponsorMarquee() {
  const { sponsors: all } = usePublicSponsors();
  const sponsors = all.filter((s) => s.wordmarkUrl);
  const viewport = useRef<HTMLDivElement>(null),
    originals = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ copies: 2, width: 0 });
  useLayoutEffect(() => {
    const container = viewport.current,
      row = originals.current;
    if (!container || !row) return;
    const measure = () => {
      const width = row.scrollWidth;
      setSize((previous) =>
        previous.width === width &&
        previous.copies ===
          Math.max(2, Math.ceil(container.clientWidth / Math.max(1, width)) + 1)
          ? previous
          : {
              width,
              copies: Math.max(
                2,
                Math.ceil(container.clientWidth / Math.max(1, width)) + 1,
              ),
            },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(row);
    return () => observer.disconnect();
  }, [sponsors.length]);
  if (!sponsors.length) return null;
  return (
    <footer
      className="detail-fit-footer mt-auto min-w-0 shrink-0 pt-8"
      aria-label="Sponsors"
    >
      <div
        ref={viewport}
        className="sponsor-marquee"
        style={
          {
            "--sponsor-loop-width": `${size.width}px`,
            "--sponsor-loop-duration": `${Math.max(1, size.width / 24)}s`,
          } as CSSProperties
        }
      >
        <div className="sponsor-marquee-track">
          <div ref={originals} className="sponsor-wordmarks">
            {sponsors.map((s) => (
              <a
                key={s.id}
                data-sponsor-placement="detail"
                data-campaign-id={s.id}
                data-version-id={s.versionId}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Sponsored: ${s.title}`}
                className="focus-ring flex shrink-0 items-center"
              >
                <Image
                  src={s.wordmarkUrl!}
                  alt={s.title}
                  width={160}
                  height={28}
                  unoptimized
                  className="max-h-7 w-auto max-w-[160px] object-contain"
                />
              </a>
            ))}
          </div>
          {Array.from({ length: size.copies }, (_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="sponsor-wordmarks sponsor-wordmark-clones"
            >
              {sponsors.map((s) => (
                <span key={s.id} className="flex shrink-0 items-center">
                  <Image
                    src={s.wordmarkUrl!}
                    alt=""
                    width={160}
                    height={28}
                    unoptimized
                    className="max-h-7 w-auto max-w-[160px] object-contain"
                  />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
