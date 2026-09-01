import type { Logo } from "@/domain/logo";

import { CreatorAvatar } from "../creator-avatar";
import { ResponsiveR2Image } from "../responsive-r2-image";

export function LogoCard({
  logo,
  onSelect,
}: {
  logo: Logo;
  onSelect: (logo: Logo) => void;
}) {
  return (
    <article data-feed-card>
      <button
        type="button"
        data-feed-post-id={logo.id}
        data-feed-post-pathname={`/logos?logo=${logo.slug}`}
        data-feed-post-title={logo.title}
        data-feed-creator-name={logo.creator.name}
        aria-label={`View ${logo.title} ${logo.kind}`}
        onClick={() => onSelect(logo)}
        className="focus-ring group relative block w-full overflow-hidden bg-transparent text-left"
        style={{ aspectRatio: `${logo.media.width}/${logo.media.height}` }}
      >
        <ResponsiveR2Image
          data-feed-transition-media
          src={logo.media.url}
          alt={logo.media.alt}
          width={logo.media.width}
          height={logo.media.height}
          variants={logo.media.variants}
          sizes="(min-width: 1120px) 395px, (min-width: 760px) 33vw, (min-width: 460px) 50vw, 100vw"
          className="absolute inset-0 size-full object-contain"
        />
        {logo.kind === "logo" ? (
          <span className="absolute bottom-[10px] left-[10px] z-10 flex items-end min-[1800px]:bottom-3 min-[1800px]:left-3">
            <CreatorAvatar
              creator={logo.creator}
              role="feed"
              width={35}
              height={35}
              sizes="35px"
              className="size-7 shrink-0 rounded-full border border-[#e6e6e6] object-cover xl:size-[30px] min-[1800px]:size-[35px]"
            />
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-0 border border-black/[0.06]" />
      </button>
    </article>
  );
}
