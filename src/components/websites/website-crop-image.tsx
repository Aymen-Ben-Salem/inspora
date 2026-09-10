import type { Website, WebsiteSection } from "@/domain/website";

import { ResponsiveR2Image } from "../responsive-r2-image";

export function WebsiteCropImage({
  section,
  className = "",
  transitionMedia = false,
}: {
  website: Website;
  section: WebsiteSection;
  className?: string;
  transitionMedia?: boolean;
}) {
  return (
    <div
      data-feed-transition-target={transitionMedia ? "" : undefined}
      className={`relative overflow-hidden bg-[#f2f2f2] ${className}`}
      style={{ aspectRatio: `${section.width} / ${section.height}` }}
    >
      {section.storageProvider === "r2" ? (
        <ResponsiveR2Image
          src={section.url}
          alt={section.alt}
          width={section.width}
          height={section.height}
          variants={section.variants}
          sizes="(min-width: 640px) 50vw, 100vw"
          className="block h-auto w-full"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-feed-transition-media={transitionMedia ? "" : undefined}
          src={section.url}
          alt={section.alt}
          width={section.width}
          height={section.height}
          loading="lazy"
          className="block h-auto w-full"
        />
      )}
    </div>
  );
}
