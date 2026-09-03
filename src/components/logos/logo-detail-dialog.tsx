"use client";

import { useEffect } from "react";

import type { Logo } from "@/domain/logo";
import { getLogoAssetFileName } from "@/lib/logo-asset";

import { DetailMotion } from "../detail-motion";
import { MediaAssetActions } from "../media-asset-actions";
import {
  DetailArrowIcon,
  DetailCloseIcon,
  DetailIntro,
  DetailMetadataList,
  DetailSidebarLayout,
  DetailSidebarNavigation,
  detailOriginalLinkClassName,
} from "../detail-sidebar-primitives";
import {
  PostCloseButton,
  postNavigationControlClassName,
} from "../post-close-button";
import { PostDialog } from "../post-dialog";
import { ResponsiveR2Image } from "../responsive-r2-image";

export function LogoDetailDialog({
  logo,
  onClose,
  onPrevious,
  onNext,
}: {
  logo: Logo;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const copyNoun = logo.kind === "icon" ? "icon" : "logo";
  const assetUrl = `/api/logos/${encodeURIComponent(logo.id)}/asset`;
  const isPortrait = logo.media.height / logo.media.width >= 1.15;
  const maxViewportHeight = isPortrait ? 85 : 72;
  const maxViewportWidth =
    maxViewportHeight * (logo.media.width / logo.media.height);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") onPrevious();
      if (event.key === "ArrowRight") onNext();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onNext, onPrevious]);

  return (
    <PostDialog
      ariaLabel="Logo details"
      closeMode="custom"
      onClose={onClose}
      transitionKey={logo.id}
    >
      <main
        key={logo.id}
        data-post-dialog-post-id={logo.id}
        data-post-dialog-post-pathname={`/logos?logo=${logo.slug}`}
        data-post-dialog-post-title={logo.title}
        data-post-dialog-creator-name={logo.creator.name}
        className="pointer-events-auto flex h-[100dvh] w-full max-w-full flex-col overflow-y-auto bg-transparent lg:flex-row lg:overflow-hidden"
      >
        <DetailMotion overlay>
          <figure
            data-detail-media
            className="flex min-w-full snap-center items-center justify-center h-auto px-4 py-6 sm:px-8 sm:py-8 md:px-10 md:py-10 lg:h-full lg:py-0"
          >
            <div
              data-post-dialog-surface
              data-post-dialog-hero
              data-post-dialog-transparent-media
              data-post-dialog-max-viewport-height={maxViewportHeight}
              data-post-dialog-max-pixel-width={logo.media.width}
              className="relative shrink-0 overflow-hidden bg-transparent"
              style={{
                aspectRatio: `${logo.media.width} / ${logo.media.height}`,
                width: `min(100%, ${maxViewportWidth}dvh, ${logo.media.width}px)`,
              }}
            >
              <ResponsiveR2Image
                src={logo.media.url}
                alt={logo.media.alt}
                width={logo.media.width}
                height={logo.media.height}
                variants={logo.media.variants}
                sizes={`(min-width: 1024px) min(48vw, ${logo.media.width}px), min(90vw, ${logo.media.width}px)`}
                priority
                className="size-full object-contain"
              />
            </div>
          </figure>
        </DetailMotion>

        <DetailSidebarLayout
          newsletterSource="logo-detail"
          navigation={
            <DetailSidebarNavigation
              label="Logo navigation"
              closeControl={
                <PostCloseButton
                  closeMode="custom"
                  label="Close logo details"
                >
                  <DetailCloseIcon />
                </PostCloseButton>
              }
              previousControl={
                <button
                  type="button"
                  aria-label="Previous logo"
                  onClick={onPrevious}
                  className={postNavigationControlClassName}
                >
                  <DetailArrowIcon direction="left" />
                </button>
              }
              nextControl={
                <button
                  type="button"
                  aria-label="Next logo"
                  onClick={onNext}
                  className={postNavigationControlClassName}
                >
                  <DetailArrowIcon direction="right" />
                </button>
              }
            />
          }
        >
          <DetailIntro
            category={logo.industry}
            title={logo.title}
            titleId="logo-dialog-title"
            headingAs="h2"
            creator={logo.creator}
            description={logo.description}
            layout="logo"
            publishedAt={logo.publishedAt}
          />

          <DetailMetadataList
            capitalizeValues
            rows={[
              { label: "Type", values: [logo.shape] },
              { label: "Industry", values: [logo.industry] },
              { label: "Style", values: logo.styles },
              { label: "Colours", values: logo.colors },
            ]}
          />

          <div className="detail-fit-actions flex flex-col gap-3">
            <a
              href={logo.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${detailOriginalLinkClassName} detail-fit-action`}
            >
              View original
            </a>
            <MediaAssetActions
              assetKey={logo.id}
              assetUrl={assetUrl}
              copyLabel={`Copy ${copyNoun}`}
              downloadFileName={getLogoAssetFileName(
                logo.slug,
                logo.media.mimeType,
              )}
            />
          </div>
        </DetailSidebarLayout>
      </main>
    </PostDialog>
  );
}
