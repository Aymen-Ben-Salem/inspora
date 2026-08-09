"use client";

import { useState } from "react";

import type { MediaType } from "@/domain/post";

type AdminMediaPreviewProps = {
  type: MediaType;
  url: string;
  posterUrl?: string;
  alt?: string;
  controls?: boolean;
  className?: string;
  maxDisplayWidth?: number;
};

function EmptyPreview({ isError }: { isError: boolean }) {
  return (
    <div className="flex size-full min-h-44 flex-col items-center justify-center gap-3 bg-[#ececea] px-6 text-center text-[#777]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none">
        <path
          d="M4.75 5.75h14.5v12.5H4.75zM5 16l4.1-4.25 3.05 3 2.15-2.15L19 17.25M15.75 9h.01"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="max-w-48 text-xs leading-relaxed">
        {isError ? "Preview unavailable. Check the media URL." : "Add a media URL to see its preview."}
      </span>
    </div>
  );
}

export function AdminMediaPreview({
  type,
  url,
  posterUrl,
  alt = "",
  controls = false,
  className = "",
  maxDisplayWidth,
}: AdminMediaPreviewProps) {
  const [failedSource, setFailedSource] = useState<string>();
  const source = type === "video" ? (posterUrl || url) : url;
  const hasError = Boolean(source && failedSource === source);

  return (
    <div
      className={`relative overflow-hidden bg-[#ececea] ${
        maxDisplayWidth ? "flex items-center justify-center" : ""
      } ${className}`}
    >
      {!url || hasError ? (
        <EmptyPreview isError={hasError} />
      ) : type === "video" ? (
        <video
          src={url}
          poster={posterUrl || undefined}
          controls={controls}
          muted
          playsInline
          preload="metadata"
          aria-label={alt || "Post video preview"}
          onError={() => setFailedSource(source)}
          style={
            maxDisplayWidth
              ? { width: `min(100%, ${maxDisplayWidth}px)`, height: "auto", maxHeight: "100%" }
              : undefined
          }
          className={`${
            maxDisplayWidth
              ? "object-contain"
              : "size-full object-cover group-hover:scale-[1.035]"
          } transition-transform duration-700 ease-out`}
        />
      ) : (
        // Admins can preview a newly entered origin before it is added to Next.js image config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSource(source)}
          className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]"
        />
      )}
      {type === "video" && url && !hasError ? (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white backdrop-blur-sm">
          Video
        </span>
      ) : null}
    </div>
  );
}
