"use client";

import Image from "next/image";
import { Fragment, useEffect, useState } from "react";

import type { Logo } from "@/domain/logo";
import { getLogoAssetFileName } from "@/lib/logo-asset";

import { DetailMotion } from "../detail-motion";
import {
  DetailArrowIcon,
  DetailCloseIcon,
  DetailIntro,
  detailOriginalLinkClassName,
  detailSecondaryActionClassName,
} from "../detail-sidebar-primitives";
import { NewsletterForm } from "../newsletter-form";
import {
  PostCloseButton,
  postNavigationControlClassName,
} from "../post-close-button";
import { PostDialog } from "../post-dialog";
import { ResponsiveR2Image } from "../responsive-r2-image";

async function toClipboardPng(blob: Blob) {
  if (blob.type === "image/png") return blob;

  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The image could not be prepared.");
    context.drawImage(image, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (png) =>
          png
            ? resolve(png)
            : reject(new Error("The image could not be copied.")),
        "image/png",
      );
    });
  } finally {
    image.close();
  }
}

function LogoMetadataList({
  rows,
}: {
  rows: Array<{ label: string; values: string[] }>;
}) {
  const visibleRows = rows.filter((row) => row.values.length > 0);

  return (
    <div className="logo-detail-metadata flex flex-col gap-3 xl:gap-3.5 min-[1700px]:gap-[15px]">
      {visibleRows.map((row, index) => (
        <Fragment key={row.label}>
          <div className="logo-detail-metadata-row flex items-start justify-between gap-6 text-[#262626]">
            <p className="logo-detail-metadata-label shrink-0 text-[14px] tracking-[0.04px] xl:text-[16px] min-[1700px]:text-[20px]">
              {row.label}
            </p>
            <div className="logo-detail-metadata-values flex min-w-0 flex-col items-end gap-2 text-right text-[14px] tracking-[0.04px] xl:text-[16px] min-[1700px]:gap-2.5 min-[1700px]:text-[20px] capitalize">
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
  const [copyStatus, setCopyStatus] = useState<{
    logoId: string;
    state: "copied" | "error";
  }>();
  const copyState = copyStatus?.logoId === logo.id ? copyStatus.state : "idle";
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

  async function copyImage() {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image clipboard is unavailable.");
      }
      const png = fetch(assetUrl).then(async (response) => {
        if (!response.ok) throw new Error("The image could not be loaded.");
        return toClipboardPng(await response.blob());
      });
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
      setCopyStatus({ logoId: logo.id, state: "copied" });
    } catch {
      setCopyStatus({ logoId: logo.id, state: "error" });
    }
  }

  function downloadImage() {
    const anchor = document.createElement("a");
    anchor.href = assetUrl;
    anchor.download = getLogoAssetFileName(logo.slug, logo.media.mimeType);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

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

        <aside
          data-post-dialog-surface
          data-post-dialog-sidebar
          className="logo-detail-sidebar flex min-h-fit w-full flex-none flex-col border-t border-[#e6e6e6] bg-white lg:h-full lg:min-h-0 lg:w-[clamp(360px,30vw,510px)] lg:shrink-0 lg:border-l lg:border-t-0"
        >
          <div className="logo-detail-sidebar-inner flex flex-1 flex-col px-5 py-5 sm:px-7 lg:min-h-0 lg:px-6 lg:py-5 xl:px-8 xl:py-6 min-[1700px]:px-10 min-[1700px]:py-7">
            <nav
              className="logo-detail-nav flex h-10 shrink-0 items-center justify-between"
              aria-label="Logo navigation"
            >
              <PostCloseButton
                className="logo-detail-nav-button"
                closeMode="custom"
                label="Close logo details"
              >
                <DetailCloseIcon />
              </PostCloseButton>
              <div className="flex items-center gap-3 xl:gap-4 min-[1700px]:gap-5">
                <button
                  type="button"
                  aria-label="Previous logo"
                  onClick={onPrevious}
                  className={`${postNavigationControlClassName} logo-detail-nav-button`}
                >
                  <DetailArrowIcon direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Next logo"
                  onClick={onNext}
                  className={`${postNavigationControlClassName} logo-detail-nav-button`}
                >
                  <DetailArrowIcon direction="right" />
                </button>
              </div>
            </nav>

            <div className="logo-detail-sidebar-content flex min-h-0 flex-1 items-start">
              <div className="logo-detail-groups flex w-full flex-col gap-6 xl:gap-8 min-[1700px]:gap-10">
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

                <LogoMetadataList
                  rows={[
                    { label: "Type", values: [logo.shape] },
                    { label: "Industry", values: [logo.industry] },
                    { label: "Style", values: logo.styles },
                    { label: "Colours", values: logo.colors },
                  ]}
                />

                <div className="logo-detail-actions flex flex-col gap-3">
                  <a
                    href={logo.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${detailOriginalLinkClassName} logo-detail-action`}
                  >
                    View original
                  </a>
                  <div className="grid grid-cols-2 gap-3 xl:gap-3.5 min-[1700px]:gap-[15px]">
                    <button
                      type="button"
                      onClick={() => void copyImage()}
                      className={`${detailSecondaryActionClassName} logo-detail-action gap-2.5`}
                    >
                      <Image
                        src="/icons/logos-copy.svg"
                        alt=""
                        aria-hidden="true"
                        className="size-5 shrink-0 xl:size-[22px] min-[1700px]:size-6"
                        width={24}
                        height={24}
                      />
                      {copyState === "copied"
                        ? "Copied"
                        : copyState === "error"
                          ? "Copy unavailable"
                          : `Copy ${copyNoun}`}
                    </button>
                    <button
                      type="button"
                      onClick={downloadImage}
                      className={`${detailSecondaryActionClassName} logo-detail-action gap-2.5`}
                    >
                      <Image
                        src="/icons/logos-download.svg"
                        alt=""
                        aria-hidden="true"
                        className="size-5 shrink-0 xl:size-[22px] min-[1700px]:size-6"
                        width={24}
                        height={24}
                      />
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="logo-detail-footer mt-auto flex shrink-0 flex-col items-center gap-2 pt-8 lg:pt-5 xl:pt-6 min-[1700px]:gap-2.5">
              <NewsletterForm source="logo-detail" />
              <p className="text-center text-[11px] leading-[1.3] tracking-[-0.024px] text-[#95959d] xl:text-[12px]">
                <span className="text-[#505050]">Subscribe</span> to a weekly
                email
              </p>
            </div>
          </div>
        </aside>
      </main>
    </PostDialog>
  );
}
