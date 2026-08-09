"use client";

import { useRef, useState } from "react";

import {
  completeMediaUploadAction,
  createMediaUploadSignatureAction,
  discardMediaUploadsAction,
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

type UploadStatus =
  | "idle"
  | "analyzing"
  | "optimizing"
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
          : "Images and GIFs can be up to 10 MB; videos up to 100 MB.",
      );
      return;
    }

    try {
      let uploadItems: OptimizedImage[];
      if (isOptimizableStaticImage(contentType)) {
        setStatus("optimizing");
        uploadItems = await optimizeStaticImage(file, kind);
      } else {
        setStatus("analyzing");
        uploadItems = [{ file, ...(await readMediaDimensions(file)) }];
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
      const primary = uploaded.at(-1)?.media;
      if (!primary) throw new Error("The optimized upload returned no media.");

      onUploaded({
        ...primary,
        variants:
          isOptimizableStaticImage(contentType) && kind === "post-media"
            ? uploaded.slice(0, -1).map(({ media }) => ({
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
        {status === "optimizing"
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
      {error ? (
        <p role="alert" className="max-w-sm text-xs leading-relaxed text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
