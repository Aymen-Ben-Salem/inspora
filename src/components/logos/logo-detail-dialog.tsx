"use client";

import { useEffect, useRef, useState } from "react";

import type { Logo } from "@/domain/logo";
import { formatPostAddedTime } from "@/lib/post-added-time";

import { NewsletterForm } from "../newsletter-form";
import { ResponsiveR2Image } from "../responsive-r2-image";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none">
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 27 27"
      aria-hidden="true"
      className={`size-6 ${direction === "right" ? "rotate-180" : ""}`}
      fill="none"
    >
      <path
        d="M22 13.5H5m0 0 7-7m-7 7 7 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MetadataRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-[#e6e6e6] pb-3 text-[#262626]">
      <p className="text-[16px] sm:text-[18px]">{label}</p>
      <div className="flex max-w-[65%] flex-wrap justify-end gap-x-2 gap-y-1 text-right text-[14px] sm:text-[15px]">
        {values.map((value) => (
          <span key={value}>{value}</span>
        ))}
      </div>
    </div>
  );
}

function fileExtension(logo: Logo) {
  const mimeType = logo.media.mimeType ?? "";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/avif") return "avif";
  return "webp";
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copyNoun = logo.kind === "icon" ? "icon" : "logo";

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrevious();
      if (event.key === "ArrowRight") onNext();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [onClose, onNext, onPrevious]);

  async function copyImage() {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image clipboard is unavailable.");
      }
      const response = await fetch(logo.media.url);
      if (!response.ok) throw new Error("The image could not be loaded.");
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || "image/png"]: blob }),
      ]);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  async function downloadImage() {
    const fileName = `${logo.slug}.${fileExtension(logo)}`;
    try {
      const response = await fetch(logo.media.url);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      const anchor = document.createElement("a");
      anchor.href = logo.media.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logo-dialog-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-white lg:overflow-hidden"
    >
      <div className="flex min-h-[100dvh] flex-col lg:h-[100dvh] lg:flex-row">
        <div className="relative flex min-h-[52dvh] flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-white to-[#d2d1d1] p-8 sm:p-14 lg:min-h-0 lg:p-[8vw]">
          <ResponsiveR2Image
            src={logo.media.url}
            alt={logo.media.alt}
            width={logo.media.width}
            height={logo.media.height}
            variants={logo.media.variants}
            sizes="(min-width: 1024px) 70vw, 100vw"
            priority
            className={`max-h-[75dvh] max-w-full object-contain ${
              logo.kind === "icon" ? "rounded-[19%]" : ""
            }`}
          />
        </div>

        <aside className="flex w-full flex-col border-t border-[#e6e6e6] bg-white lg:h-full lg:w-[clamp(380px,30vw,510px)] lg:shrink-0 lg:border-l lg:border-t-0">
          <div className="flex flex-1 flex-col px-5 py-5 sm:px-8 sm:py-6 lg:min-h-0">
            <nav className="flex h-10 items-center justify-between" aria-label="Logo navigation">
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close logo details"
                onClick={onClose}
                className="focus-ring flex size-10 items-center justify-center border border-[#e6e6e6] bg-[#e6e6e6] text-[#5d5d5d]"
              >
                <CloseIcon />
              </button>
              <div className="flex gap-4">
                <button
                  type="button"
                  aria-label="Previous logo"
                  onClick={onPrevious}
                  className="focus-ring flex size-10 items-center justify-center border border-[#e6e6e6] bg-[#e6e6e6] text-[#5d5d5d]"
                >
                  <ArrowIcon direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Next logo"
                  onClick={onNext}
                  className="focus-ring flex size-10 items-center justify-center border border-[#e6e6e6] bg-[#e6e6e6] text-[#5d5d5d]"
                >
                  <ArrowIcon direction="right" />
                </button>
              </div>
            </nav>

            <div className="flex flex-1 items-start pt-8 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
              <div className="w-full">
                <span className="inline-flex bg-[#f0f0f0] px-3 py-1.5 text-[14px] tracking-[0.2px] text-[#7b7b7b]">
                  {logo.industry}
                </span>
                <h2
                  id="logo-dialog-title"
                  className="mt-3 text-[22px] font-medium tracking-[0.044px] text-black"
                >
                  {logo.title}
                </h2>
                <div className="mt-3 flex items-center gap-2 text-[16px] text-[rgba(88,88,88,0.8)]">
                  {/* Creator avatar domains are admin-managed. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo.creator.avatarUrl}
                    alt=""
                    className="size-6 rounded-full object-cover"
                  />
                  <span>{logo.creator.name}</span>
                </div>
                <p className="mt-5 text-[16px] leading-[1.35] tracking-[0.036px] text-[#505050] sm:text-[18px]">
                  {logo.description}
                </p>
                <p className="mt-3 text-[14px] text-[#95959d]">
                  {formatPostAddedTime(logo.publishedAt)}
                </p>

                <div className="mt-8 grid gap-3">
                  <MetadataRow label="Type" values={[logo.shape]} />
                  <MetadataRow label="Industry" values={[logo.industry]} />
                  <MetadataRow label="Style" values={logo.styles} />
                  <MetadataRow label="Colours" values={logo.colors} />
                </div>

                <div className="mt-8 grid gap-3">
                  <a
                    href={logo.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring flex h-[43px] items-center justify-center bg-[#262626] px-4 text-[17px] font-medium text-white transition-colors hover:bg-black"
                  >
                    View original
                  </a>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => void copyImage()}
                      className="focus-ring h-[43px] bg-[#d2d1d1] px-3 text-[16px] font-medium text-black transition-colors hover:bg-[#c5c4c4]"
                    >
                      {copyState === "copied"
                        ? "Copied"
                        : copyState === "error"
                          ? "Copy unavailable"
                          : `Copy ${copyNoun}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadImage()}
                      className="focus-ring h-[43px] bg-[#d2d1d1] px-3 text-[16px] font-medium text-black transition-colors hover:bg-[#c5c4c4]"
                    >
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto flex flex-col items-center gap-2 pt-10 lg:pt-6">
              <NewsletterForm source="logo-detail" />
              <p className="text-center text-[12px] text-[#95959d]">
                <span className="text-[#505050]">Subscribe</span> to a weekly email
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
