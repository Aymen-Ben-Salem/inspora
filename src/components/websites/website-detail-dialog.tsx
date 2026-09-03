"use client";

import { useEffect, useState } from "react";

import type { Website } from "@/domain/website";
import {
  cropWebsiteSectionToPng,
  getDefaultWebsiteSectionId,
  getWebsiteTransitionHero,
  getWebsiteSectionFileName,
  shouldClearWebsiteSectionSelection,
} from "@/lib/website-media-actions";

import {
  DetailArrowIcon,
  DetailCloseIcon,
  DetailIntro,
  DetailMetadataList,
  DetailSidebarLayout,
  DetailSidebarNavigation,
  detailOriginalLinkClassName,
} from "../detail-sidebar-primitives";
import { MediaAssetActions } from "../media-asset-actions";
import {
  PostCloseButton,
  postNavigationControlClassName,
} from "../post-close-button";
import { PostDialog } from "../post-dialog";
import { WebsiteCropImage } from "./website-crop-image";

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
  const [view, setView] = useState<"preview" | "sections">("preview");
  const [sectionSelection, setSectionSelection] = useState<{
    sectionId?: string;
    websiteId: string;
  }>({ websiteId: website.id });
  const hero = getWebsiteTransitionHero(website);
  const selectedSectionId =
    view === "sections"
      ? sectionSelection.websiteId === website.id
        ? sectionSelection.sectionId
        : getDefaultWebsiteSectionId(website.sections)
      : undefined;
  const selectedSection = website.sections.find(
    (section) => section.id === selectedSectionId,
  );
  const assetUrl = `/api/websites/${encodeURIComponent(website.id)}/asset`;

  function changeView(nextView: "preview" | "sections") {
    setView(nextView);
    setSectionSelection({
      websiteId: website.id,
      sectionId:
        nextView === "sections"
          ? getDefaultWebsiteSectionId(website.sections)
          : undefined,
    });
  }

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
        <div
          data-post-dialog-gallery
          data-post-dialog-surface
          className="relative min-h-[68dvh] min-w-0 flex-1 overflow-y-auto bg-gradient-to-b from-white to-[#d2d1d1] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:h-[100dvh]"
          onClick={(event) => {
            if (view !== "sections") return;

            const target = event.target;
            const clickedSection =
              target instanceof Element &&
              Boolean(target.closest("[data-website-section-select]"));
            const clickedMediaTab =
              target instanceof Element &&
              Boolean(target.closest("[data-website-media-tab]"));

            if (
              shouldClearWebsiteSectionSelection({
                clickedMediaTab,
                clickedSection,
              })
            ) {
              setSectionSelection({ websiteId: website.id });
            }
          }}
        >
          <nav
            className="sticky top-0 z-20 flex h-[72px] items-center gap-8 px-5 text-[16px] sm:px-8 lg:h-[88px] lg:px-11 xl:text-[18px]"
            aria-label="Website media views"
          >
            {(["preview", "sections"] as const).map((option) => (
              <button
                data-website-media-tab
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => changeView(option)}
                className={`focus-ring capitalize ${view === option ? "font-medium text-[#262626]" : "text-[#95959d]"}`}
              >
                {option}
              </button>
            ))}
          </nav>

          {view === "preview" ? (
            <div className="mx-auto w-full max-w-[1108px] px-4 pb-12 sm:px-8 lg:px-11">
              <div
                className="relative w-full"
                style={{
                  aspectRatio: `${website.fullPage.width} / ${website.fullPage.height}`,
                }}
              >
                <div data-detail-media className="absolute inset-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={website.fullPage.url}
                    alt={website.fullPage.alt}
                    width={website.fullPage.width}
                    height={website.fullPage.height}
                    className="h-auto w-full max-w-none"
                  />
                </div>
                <div
                  data-detail-media
                  className="pointer-events-none absolute inset-x-0 top-0"
                >
                  <div
                    data-post-dialog-surface
                    data-post-dialog-hero
                    data-post-dialog-match-feed-aspect
                    data-post-dialog-proxy-object-position="center top"
                    className="overflow-hidden"
                    style={{
                      aspectRatio: `${website.fullPage.width} / ${hero?.height ?? Math.round(website.fullPage.width * 0.61)}`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={website.fullPage.url}
                      alt=""
                      aria-hidden="true"
                      width={website.fullPage.width}
                      height={website.fullPage.height}
                      className="h-auto w-full max-w-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-7 gap-y-10 px-4 pb-12 sm:grid-cols-2 sm:px-8 lg:px-11">
              {website.sections.map((section, index) => {
                const selected = section.id === selectedSectionId;

                return (
                  <figure key={section.id} data-detail-media>
                    <button
                      data-website-section-select
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Select ${section.label} section`}
                      onClick={() =>
                        setSectionSelection({
                          websiteId: website.id,
                          sectionId: section.id,
                        })
                      }
                      className="focus-ring block w-full text-left"
                    >
                      <div
                        {...(index === 0
                          ? {
                              "data-post-dialog-surface": "",
                              "data-post-dialog-hero": "",
                              "data-post-dialog-match-feed-aspect": "",
                              "data-post-dialog-proxy-object-position":
                                "center top",
                            }
                          : {})}
                        className={`transition-shadow ${selected ? "ring-2 ring-[#262626] ring-offset-4" : ""}`}
                      >
                        <WebsiteCropImage
                          website={website}
                          section={section}
                          className="w-full"
                        />
                      </div>
                      <figcaption
                        className={`mt-2.5 text-[17px] leading-normal tracking-[0.04px] text-[#262626] xl:text-[20px] ${selected ? "font-medium" : ""}`}
                      >
                        {section.label}
                      </figcaption>
                    </button>
                  </figure>
                );
              })}
            </div>
          )}
        </div>

        <DetailSidebarLayout
          newsletterSource="website-detail"
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
          <DetailIntro
            category={website.categories[0] ?? "Website"}
            title={website.title}
            titleId="website-dialog-title"
            headingAs="h2"
            creator={website.creator}
            description={website.description}
            layout="logo"
            publishedAt={website.publishedAt}
          />
          <DetailMetadataList
            rows={[
              { label: "Categories", values: website.categories },
              { label: "Theme", values: website.themes },
              { label: "Colours", values: website.colors },
            ]}
          />
          <div className="detail-fit-actions flex flex-col gap-3">
            <a
              href={website.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${detailOriginalLinkClassName} detail-fit-action`}
            >
              View website
            </a>
            <MediaAssetActions
              assetKey={
                view === "preview"
                  ? `${website.id}:preview`
                  : `${website.id}:section:${selectedSection?.id ?? "none"}`
              }
              assetUrl={
                view === "preview" || selectedSection ? assetUrl : undefined
              }
              copyLabel={view === "preview" ? "Copy website" : "Copy section"}
              downloadFileName={
                selectedSection
                  ? getWebsiteSectionFileName(
                      website.slug,
                      selectedSection.label,
                    )
                  : undefined
              }
              transformAsset={
                view === "sections" && selectedSection
                  ? (blob) =>
                      cropWebsiteSectionToPng(
                        blob,
                        website.fullPage.height,
                        selectedSection,
                      )
                  : undefined
              }
            />
          </div>
        </DetailSidebarLayout>
      </main>
    </PostDialog>
  );
}
