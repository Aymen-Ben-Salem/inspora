"use client";
import Image from "next/image";
import { usePublicSponsors } from "./public-sponsors";

export function SponsorNavbarIcon({ src, alt = "" }: { src: string; alt?: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={35}
      height={35}
      unoptimized
      className="block size-[35px] shrink-0 rounded-md object-contain"
    />
  );
}

export function SponsorIcons() {
  const { sponsors } = usePublicSponsors();
  return (
    <div role="group" aria-label="Sponsors" className="flex items-center gap-1">
      {sponsors
        .filter((s) => s.iconUrl)
        .map((s) => (
          <a
            key={s.id}
            data-sponsor-placement="header"
            data-campaign-id={s.id}
            data-version-id={s.versionId}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Sponsored: ${s.title}`}
            className="focus-ring block size-[35px] shrink-0 rounded-md"
          >
            <SponsorNavbarIcon src={s.iconUrl!} />
          </a>
        ))}
    </div>
  );
}
