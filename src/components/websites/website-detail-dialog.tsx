"use client";

import { useEffect } from "react";

import type { Website } from "@/domain/website";
import {
  DetailArrowIcon,
  DetailCloseIcon,
  DetailGlobeIcon,
  DetailIntro,
  DetailMetadataList,
  DetailSidebarLayout,
  DetailSidebarNavigation,
  detailOriginalLinkClassName,
} from "../detail-sidebar-primitives";
import { PostGallery } from "../post-gallery";
import { MediaAssetActions } from "../media-asset-actions";
import {
  PostCloseButton,
  postNavigationControlClassName,
} from "../post-close-button";
import { PostDialog } from "../post-dialog";
import { WorkAnalytics } from "../work-analytics";

export function WebsiteDetailDialog({
  website,
  onClose,
  onPrevious,
  onNext,
}: {
  website: Website;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const recordingAssetUrl = `/api/websites/${encodeURIComponent(website.id)}/asset`;
  const canonicalUrl =
    typeof window === "undefined"
      ? `/websites?website=${website.slug}`
      : new URL(`/websites?website=${website.slug}`, window.location.origin).href;

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
      ariaLabel="Website details"
      closeMode="custom"
      onClose={onClose}
      transitionKey={website.id}
    >
      <main
        key={website.id}
        data-post-dialog-post-id={website.id}
        data-post-dialog-post-pathname={`/websites?website=${website.slug}`}
        data-post-dialog-post-title={website.title}
        data-post-dialog-creator-name={website.creator.name}
        className="pointer-events-auto flex h-[100dvh] w-full max-w-full flex-col overflow-y-auto bg-transparent lg:flex-row lg:overflow-hidden"
      >
        <WorkAnalytics workId={website.id} workKind="website" />
        <PostGallery
          post={{ media: [{ ...website.recording, type: "video", position: 0 }] }}
          overlay
          mediaFit="contain"
        />

        <DetailSidebarLayout
          newsletterSource="website-detail"
          intro={
            <DetailIntro
              postId={website.id}
              title={website.title}
              titleId="website-dialog-title"
              headingAs="h2"
              creator={website.creator}
              description={website.description}
              publishedAt={website.publishedAt}
            />
          }
          actions={
            <div className="detail-fit-actions flex flex-col gap-3">
              <a
                href={website.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${detailOriginalLinkClassName} detail-fit-action`}
              >
                <DetailGlobeIcon />
                View Site
              </a>
              <MediaAssetActions
                assetKey={`${website.id}:recording`}
                assetUrl={recordingAssetUrl}
                copyText={canonicalUrl}
                copyLabel="Copy link"
                downloadLabel="Download video"
              />
            </div>
          }
          navigation={
            <DetailSidebarNavigation
              label="Website navigation"
              closeControl={
                <PostCloseButton
                  closeMode="custom"
                  label="Close website details"
                >
                  <DetailCloseIcon />
                </PostCloseButton>
              }
              previousControl={
                <button
                  type="button"
                  aria-label="Previous website"
                  onClick={onPrevious}
                  className={postNavigationControlClassName}
                >
                  <DetailArrowIcon direction="left" />
                </button>
              }
              nextControl={
                <button
                  type="button"
                  aria-label="Next website"
                  onClick={onNext}
                  className={postNavigationControlClassName}
                >
                  <DetailArrowIcon direction="right" />
                </button>
              }
            />
          }
        >
          <DetailMetadataList
            rows={[
              { label: "Categories", values: website.categories },
              { label: "Theme", values: website.themes },
              { label: "Colours", values: website.colors },
              { label: "Technologies", values: website.technologies },
            ]}
          />
        </DetailSidebarLayout>
      </main>
    </PostDialog>
  );
}
