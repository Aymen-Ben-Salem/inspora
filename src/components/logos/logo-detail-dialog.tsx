"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { Logo } from "@/domain/logo";
import { getLogoAssetFileName } from "@/lib/logo-asset";

import { DetailMotion } from "../detail-motion";
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
            <div className="grid grid-cols-2 gap-3 xl:gap-3.5 min-[1700px]:gap-[15px]">
              <button
                type="button"
                onClick={() => void copyImage()}
                className={`${detailSecondaryActionClassName} detail-fit-action gap-2.5`}
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
                className={`${detailSecondaryActionClassName} detail-fit-action gap-2.5`}
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
        </DetailSidebarLayout>
      </main>
    </PostDialog>
  );
}
