"use client";

import { adminUploadHttpRequests } from "./admin-upload-http";
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
import { constrainVideoCrop, type VideoCropSelection } from "../admin/video-crop";
import {
  createAdminMediaUploadOperations,
  createPreparedMediaUploadBundle,
  type MediaUploadOperations,
  type PreparedMediaUpload,
} from "./prepare-upload";

export const defaultUploadOperations = createAdminMediaUploadOperations(adminUploadHttpRequests);

export type UploadStatus =
  | "idle"
  | "analyzing"
  | "optimizing"
  | "loading-converter"
  | "analyzing-gif"
  | "optimizing-animation"
  | "analyzing-video"
  | "cropping-video"
  | "optimizing-video"
  | "signing"
  | "uploading"
  | "verifying";

function uploadError(kind: MediaUploadKind) {
  if (kind === "creator-avatar") return "Creator avatars must be images up to 10 MB.";
  if (kind === "logo-media") return "Logo assets must be static images up to 10 MB.";
  if (kind === "website-recording") return "Website recordings must be MP4 or WebM videos up to 50 MB.";
  if (kind === "website-favicon") return "Favicons must be supported static images up to 10 MB.";
  return "Images and GIFs can be up to 10 MB; MP4 and WebM videos up to 50 MB.";
}

export async function prepareAndUploadMedia<TResult = UploadedAdminMedia>(
  file: File,
  kind: MediaUploadKind,
  activeOperations: MediaUploadOperations<TResult> = defaultUploadOperations as MediaUploadOperations<TResult>,
  setStatus: (status: UploadStatus) => void = () => {},
  onController?: (controller: AbortController) => void,
  videoCrop?: VideoCropSelection,
): Promise<TResult> {
  const contentType = ACCEPTED_MEDIA_MIME_TYPES.find((type) => type === file.type);
  if (!contentType || !isAcceptedUploadForKind(kind, contentType) || file.size > getMediaUploadLimit(contentType)) {
    throw new Error(uploadError(kind));
  }
  if (videoCrop && kind !== "website-recording") throw new Error("Cropping is only available for website recordings.");
  const controller = new AbortController();
  const preparationSignal = controller.signal;
  onController?.(controller);
  preparationSignal.throwIfAborted();
  let uploadItems: PreparedMediaUpload[];
  if (isOptimizableStaticImage(contentType)) {
    setStatus("optimizing");
    const images = await optimizeStaticImage(file, kind, preparationSignal);
    uploadItems = images.map((image, index) => ({
      ...image,
      uploadKind: kind,
      role: index === images.length - 1 ? "primary" : "variant",
    }));
  } else if (contentType === "image/gif") {
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
    const originalDimensions = await readMediaDimensions(converted, preparationSignal);
    const preview = await createVideoPreview({
      file: converted,
      configuration,
      signal: controller.signal,
      onStage: setStatus,
    });
    const poster = await createVideoPoster(preview, preparationSignal);
    uploadItems = [
      { file: converted, ...originalDimensions, uploadKind: kind, role: "primary" },
      { file: preview, width: poster.videoWidth, height: poster.videoHeight, uploadKind: kind, role: "video-preview" },
      { file: poster.file, width: poster.width, height: poster.height, uploadKind: kind, role: "poster" },
    ];
  } else if (contentType.startsWith("video/")) {
    const configuration = await activeOperations.converterConfiguration();
    const { createVideoPreview, cropVideo } = await import(
      "../admin/gif-conversion"
    );
    // Reuse metadata from the source decoder already open in the crop editor.
    // The crop itself gives the exact output dimensions without another decoder.
    let originalDimensions = videoCrop?.sourceDimensions ?? await readMediaDimensions(file, preparationSignal);
    let primary = file;
    if (videoCrop) {
      const crop = constrainVideoCrop(videoCrop.crop, originalDimensions);
      primary = await cropVideo({ file, crop, configuration, signal: preparationSignal, onStage: setStatus });
      if (primary.size > getMediaUploadLimit("video/mp4")) throw new Error("The cropped recording exceeds 50 MB. Try a smaller recording.");
      if (primary.size > file.size) throw new Error("The cropped recording exceeds the original file size. No upload was made.");
      originalDimensions = { width: crop.width, height: crop.height };
    }
    const preview = await createVideoPreview({
      file: primary,
      configuration,
      signal: controller.signal,
      onStage: setStatus,
    });
    const poster = await createVideoPoster(preview, preparationSignal);
    uploadItems = [
      { file: primary, ...originalDimensions, uploadKind: kind, role: "primary" },
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
      { file, ...(await readMediaDimensions(file, preparationSignal)), uploadKind: kind, role: "primary" },
    ];
  }

  preparationSignal.throwIfAborted();
  const generatedPreview = uploadItems.find((item) => item.role === "video-preview");
  if (generatedPreview) assertVideoPreviewDimensions(generatedPreview);

  const bundle = createPreparedMediaUploadBundle({
    source: file,
    kind,
    outputs: uploadItems,
  });
  return activeOperations.upload(bundle, setStatus);
}
