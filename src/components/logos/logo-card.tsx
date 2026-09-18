import type { Logo } from "@/domain/logo";
import type { Route } from "next";
import Link from "next/link";

import { CreatorAvatar, creatorProfileHref } from "../creator-avatar";
import { FeedSaveButton } from "../feed-save-overlay";
import { ResponsiveR2Image } from "../responsive-r2-image";

export function LogoCard({
  logo,
  onSelect,
  initiallySaved = false,
  onSavedChange,
  showCreator = true,
  iconLayout = "square",
}: {
  logo: Logo;
  onSelect: (logo: Logo) => void;
  initiallySaved?: boolean;
  onSavedChange?: (saved: boolean) => void;
  showCreator?: boolean;
  iconLayout?: "square" | "profile";
}) {
  const isIcon = logo.kind === "icon";
  const isProfileIcon = isIcon && iconLayout === "profile";

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
        className={`focus-ring group relative block w-full cursor-pointer overflow-hidden text-left ${
          isIcon
            ? `${isProfileIcon ? "aspect-[1.64]" : "aspect-square"} bg-[#f3f3f3]`
            : "bg-transparent"
        }`}
        style={isIcon ? undefined : { aspectRatio: `${logo.media.width}/${logo.media.height}` }}
      >
        {isIcon ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <ResponsiveR2Image
              data-feed-transition-media
              src={logo.media.url}
              alt={logo.media.alt}
              width={logo.media.width}
              height={logo.media.height}
              variants={logo.media.variants}
              sizes="(min-width: 1120px) 140px, (min-width: 460px) 18vw, 34vw"
              className={`${isProfileIcon ? "w-[34%] max-w-32" : "w-[44%]"} h-auto object-contain`}
            />
          </span>
        ) : (
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
        )}
        <span className="pointer-events-none absolute inset-0 border border-black/[0.06]" />
      </button>
      {showCreator && logo.kind === "logo" && creatorProfileHref(logo.creator) ? (
        <Link href={creatorProfileHref(logo.creator)! as Route} aria-label={`View ${logo.creator.name}'s profile`} className="focus-ring absolute bottom-[var(--archive-card-overlay-inset)] left-[var(--archive-card-overlay-inset)] z-20 rounded-full">
          <CreatorAvatar creator={logo.creator} role="feed" width={35} height={35} sizes="35px" className="size-[var(--archive-card-overlay-size)] shrink-0 rounded-full border border-[#e6e6e6] object-cover" />
        </Link>
      ) : null}
      <FeedSaveButton postId={logo.id} initiallySaved={initiallySaved} onSavedChange={onSavedChange} />
      </div>
    </article>
  );
}
