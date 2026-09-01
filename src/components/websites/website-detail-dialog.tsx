"use client";

import { useEffect, useState } from "react";

import type { Website } from "@/domain/website";

import {
  DetailArrowIcon,
  DetailCloseIcon,
  DetailIntro,
  DetailMetadataList,
  DetailSidebarLayout,
  DetailSidebarNavigation,
  detailOriginalLinkClassName,
  detailSecondaryActionClassName,
} from "../detail-sidebar-primitives";
import { PostCloseButton, postNavigationControlClassName } from "../post-close-button";
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
  const hero = website.sections[0];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") onPrevious();
      if (event.key === "ArrowRight") onNext();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onNext, onPrevious]);

  return (
    <PostDialog ariaLabel="Website details" closeMode="custom" onClose={onClose} transitionKey={website.id}>
      <main
        key={website.id}
        data-post-dialog-post-id={website.id}
        data-post-dialog-post-pathname={`/websites?website=${website.slug}`}
        data-post-dialog-post-title={website.title}
        data-post-dialog-creator-name={website.creator.name}
        className="pointer-events-auto flex h-[100dvh] w-full max-w-full flex-col overflow-y-auto bg-transparent lg:flex-row lg:overflow-hidden"
      >
        <div data-post-dialog-gallery className="relative min-h-[68dvh] min-w-0 flex-1 overflow-y-auto bg-gradient-to-b from-white to-[#d2d1d1] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:h-[100dvh]">
          <nav className="sticky top-0 z-20 flex h-[72px] items-center gap-8 bg-white/94 px-5 text-[16px] backdrop-blur-sm sm:px-8 lg:h-[88px] lg:px-11 xl:text-[18px]" aria-label="Website media views">
            {(["preview", "sections"] as const).map((option) => (
              <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)} className={`focus-ring capitalize ${view === option ? "font-medium text-[#262626]" : "text-[#95959d]"}`}>{option}</button>
            ))}
          </nav>

          {view === "preview" ? (
            <div data-detail-media className="mx-auto w-full max-w-[1108px] px-4 pb-12 sm:px-8 lg:px-11">
              <div className="relative w-full" style={{ aspectRatio: `${website.fullPage.width} / ${website.fullPage.height}` }}>
                <div
                  data-post-dialog-surface
                  data-post-dialog-hero
                  data-post-dialog-max-viewport-height="72"
                  data-post-dialog-max-pixel-width={website.fullPage.width}
                  className="absolute inset-x-0 top-0 overflow-visible"
                  style={{ aspectRatio: `${website.fullPage.width} / ${hero?.height ?? Math.round(website.fullPage.width * 0.61)}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={website.fullPage.url} alt={website.fullPage.alt} width={website.fullPage.width} height={website.fullPage.height} className="h-auto w-full max-w-none" />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-7 gap-y-10 px-4 pb-12 sm:grid-cols-2 sm:px-8 lg:px-11">
              {website.sections.map((section, index) => (
                <figure key={section.id} data-detail-media>
                  <div
                    {...(index === 0 ? {
                      "data-post-dialog-surface": "",
                      "data-post-dialog-hero": "",
                      "data-post-dialog-max-viewport-height": "72",
                      "data-post-dialog-max-pixel-width": website.fullPage.width,
                    } : {})}
                  >
                    <WebsiteCropImage website={website} section={section} className="w-full" />
                  </div>
                  <figcaption className="mt-2.5 text-[17px] leading-normal tracking-[0.04px] text-[#262626] xl:text-[20px]">{section.label}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        <DetailSidebarLayout
          newsletterSource="website-detail"
          navigation={
            <DetailSidebarNavigation
              label="Website navigation"
              closeControl={<PostCloseButton closeMode="custom" label="Close website details"><DetailCloseIcon /></PostCloseButton>}
              previousControl={<button type="button" aria-label="Previous website" onClick={onPrevious} className={postNavigationControlClassName}><DetailArrowIcon direction="left" /></button>}
              nextControl={<button type="button" aria-label="Next website" onClick={onNext} className={postNavigationControlClassName}><DetailArrowIcon direction="right" /></button>}
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
          <DetailMetadataList rows={[
            { label: "Categories", values: website.categories },
            { label: "Theme", values: website.themes },
            { label: "Colours", values: website.colors },
          ]} />
          <div className="detail-fit-actions flex flex-col gap-3">
            <a href={website.sourceUrl} target="_blank" rel="noopener noreferrer" className={`${detailOriginalLinkClassName} detail-fit-action`}>View website</a>
            <a href={`/api/websites/${encodeURIComponent(website.id)}/asset`} download className={`${detailSecondaryActionClassName} detail-fit-action`}>Download screenshot</a>
          </div>
        </DetailSidebarLayout>
      </main>
    </PostDialog>
  );
}
