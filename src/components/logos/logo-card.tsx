import type { Logo } from "@/domain/logo";
import type { Route } from "next";
import Link from "next/link";

import { CreatorAvatar, creatorProfileHref } from "../creator-avatar";
import { FeedSaveButton } from "../feed-save-overlay";
import { ResponsiveR2Image } from "../responsive-r2-image";
import { getLogoCardImageDimensions } from "./logo-card-image-dimensions";

export function LogoCard({
  logo,
  onSelect,
  priority = false,
  initiallySaved = false,
  onSavedChange,
  showCreator = true,
  iconLayout = "plain",
}: {
  logo: Logo;
  onSelect: (logo: Logo) => void;
  priority?: boolean;
  initiallySaved?: boolean;
  onSavedChange?: (saved: boolean) => void;
  showCreator?: boolean;
  iconLayout?: "plain" | "square" | "profile";
}) {
  const isIcon = logo.kind === "icon";
  const isFramedIcon = isIcon && iconLayout !== "plain";
  const isProfileIcon = isIcon && iconLayout === "profile";
  const imageDimensions = getLogoCardImageDimensions(logo.media);

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
          isFramedIcon
            ? `${isProfileIcon ? "aspect-[1.64]" : "aspect-square"} bg-[#f3f3f3]`
            : `${isIcon ? "app-icon-artwork" : ""} bg-transparent`
        }`}
      >
        {isFramedIcon ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <ResponsiveR2Image
              data-feed-transition-media
              src={logo.media.url}
              alt={logo.media.alt}
              width={logo.media.width}
              height={logo.media.height}
              variants={logo.media.variants}
              priority={priority}
              sizes={isProfileIcon
                ? "(min-width: 1120px) 190px, (min-width: 760px) 16vw, (min-width: 460px) 24vw, 48vw"
                : "(min-width: 1120px) 175px, (min-width: 460px) 22vw, 44vw"}
              className={`app-icon-artwork ${isProfileIcon ? "w-[48%]" : "w-[44%]"} h-auto object-contain`}
            />
          </span>
        ) : (
          <ResponsiveR2Image
            data-feed-transition-media
            src={logo.media.url}
            alt={logo.media.alt}
            width={imageDimensions.width}
            height={imageDimensions.height}
            variants={logo.media.variants}
            priority={priority}
            sizes={isIcon
              ? "(min-width: 1500px) 14vw, (min-width: 1280px) 17vw, (min-width: 1024px) 20vw, (min-width: 640px) 25vw, 33vw"
              : "(min-width: 1120px) 395px, (min-width: 760px) 33vw, (min-width: 460px) 50vw, 100vw"}
            className={`${isIcon ? "app-icon-artwork " : ""}block h-auto w-full`}
          />
        )}
        {!isIcon || isFramedIcon ? (
          <span className="pointer-events-none absolute inset-0 border border-black/[0.06]" />
        ) : null}
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
