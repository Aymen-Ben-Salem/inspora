"use client";

import { useRef, useState } from "react";

import {
  completeMediaUploadAction,
  createMediaUploadSignatureAction,
  discardMediaUploadsAction,
  getMediaConverterConfigurationAction,
} from "@/features/admin/media-actions";
import {
  isOptimizableStaticImage,
  optimizeStaticImage,
} from "@/features/admin/image-optimization";
import {
  ACCEPTED_MEDIA_MIME_TYPES,
  getMediaUploadLimit,
  isAcceptedUploadForKind,
  readMediaDimensions,
  type MediaUploadKind,
  type UploadedAdminMedia,
} from "@/features/admin/media-upload";
import { createVideoPoster } from "@/features/admin/video-processing";
import { assertVideoPreviewDimensions } from "@/features/admin/video-preview-validation";
import {
  createAdminMediaUploadOperations,
  createPreparedMediaUploadBundle,
  type MediaUploadOperations,
  type PreparedMediaUpload,
} from "@/features/media/prepare-upload";

const defaultUploadOperations = createAdminMediaUploadOperations({
  sign: createMediaUploadSignatureAction,
  complete: completeMediaUploadAction,
  discard: discardMediaUploadsAction,
  converterConfiguration: getMediaConverterConfigurationAction,
});

type UploadStatus =
  | "idle"
  | "analyzing"
  | "optimizing"
  | "loading-converter"
  | "analyzing-gif"
  | "optimizing-animation"
  | "analyzing-video"
  | "optimizing-video"
  | "signing"
  | "uploading"
  | "verifying";

function uploadError(kind: MediaUploadKind) {
  if (kind === "creator-avatar") return "Creator avatars must be images up to 10 MB.";
  if (kind === "logo-media") return "Logo assets must be static images up to 10 MB.";
  if (kind === "website-recording") return "Website recordings must be MP4 or WebM videos up to 50 MB.";
  if (kind === "website-section") return "Website sections must be static images up to 25 MB.";
  if (kind === "website-favicon") return "Favicons must be supported static images up to 10 MB.";
  return "Images and GIFs can be up to 10 MB; MP4 and WebM videos up to 50 MB.";
}

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
    const contentType = ACCEPTED_MEDIA_MIME_TYPES.find((type) => type === file.type);
    if (
      !contentType ||
      !isAcceptedUploadForKind(kind, contentType) ||
      file.size > getMediaUploadLimit(contentType, kind)
    ) {
      setError(uploadError(kind));
      return;
    }

    try {
      let uploadItems: PreparedMediaUpload[];
      if (isOptimizableStaticImage(contentType)) {
        setStatus("optimizing");
        const images = await optimizeStaticImage(file, kind);
        uploadItems = images.map((image, index) => ({
          ...image,
          uploadKind: kind,
          role: index === images.length - 1 ? "primary" : "variant",
        }));
      } else if (contentType === "image/gif") {
        const controller = new AbortController();
        conversionControllerRef.current = controller;
        const configuration = await activeOperations.converterConfiguration();
        const { convertGifToMp4, createVideoPreview } = await import(
          "@/features/admin/gif-conversion"
        );
        const converted = await convertGifToMp4({
          file,
          configuration,
          signal: controller.signal,
          onStage: setStatus,
        });
        const originalDimensions = await readMediaDimensions(converted);
        const preview = await createVideoPreview({
          file: converted,
          configuration,
          signal: controller.signal,
          onStage: setStatus,
        });
        const poster = await createVideoPoster(preview);
        uploadItems = [
          { file: converted, ...originalDimensions, uploadKind: kind, role: "primary" },
          { file: preview, width: poster.videoWidth, height: poster.videoHeight, uploadKind: kind, role: "video-preview" },
          { file: poster.file, width: poster.width, height: poster.height, uploadKind: kind, role: "poster" },
        ];
      } else if (contentType.startsWith("video/")) {
        const controller = new AbortController();
        conversionControllerRef.current = controller;
        const configuration = await activeOperations.converterConfiguration();
        const { createVideoPreview } = await import(
          "@/features/admin/gif-conversion"
        );
        const originalDimensions = await readMediaDimensions(file);
        const preview = await createVideoPreview({
          file,
          configuration,
          signal: controller.signal,
          onStage: setStatus,
        });
        const poster = await createVideoPoster(preview);
        uploadItems = [
          { file, ...originalDimensions, uploadKind: kind, role: "primary" },
          { file: preview, width: poster.videoWidth, height: poster.videoHeight, uploadKind: kind, role: "video-preview" },
          {
            file: poster.file,
            width: poster.width,
            height: poster.height,
            uploadKind: kind === "website-recording" ? "website-poster" : kind,
            role: "poster",
          },
        ];
      } else {
        setStatus("analyzing");
        uploadItems = [
          { file, ...(await readMediaDimensions(file)), uploadKind: kind, role: "primary" },
        ];
      }

      const generatedPreview = uploadItems.find((item) => item.role === "video-preview");
      if (generatedPreview) assertVideoPreviewDimensions(generatedPreview);

      const bundle = createPreparedMediaUploadBundle({
        source: file,
        kind,
        outputs: uploadItems,
      });
      onUploaded(await activeOperations.upload(bundle, setStatus));
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
