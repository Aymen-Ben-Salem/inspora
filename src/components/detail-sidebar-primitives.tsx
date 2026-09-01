import type { ElementType } from "react";

import type { MediaStorageProvider } from "@/storage/types";
import { formatPostAddedTime } from "@/lib/post-added-time";

import { CreatorAvatar } from "./creator-avatar";

type DetailCreatorData = {
  avatarStorageProvider?: MediaStorageProvider;
  avatarUrl: string;
  name: string;
};

export const detailOriginalLinkClassName =
  "focus-ring inline-flex h-9 w-full items-center justify-center bg-[#262626] px-3 text-[14px] font-medium leading-normal tracking-[0.036px] text-white transition-colors hover:bg-black xl:h-[42px] xl:text-[16px] min-[1700px]:h-[43px] min-[1700px]:px-[14px] min-[1700px]:text-[18px]";

export const detailSecondaryActionClassName =
  "focus-ring inline-flex h-9 w-full items-center justify-center bg-[#d2d1d1] px-3 text-[14px] font-medium leading-normal tracking-[0.036px] text-black transition-colors hover:bg-[#c5c4c4] xl:h-[42px] xl:text-[16px] min-[1700px]:h-[43px] min-[1700px]:text-[18px]";

export function DetailCloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5 xl:size-[22px] min-[1800px]:size-6"
      fill="none"
    >
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function DetailArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 27 27"
      aria-hidden="true"
      className={`size-[22px] xl:size-6 min-[1800px]:size-[27px] ${direction === "right" ? "rotate-180" : ""}`}
      fill="none"
    >
      <path d="M22 13.5H5m0 0 7-7m-7 7 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DetailIntro({
  category,
  creator,
  description,
  headingAs = "h1",
  layout = "post",
  publishedAt,
  title,
  titleId,
}: {
  category: string;
  creator: DetailCreatorData;
  description: string;
  headingAs?: ElementType;
  layout?: "logo" | "post";
  publishedAt: string;
  title: string;
  titleId?: string;
}) {
  const Heading = headingAs;
  const addedLabel = formatPostAddedTime(publishedAt);
  const isLogoLayout = layout === "logo";

  return (
    <div className="flex flex-col items-start">
      <span className="inline-flex min-h-6 items-center bg-[#f0f0f0] px-2.5 py-1 text-[12px] tracking-[0.2px] text-[#7b7b7b] xl:min-h-[27px] xl:px-3 xl:py-1.5 xl:text-[13px] min-[1700px]:text-[14px]">
        {category}
      </span>

      <Heading
        id={titleId}
        className={`text-[18px] font-medium leading-normal tracking-[0.044px] text-black xl:text-[20px] min-[1700px]:text-[22px] ${
          isLogoLayout ? "mt-2.5" : "mt-2.5 xl:mt-3"
        }`}
      >
        {title}
      </Heading>

      <div
        className={`flex h-6 items-center gap-1.5 text-[13px] tracking-[0.032px] text-[rgba(88,88,88,0.8)] xl:h-7 xl:text-[14px] min-[1700px]:h-[30px] min-[1700px]:gap-[7px] min-[1700px]:text-[16px] ${
          isLogoLayout ? "mt-2.5" : "mt-3 xl:mt-3.5 min-[1700px]:mt-4"
        }`}
      >
        <CreatorAvatar
          creator={creator}
          role="dialog"
          width={25}
          height={25}
          sizes="25px"
          className="size-5 rounded-full object-cover xl:size-[22px] min-[1700px]:size-[25px]"
        />
        <span>{creator.name}</span>
      </div>

      <p
        className={`max-w-[429px] text-[14px] leading-[1.3] tracking-[0.036px] text-[#505050] xl:text-[16px] min-[1700px]:text-[18px] ${
          isLogoLayout ? "mt-5" : "mt-5 xl:mt-6"
        }`}
      >
        {description}
      </p>

      <div className={isLogoLayout ? "mt-5" : "mt-3.5 xl:mt-4"}>
        <time
          dateTime={publishedAt}
          aria-label={`Added to Inspora ${addedLabel}`}
          className="text-[13px] leading-normal tracking-[0.032px] text-[#95959d] xl:text-[14px] min-[1700px]:text-[16px]"
        >
          {addedLabel}
        </time>
      </div>
    </div>
  );
}

export function DetailMetadataRow({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  if (!values.length) return null;

  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-start gap-3 xl:grid-cols-[92px_minmax(0,1fr)] xl:gap-4 min-[1700px]:grid-cols-[112px_minmax(0,1fr)] min-[1700px]:gap-5">
      <p className="pt-1 text-[14px] tracking-[0.04px] text-[#262626] xl:text-[16px] min-[1700px]:text-[20px]">
        {label}
      </p>
      <div className="flex flex-wrap gap-2.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex min-h-7 items-center bg-[#e6e6e6] px-2 py-1.5 text-[11px] tracking-[0.024px] text-[#262626] xl:min-h-8 xl:px-2.5 xl:py-2 xl:text-[12px]"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
