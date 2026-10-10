"use client";
import Image from "next/image";
import { usePublicSponsors } from "./public-sponsors";
export function SponsorIcons() {
  const { sponsors } = usePublicSponsors();
  return (
    <div aria-label="Sponsors" className="flex items-center gap-1">
      {sponsors
        .slice(0, 4)
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
            className="focus-ring flex size-[35px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#e6e6e6] p-1"
          >
            <Image
              src={s.iconUrl!}
              alt=""
              width={28}
              height={28}
              unoptimized
              className="size-full object-contain"
            />
          </a>
        ))}
    </div>
  );
}
