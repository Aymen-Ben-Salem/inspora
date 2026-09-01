import type { CSSProperties } from "react";

import type { Website, WebsiteSection } from "@/domain/website";

export function WebsiteCropImage({
  website,
  section,
  className = "",
  transitionMedia = false,
}: {
  website: Website;
  section: WebsiteSection;
  className?: string;
  transitionMedia?: boolean;
}) {
  const translate = (section.top / website.fullPage.height) * 100;
  return (
    <div
      className={`relative overflow-hidden bg-[#f2f2f2] ${className}`}
      style={{ aspectRatio: `${website.fullPage.width} / ${section.height}` }}
    >
      {/* A single cached full-page asset powers every crop. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-feed-transition-media={transitionMedia ? "" : undefined}
        src={website.fullPage.url}
        alt={website.fullPage.alt}
        width={website.fullPage.width}
        height={website.fullPage.height}
        loading="lazy"
        className="absolute inset-x-0 top-0 h-auto w-full max-w-none"
        style={{ transform: `translateY(-${translate}%)` } as CSSProperties}
      />
    </div>
  );
}
