import type { Logo } from "@/domain/logo";

import { ResponsiveR2Image } from "../responsive-r2-image";

export function LogoCard({
  logo,
  onSelect,
}: {
  logo: Logo;
  onSelect: (logo: Logo) => void;
}) {
  const isIcon = logo.kind === "icon";

  return (
    <button
      type="button"
      data-logo-card
      aria-label={`View ${logo.title} ${logo.kind}`}
      onClick={() => onSelect(logo)}
      className={`focus-ring group relative block w-full overflow-visible text-left ${
        isIcon ? "aspect-square" : "aspect-[1080/659]"
      }`}
    >
      <span
        className={`absolute inset-0 flex items-center justify-center overflow-hidden bg-[#f0f0ed] ${
          isIcon ? "rounded-[20%] p-[12%]" : "p-[9%]"
        }`}
      >
        <ResponsiveR2Image
          src={logo.media.url}
          alt={logo.media.alt}
          width={logo.media.width}
          height={logo.media.height}
          variants={logo.media.variants}
          sizes={
            isIcon
              ? "(min-width: 1500px) 155px, (min-width: 1024px) 12vw, 28vw"
              : "(min-width: 1120px) 25vw, (min-width: 760px) 33vw, 50vw"
          }
          className="max-h-full max-w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.025]"
        />
        <span className="pointer-events-none absolute inset-0 bg-black/[0.035] opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      {!isIcon ? (
        <span className="absolute bottom-[-3px] left-4 flex size-9 items-center justify-center overflow-hidden rounded-full border border-[#e6e6e6] bg-white p-1 shadow-[0_1px_5px_rgba(0,0,0,0.04)]">
          {/* Creator avatar domains are admin-managed and may be added before Next config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo.creator.avatarUrl}
            alt=""
            className="size-full rounded-full object-cover"
          />
        </span>
      ) : null}
    </button>
  );
}
