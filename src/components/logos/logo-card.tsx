import type { Logo } from "@/domain/logo";

import { CreatorAvatar } from "../creator-avatar";
import { FeedSaveButton } from "../feed-save-overlay";
import { ResponsiveR2Image } from "../responsive-r2-image";

export function LogoCard({
  logo,
  onSelect,
  initiallySaved = false,
  onSavedChange,
}: {
  logo: Logo;
  onSelect: (logo: Logo) => void;
  initiallySaved?: boolean;
  onSavedChange?: (saved: boolean) => void;
}) {
  return (
    <article data-feed-card>
      <div className="group relative">
      <button
        type="button"
        data-feed-post-id={logo.id}
        data-feed-post-pathname={`/logos?logo=${logo.slug}`}
        data-feed-post-title={logo.title}
        data-feed-creator-name={logo.creator.name}
        aria-label={`View ${logo.title} ${logo.kind}`}
        onClick={() => onSelect(logo)}
        className="focus-ring group relative block w-full cursor-pointer overflow-hidden bg-transparent text-left"
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
          <span className="absolute bottom-[var(--archive-card-overlay-inset)] left-[var(--archive-card-overlay-inset)] z-10 flex items-end">
            <CreatorAvatar
              creator={logo.creator}
              role="feed"
              width={35}
              height={35}
              sizes="35px"
              className="size-[var(--archive-card-overlay-size)] shrink-0 rounded-full border border-[#e6e6e6] object-cover"
            />
          </span>
        ) : null}
        {logo.kind === "logo" ? (
          <span className="pointer-events-none absolute inset-0 border border-black/[0.06]" />
        ) : null}
      </button>
      <FeedSaveButton postId={logo.id} initiallySaved={initiallySaved} onSavedChange={onSavedChange} />
      </div>
    </article>
  );
}
