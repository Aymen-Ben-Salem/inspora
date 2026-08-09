"use client";

import { useRef, useState } from "react";

import {
  completeMediaUploadAction,
  createMediaUploadSignatureAction,
} from "@/features/admin/media-actions";
import {
  ACCEPTED_MEDIA_MIME_TYPES,
  getMediaUploadLimit,
  isAcceptedUploadForKind,
  readMediaDimensions,
  type MediaUploadKind,
  type UploadedAdminMedia,
} from "@/features/admin/media-upload";

type UploadStatus = "idle" | "analyzing" | "signing" | "uploading" | "verifying";

export function MediaUploadButton({
  kind = "post-media",
  label = "Upload file",
  onUploaded,
}: {
  kind?: MediaUploadKind;
  label?: string;
  onUploaded: (media: UploadedAdminMedia) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState("");
  const isPending = status !== "idle";

  async function upload(file: File) {
    setError("");

    const contentType = ACCEPTED_MEDIA_MIME_TYPES.find((type) => type === file.type);
    if (
      !contentType ||
      !isAcceptedUploadForKind(kind, contentType) ||
      file.size > getMediaUploadLimit(contentType)
    ) {
      setError(
        kind === "creator-avatar"
          ? "Creator avatars must be images up to 10 MB."
          : "Images and GIFs can be up to 10 MB; videos up to 100 MB.",
      );
      return;
    }

    try {
      setStatus("analyzing");
      const dimensions = await readMediaDimensions(file);
      setStatus("signing");
      const signature = await createMediaUploadSignatureAction({
        kind,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });

      if (!signature.ok) throw new Error(signature.message);

      setStatus("uploading");
      const response = await fetch(signature.uploadUrl, {
        method: signature.method,
        headers: signature.headers,
        body: file,
      });

      if (!response.ok) {
        throw new Error("The storage service rejected the upload.");
      }

      setStatus("verifying");
      const completed = await completeMediaUploadAction({
        kind,
        fileName: file.name,
        contentType,
        size: file.size,
        storageKey: signature.storageKey,
        ...dimensions,
      });
      if (!completed.ok) throw new Error(completed.message);

      onUploaded(completed.media);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be uploaded.");
    } finally {
      setStatus("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <label
        className={`focus-within:ring-2 focus-within:ring-black focus-within:ring-offset-2 inline-flex h-9 cursor-pointer items-center rounded-full border border-black/10 bg-white px-3 text-xs font-medium transition-colors hover:bg-[#efefec] ${isPending ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={
            kind === "creator-avatar"
              ? "image/avif,image/gif,image/jpeg,image/png,image/webp"
              : "image/avif,image/gif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          }
          disabled={isPending}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        {status === "analyzing"
          ? "Analyzing..."
          : status === "signing"
          ? "Preparing..."
          : status === "uploading"
            ? "Uploading..."
            : status === "verifying"
              ? "Verifying..."
            : label}
      </label>
      {error ? (
        <p role="alert" className="max-w-sm text-xs leading-relaxed text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
