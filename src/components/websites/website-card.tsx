import type { Website } from "@/domain/website";
import { getWebsiteTransitionHero } from "@/lib/website-media-actions";

import { WebsiteCropImage } from "./website-crop-image";

export function WebsiteCard({ website, onSelect }: { website: Website; onSelect: (website: Website) => void }) {
  const feedHero = getWebsiteTransitionHero(website);
  if (!feedHero) return null;

  return (
    <article data-feed-card>
      <button
        type="button"
        data-feed-post-id={website.id}
        data-feed-post-pathname={`/websites?website=${website.slug}`}
        data-feed-post-title={website.title}
        data-feed-creator-name={website.creator.name}
        aria-label={`View ${website.title} website`}
        onClick={() => onSelect(website)}
        className="focus-ring group block w-full text-left"
      >
        <WebsiteCropImage website={website} section={feedHero} transitionMedia className="w-full" />
        <div className="mt-5 flex items-start gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={website.favicon.url} alt="" aria-hidden="true" width={39} height={39} className="size-[39px] shrink-0 object-contain" />
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-medium leading-[1.25] tracking-[0.04px] text-[#262626]">{website.title}</h2>
            <p className="mt-1 line-clamp-2 max-w-[420px] text-[14px] leading-[1.3] tracking-[0.04px] text-[#7b7b7b]">{website.tagline}</p>
          </div>
        </div>
      </button>
    </article>
  );
}
