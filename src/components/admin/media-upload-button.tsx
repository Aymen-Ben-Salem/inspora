"use client";

import { useRef, useState } from "react";

import type { MediaUploadKind, UploadedAdminMedia } from "@/features/admin/media-upload";
import type { MediaUploadOperations } from "@/features/media/prepare-upload";
import { defaultUploadOperations, prepareAndUploadMedia, type UploadStatus } from "@/features/media/prepare-and-upload";

function acceptedTypes(kind: MediaUploadKind) {
  if (kind === "website-recording") return "video/mp4,video/webm";
  if (
    kind === "creator-avatar" ||
    kind === "logo-media" ||
    kind === "website-section" ||
    kind === "website-favicon" ||
    kind === "website-poster"
  ) {
    return "image/avif,image/jpeg,image/png,image/webp";
  }
  return "image/avif,image/gif,image/jpeg,image/png,image/webp,video/mp4,video/webm";
}

export function MediaUploadButton<TResult = UploadedAdminMedia>({
  kind = "post-media",
  label = "Upload file",
  onUploaded,
  operations,
}: {
  kind?: MediaUploadKind;
  label?: string;
  onUploaded: (media: TResult) => void;
  operations?: MediaUploadOperations<TResult>;
}) {
  const activeOperations = (operations ?? defaultUploadOperations) as MediaUploadOperations<TResult>;
  const inputRef = useRef<HTMLInputElement>(null);
  const conversionControllerRef = useRef<AbortController>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState("");
  const isPending = status !== "idle";

  async function upload(file: File) {
    setError("");
    try {
      onUploaded(await prepareAndUploadMedia(file, kind, activeOperations, setStatus, (controller) => {
        conversionControllerRef.current = controller;
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be uploaded.");
    } finally {
      conversionControllerRef.current = null;
      setStatus("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <label className={`focus-within:ring-2 focus-within:ring-black focus-within:ring-offset-2 inline-flex h-9 cursor-pointer items-center rounded-full border border-black/10 bg-white px-3 text-xs font-medium transition-colors hover:bg-[#efefec] ${isPending ? "pointer-events-none opacity-60" : ""}`}>
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes(kind)}
          disabled={isPending}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {status === "loading-converter"
          ? "Loading converter..."
          : status === "analyzing-gif"
            ? "Analyzing GIF..."
            : status === "optimizing-animation"
              ? "Optimizing animation..."
              : status === "analyzing-video"
                ? "Analyzing video..."
                : status === "optimizing-video"
                  ? "Optimizing video..."
                  : status === "optimizing"
                    ? "Optimizing..."
                    : status === "analyzing"
                      ? "Analyzing..."
                      : status === "signing"
                        ? "Preparing..."
                        : status === "uploading"
                          ? "Uploading..."
                          : status === "verifying"
                            ? "Verifying..."
                            : label}
      </label>
      {status === "loading-converter" ||
      status === "analyzing-gif" ||
      status === "optimizing-animation" ||
      status === "analyzing-video" ||
      status === "optimizing-video" ? (
        <button
          type="button"
          className="text-xs text-[#777] underline-offset-4 hover:text-black hover:underline"
          onClick={() => conversionControllerRef.current?.abort()}
        >
          Cancel conversion
        </button>
      ) : null}
      {error ? <p role="alert" className="max-w-sm text-xs leading-relaxed text-red-700">{error}</p> : null}
    </div>
  );
}
