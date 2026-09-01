import { Fragment, type ElementType, type ReactNode } from "react";

import type { MediaStorageProvider } from "@/storage/types";

import { CreatorAvatar } from "./creator-avatar";
import { NewsletterForm } from "./newsletter-form";
import { RelativeAddedTime } from "./relative-added-time";

type DetailCreatorData = {
  avatarStorageProvider?: MediaStorageProvider;
  avatarUrl: string;
  name: string;
};

export const detailOriginalLinkClassName =
  "focus-ring inline-flex h-9 w-full items-center justify-center bg-[#262626] px-3 text-[14px] font-medium leading-normal tracking-[0.036px] text-white transition-colors hover:bg-black xl:h-[42px] xl:text-[16px] min-[1700px]:h-[43px] min-[1700px]:px-[14px] min-[1700px]:text-[18px]";

export const detailSecondaryActionClassName =
  "focus-ring inline-flex h-9 w-full items-center justify-center bg-[#d2d1d1] px-3 text-[14px] font-medium leading-normal tracking-[0.036px] text-black transition-colors hover:bg-[#c5c4c4] xl:h-[42px] xl:text-[16px] min-[1700px]:h-[43px] min-[1700px]:text-[18px]";

export function DetailSidebarLayout({
  children,
  mode = "overlay",
  navigation,
  newsletterSource,
}: {
  children: ReactNode;
  mode?: "overlay" | "page";
  navigation: ReactNode;
  newsletterSource: "logo-detail" | "post-detail" | "website-detail";
}) {
  const overlay = mode === "overlay";

  return (
    <aside
      data-post-dialog-surface={overlay ? "" : undefined}
      data-post-dialog-sidebar={overlay ? "" : undefined}
      className={`detail-fit-sidebar flex w-full flex-col border-t border-[#e6e6e6] bg-white lg:border-l lg:border-t-0 ${
        overlay
          ? "min-h-fit flex-none lg:h-full lg:min-h-0 lg:w-[clamp(360px,30vw,510px)] lg:shrink-0"
          : "order-first min-h-[100dvh] shrink-0 lg:order-last lg:h-[100dvh] lg:min-h-0 lg:w-[clamp(360px,30vw,510px)]"
      }`}
    >
      <div className="detail-fit-sidebar-inner flex flex-1 flex-col px-5 py-5 sm:px-7 lg:min-h-0 lg:px-6 lg:py-5 xl:px-8 xl:py-6 min-[1700px]:px-10 min-[1700px]:py-7">
        {navigation}

        <div className="detail-fit-sidebar-content flex min-h-0 flex-1 items-start pt-6 sm:pt-7">
          <div className="detail-fit-groups flex w-full flex-col gap-6 xl:gap-8 min-[1700px]:gap-10">
            {children}
          </div>
        </div>

        <div className="detail-fit-footer mt-auto flex shrink-0 flex-col items-center gap-2 pt-8 lg:pt-5 xl:pt-6 min-[1700px]:gap-2.5">
          <NewsletterForm source={newsletterSource} />
          <p className="text-center text-[11px] leading-[1.3] tracking-[-0.024px] text-[#95959d] xl:text-[12px]">
            <span className="text-[#505050]">Subscribe</span> to a weekly email
          </p>
        </div>
      </div>
    </aside>
  );
}

export function DetailSidebarNavigation({
  closeControl,
  label,
  nextControl,
  previousControl,
}: {
  closeControl: ReactNode;
  label: string;
  nextControl: ReactNode;
  previousControl: ReactNode;
}) {
  return (
    <nav
      className="detail-fit-nav flex h-10 shrink-0 items-center justify-between"
      aria-label={label}
    >
      {closeControl}
      <div className="flex items-center gap-3 xl:gap-4 min-[1700px]:gap-5">
        {previousControl}
        {nextControl}
      </div>
    </nav>
  );
}

export function DetailMetadataList({
  capitalizeValues = false,
  rows,
}: {
  capitalizeValues?: boolean;
  rows: Array<{ label: string; values: string[] }>;
}) {
  const visibleRows = rows.filter((row) => row.values.length > 0);

  return (
    <div className="detail-fit-metadata flex flex-col gap-3 xl:gap-3.5 min-[1700px]:gap-[15px]">
      {visibleRows.map((row, index) => (
        <Fragment key={row.label}>
          <div className="detail-fit-metadata-row flex items-start justify-between gap-6 text-[#262626]">
            <p className="detail-fit-metadata-label shrink-0 text-[14px] tracking-[0.04px] xl:text-[16px] min-[1700px]:text-[20px]">
              {row.label}
            </p>
            <div
              className={`detail-fit-metadata-values flex min-w-0 flex-col items-end gap-2 text-right text-[14px] tracking-[0.04px] xl:text-[16px] min-[1700px]:gap-2.5 min-[1700px]:text-[20px] ${
                capitalizeValues ? "capitalize" : ""
              }`}
            >
              {row.values.map((value) => (
                <span key={value}>{value}</span>
              ))}
            </div>
          </div>
          {index < visibleRows.length - 1 ? (
            <span
              aria-hidden="true"
              className="h-[0.75px] w-full bg-[#e6e6e6]"
            />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

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
  const isLogoLayout = layout === "logo";

  return (
    <div className="detail-intro flex flex-col items-start">
      <span className="detail-intro-category inline-flex min-h-6 items-center bg-[#f0f0f0] px-2.5 py-1 text-[12px] tracking-[0.2px] text-[#7b7b7b] xl:min-h-[27px] xl:px-3 xl:py-1.5 xl:text-[13px] min-[1700px]:text-[14px]">
        {category}
      </span>

      <Heading
        id={titleId}
        className={`detail-intro-title text-[18px] font-medium leading-normal tracking-[0.044px] text-black xl:text-[20px] min-[1700px]:text-[22px] ${
          isLogoLayout ? "mt-2.5" : "mt-2.5 xl:mt-3"
        }`}
      >
        {title}
      </Heading>

      <div
        className={`detail-intro-creator flex h-6 items-center gap-1.5 text-[13px] tracking-[0.032px] text-[rgba(88,88,88,0.8)] xl:h-7 xl:text-[14px] min-[1700px]:h-[30px] min-[1700px]:gap-[7px] min-[1700px]:text-[16px] ${
          isLogoLayout ? "mt-2.5" : "mt-3 xl:mt-3.5 min-[1700px]:mt-4"
        }`}
      >
        <CreatorAvatar
          creator={creator}
          role="dialog"
          width={25}
          height={25}
          sizes="25px"
          className="detail-intro-avatar size-5 rounded-full object-cover xl:size-[22px] min-[1700px]:size-[25px]"
        />
        <span>{creator.name}</span>
      </div>

      <p
        className={`detail-intro-description max-w-[429px] text-[14px] leading-[1.3] tracking-[0.036px] text-[#505050] xl:text-[16px] min-[1700px]:text-[18px] ${
          isLogoLayout ? "mt-5" : "mt-5 xl:mt-6"
        }`}
      >
        {description}
      </p>

      <div
        className={`detail-intro-time ${
          isLogoLayout ? "mt-5" : "mt-3.5 xl:mt-4"
        }`}
      >
        <RelativeAddedTime
          publishedAt={publishedAt}
          className="text-[13px] leading-normal tracking-[0.032px] text-[#95959d] xl:text-[14px] min-[1700px]:text-[16px]"
        />
      </div>
    </div>
  );
}
