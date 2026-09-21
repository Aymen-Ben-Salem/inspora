import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { Fragment, type ElementType, type ReactNode } from "react";

import type { MediaStorageProvider } from "@/storage/types";

import { CreatorAvatar, creatorProfileHref } from "./creator-avatar";
import { FeedSaveButton } from "./feed-save-overlay";
import { NewsletterForm } from "./newsletter-form";
import { RelativeAddedTime } from "./relative-added-time";

type DetailCreatorData = {
  avatarStorageProvider?: MediaStorageProvider;
  avatarUrl: string;
  name: string;
  username?: string;
};

export const detailOriginalLinkClassName =
  "focus-ring inline-flex h-9 w-full items-center justify-center gap-2 bg-[#262626] px-3 text-[14px] font-medium leading-normal tracking-[0.028px] text-white transition-opacity hover:opacity-90";

export const detailSecondaryActionClassName =
  "focus-ring inline-flex h-9 w-full items-center justify-center bg-[#f0f0f0] px-3 text-[14px] font-medium leading-normal tracking-[0.028px] text-[#767676] transition-colors hover:text-[#262626]";

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
      className={`detail-fit-sidebar flex w-full flex-col bg-white lg:overflow-y-auto ${
        overlay
          ? "min-h-fit flex-none lg:h-full lg:min-h-0 lg:w-[min(29.583333vw,426px)] lg:shrink-0"
          : "order-first min-h-[100dvh] shrink-0 lg:order-last lg:h-[100dvh] lg:min-h-0 lg:w-[min(29.583333vw,426px)]"
      }`}
    >
      <div className="detail-fit-sidebar-inner flex flex-1 flex-col px-5 py-5 sm:px-7 lg:min-h-full">
        {navigation}

        <div className="detail-fit-sidebar-content flex min-h-0 flex-1 items-start pt-6 sm:pt-7">
          <div className="detail-fit-groups flex w-full flex-col gap-6">
            {children}
          </div>
        </div>

        <div className="detail-fit-footer mt-auto flex shrink-0 flex-col items-center gap-2 pt-8">
          <NewsletterForm source={newsletterSource} />
          <p className="text-center text-[11px] leading-[1.3] tracking-[-0.02px] text-[#767676]">
            Subscribe to a weekly email
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
      <div className="detail-fit-nav-controls flex items-center gap-3">
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
  rows: Array<{ label: string; values: ReactNode[] }>;
}) {
  const visibleRows = rows.filter((row) => row.values.length > 0);

  return (
    <div className="detail-fit-metadata flex flex-col gap-3">
      {visibleRows.map((row, index) => (
        <Fragment key={row.label}>
          <div className="detail-fit-metadata-row flex items-start justify-between gap-6 text-[#262626]">
            <p className="detail-fit-metadata-label shrink-0 text-[14px] tracking-[0.028px] text-[#767676]">
              {row.label}
            </p>
            <div
              className={`detail-fit-metadata-values flex min-w-0 flex-col items-end gap-2 text-right text-[14px] tracking-[0.028px] ${
                capitalizeValues ? "capitalize" : ""
              }`}
            >
              {row.values.map((value, valueIndex) => (
                <span key={`${row.label}-${valueIndex}`}>{value}</span>
              ))}
            </div>
          </div>
          {index < visibleRows.length - 1 ? (
            <span
              aria-hidden="true"
              className="detail-fit-metadata-divider h-px w-full bg-[#f0f0f0]"
            />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

export function DetailCloseIcon() {
  return (
    <Image
      src="/icons/detail/close.svg"
      alt=""
      aria-hidden="true"
      className="detail-close-icon size-5"
      width={20}
      height={20}
    />
  );
}

export function DetailArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <Image
      src={`/icons/detail/arrow-${direction}.svg`}
      alt=""
      aria-hidden="true"
      className={`detail-arrow-icon size-[22px] ${direction === "right" ? "rotate-180" : ""}`}
      width={23}
      height={23}
    />
  );
}

export function DetailGlobeIcon() {
  return (
    <Image
      src="/icons/detail/globe.svg"
      alt=""
      aria-hidden="true"
      className="detail-primary-action-icon size-4 shrink-0"
      width={17}
      height={17}
    />
  );
}

export function DetailIntro({
  postId,
  creator,
  description,
  headingAs = "h1",
  publishedAt,
  title,
  titleId,
}: {
  postId: string;
  creator: DetailCreatorData;
  description: string;
  headingAs?: ElementType;
  publishedAt: string;
  title: string;
  titleId?: string;
}) {
  const Heading = headingAs;

  return (
    <div className="detail-intro flex flex-col items-start gap-4">
      <div className="detail-intro-heading-row flex w-full items-center justify-between gap-4">
        <div className="detail-intro-heading flex min-w-0 flex-col items-start gap-1">
          <Heading
            id={titleId}
            className="detail-intro-title text-[18px] font-medium leading-normal tracking-[0.036px] text-[#262626]"
          >
            {title}
          </Heading>

          {creatorProfileHref(creator) ? <Link href={creatorProfileHref(creator)! as Route} className="detail-intro-creator focus-ring flex h-6 items-center gap-2 text-[13px] tracking-[0.028px] text-[#767676] transition-colors hover:text-[#262626]">
            <CreatorAvatar
              creator={creator}
              role="dialog"
              width={22}
              height={22}
              sizes="22px"
              className="detail-intro-avatar size-5 rounded-full object-cover"
            />
            <span>{creator.name}</span>
          </Link> : <div className="detail-intro-creator flex h-6 items-center gap-2 text-[13px] tracking-[0.028px] text-[#767676]"><CreatorAvatar creator={creator} role="dialog" width={22} height={22} sizes="22px" className="detail-intro-avatar size-5 rounded-full object-cover" /><span>{creator.name}</span></div>}
        </div>
        <FeedSaveButton postId={postId} variant="detail" />
      </div>

      <p className="detail-intro-description max-w-[429px] text-[14px] leading-[1.3] tracking-[0.028px] text-[#262626]">
        {description}
      </p>

      <div className="detail-intro-time">
        <RelativeAddedTime
          publishedAt={publishedAt}
          className="text-[12px] leading-normal tracking-[0.024px] text-[#767676]"
        />
      </div>
    </div>
  );
}
