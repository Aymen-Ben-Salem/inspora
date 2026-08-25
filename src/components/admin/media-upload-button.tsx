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
  type OptimizedImage,
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

type PreparedUpload = OptimizedImage & {
  role: "primary" | "variant" | "video-preview" | "poster";
};

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
  const conversionControllerRef = useRef<AbortController>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState("");
  const isPending = status !== "idle";

  async function upload(file: File) {
    setError("");
    let uploadedStorageKeys: string[] = [];

    const contentType = ACCEPTED_MEDIA_MIME_TYPES.find((type) => type === file.type);
    if (
      !contentType ||
      !isAcceptedUploadForKind(kind, contentType) ||
      file.size > getMediaUploadLimit(contentType)
    ) {
      setError(
        kind === "creator-avatar"
          ? "Creator avatars must be images up to 10 MB."
          : "Images and GIFs can be up to 10 MB; MP4 and WebM videos up to 50 MB.",
      );
      return;
    }

    try {
      let uploadItems: PreparedUpload[];
      if (isOptimizableStaticImage(contentType)) {
        setStatus("optimizing");
        const images = await optimizeStaticImage(file, kind);
        uploadItems = images.map((image, index) => ({
          ...image,
          role: index === images.length - 1 ? "primary" : "variant",
        }));
      } else if (contentType === "image/gif") {
        const controller = new AbortController();
        conversionControllerRef.current = controller;
        const configuration = await getMediaConverterConfigurationAction();
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
          { file: converted, ...originalDimensions, role: "primary" },
          {
            file: preview,
            width: poster.videoWidth,
            height: poster.videoHeight,
            role: "video-preview",
          },
          { file: poster.file, width: poster.width, height: poster.height, role: "poster" },
        ];
      } else if (contentType.startsWith("video/")) {
        const controller = new AbortController();
        conversionControllerRef.current = controller;
        const configuration = await getMediaConverterConfigurationAction();
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
          { file, ...originalDimensions, role: "primary" },
          {
            file: preview,
            width: poster.videoWidth,
            height: poster.videoHeight,
            role: "video-preview",
          },
          { file: poster.file, width: poster.width, height: poster.height, role: "poster" },
        ];
      } else {
        setStatus("analyzing");
        uploadItems = [{ file, ...(await readMediaDimensions(file)), role: "primary" }];
      }

      setStatus("signing");
      const signatures = await Promise.all(
        uploadItems.map((item) =>
          createMediaUploadSignatureAction({
            kind,
            fileName: item.file.name,
            contentType: item.file.type,
            size: item.file.size,
          }),
        ),
      );
      const rejectedSignature = signatures.find((signature) => !signature.ok);
      if (rejectedSignature && !rejectedSignature.ok) {
        throw new Error(rejectedSignature.message);
      }
      const prepared = signatures.filter(
        (signature): signature is Extract<typeof signature, { ok: true }> => signature.ok,
      );
      uploadedStorageKeys = prepared.map((signature) => signature.storageKey);

      setStatus("uploading");
      const responses = await Promise.all(
        prepared.map((signature, index) =>
          fetch(signature.uploadUrl, {
            method: signature.method,
            headers: signature.headers,
            body: uploadItems[index]?.file,
          }),
        ),
      );
      if (responses.some((response) => !response.ok)) {
        throw new Error("The storage service rejected the upload.");
      }

      setStatus("verifying");
      const completed = await Promise.all(
        prepared.map((signature, index) => {
          const item = uploadItems[index];
          return completeMediaUploadAction({
            kind,
            fileName: file.name,
            contentType: item?.file.type,
            size: item?.file.size,
            storageKey: signature.storageKey,
            width: item?.width,
            height: item?.height,
          });
        }),
      );
      const rejectedCompletion = completed.find((result) => !result.ok);
      if (rejectedCompletion && !rejectedCompletion.ok) {
        throw new Error(rejectedCompletion.message);
      }
      const uploaded = completed.filter(
        (result): result is Extract<typeof result, { ok: true }> => result.ok,
      );
      const primaryIndex = uploadItems.findIndex((item) => item.role === "primary");
      const primary = uploaded[primaryIndex]?.media;
      if (!primary) throw new Error("The optimized upload returned no media.");
      const posterIndex = uploadItems.findIndex((item) => item.role === "poster");
      const poster = posterIndex >= 0 ? uploaded[posterIndex]?.media : undefined;
      const videoPreviewIndex = uploadItems.findIndex(
        (item) => item.role === "video-preview",
      );
      const videoPreviewMedia =
        videoPreviewIndex >= 0 ? uploaded[videoPreviewIndex]?.media : undefined;

      onUploaded({
        ...primary,
        sourceMimeType: contentType,
        posterUrl: poster?.url,
        posterStorageKey: poster?.storageKey,
        videoPreview: videoPreviewMedia?.storageKey
          ? {
              url: videoPreviewMedia.url,
              storageKey: videoPreviewMedia.storageKey,
              width: videoPreviewMedia.width,
              height: videoPreviewMedia.height,
              bytes: videoPreviewMedia.sizeBytes!,
              format: "mp4",
            }
          : undefined,
        variants:
          isOptimizableStaticImage(contentType) && kind === "post-media"
            ? uploaded
                .filter((_, index) => uploadItems[index]?.role === "variant")
                .map(({ media }) => ({
                url: media.url,
                storageKey: media.storageKey!,
                width: media.width,
                height: media.height,
                bytes: media.sizeBytes!,
                format: "webp" as const,
                }))
            : [],
      });
      uploadedStorageKeys = [];
    } catch (cause) {
      if (uploadedStorageKeys.length) {
        await discardMediaUploadsAction({ kind, storageKeys: uploadedStorageKeys }).catch(
          () => undefined,
        );
      }
      setError(cause instanceof Error ? cause.message : "The file could not be uploaded.");
    } finally {
      conversionControllerRef.current = null;
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
              ? "image/avif,image/jpeg,image/png,image/webp"
              : "image/avif,image/gif,image/jpeg,image/png,image/webp,video/mp4,video/webm"
          }
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
      {error ? (
        <p role="alert" className="max-w-sm text-xs leading-relaxed text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
