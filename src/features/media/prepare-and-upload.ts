"use client";

import {
  completeMediaUploadAction,
  createMediaUploadSignatureAction,
  discardMediaUploadsAction,
  getMediaConverterConfigurationAction,
} from "../admin/media-actions";
import {
  isOptimizableStaticImage,
  optimizeStaticImage,
} from "../admin/image-optimization";
import {
  ACCEPTED_MEDIA_MIME_TYPES,
  getMediaUploadLimit,
  isAcceptedUploadForKind,
  readMediaDimensions,
  type MediaUploadKind,
  type UploadedAdminMedia,
} from "../admin/media-upload";
import { createVideoPoster } from "../admin/video-processing";
import { assertVideoPreviewDimensions } from "../admin/video-preview-validation";
import {
  createAdminMediaUploadOperations,
  createPreparedMediaUploadBundle,
  type MediaUploadOperations,
  type PreparedMediaUpload,
} from "./prepare-upload";

export const defaultUploadOperations = createAdminMediaUploadOperations({
  sign: createMediaUploadSignatureAction,
  complete: completeMediaUploadAction,
  discard: discardMediaUploadsAction,
  converterConfiguration: getMediaConverterConfigurationAction,
});

export type UploadStatus =
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

export async function prepareAndUploadMedia<TResult = UploadedAdminMedia>(
  file: File,
  kind: MediaUploadKind,
  activeOperations: MediaUploadOperations<TResult> = defaultUploadOperations as MediaUploadOperations<TResult>,
  setStatus: (status: UploadStatus) => void = () => {},
  onController?: (controller: AbortController) => void,
): Promise<TResult> {
  const contentType = ACCEPTED_MEDIA_MIME_TYPES.find((type) => type === file.type);
  if (!contentType || !isAcceptedUploadForKind(kind, contentType) || file.size > getMediaUploadLimit(contentType, kind)) {
    throw new Error(uploadError(kind));
  }
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
    onController?.(controller);
    const configuration = await activeOperations.converterConfiguration();
    const { convertGifToMp4, createVideoPreview } = await import(
      "../admin/gif-conversion"
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
    onController?.(controller);
    const configuration = await activeOperations.converterConfiguration();
    const { createVideoPreview } = await import(
      "../admin/gif-conversion"
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
  return activeOperations.upload(bundle, setStatus);
}
