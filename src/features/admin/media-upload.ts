import type { AdminMediaInput } from "./types";
export {
  ACCEPTED_MEDIA_MIME_TYPES, getMediaUploadLimit, isAcceptedUploadForKind,
  MAX_IMAGE_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES, MAX_WEBSITE_IMAGE_UPLOAD_BYTES,
  RECOMMENDED_VIDEO_UPLOAD_BYTES,
} from "../media/upload-policy";
export type { AcceptedMediaMimeType, MediaUploadKind } from "../media/upload-policy";

export type MediaUploadSignatureResult =
  | {
      ok: true;
      provider: "r2";
      uploadUrl: string;
      method: "PUT";
      headers: Record<string, string>;
      storageKey: string;
    }
  | { ok: false; message: string };

export type MediaUploadCompletionResult =
  | { ok: true; media: UploadedAdminMedia }
  | { ok: false; message: string };

export type UploadedAdminMedia = Pick<
  AdminMediaInput,
  | "type"
  | "url"
  | "posterUrl"
  | "storageProvider"
  | "storageKey"
  | "alt"
  | "width"
  | "height"
  | "mimeType"
  | "sourceMimeType"
  | "sizeBytes"
  | "variants"
  | "videoPreview"
  | "posterStorageKey"
>;

export function defaultAltText(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

export async function readMediaDimensions(file: File) {
  const url = URL.createObjectURL(file);

  try {
    if (file.type.startsWith("video/")) {
      return await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () =>
          video.videoWidth > 0 && video.videoHeight > 0
            ? resolve({ width: video.videoWidth, height: video.videoHeight })
            : reject(new Error("The video dimensions could not be read."));
        video.onerror = () => reject(new Error("The browser could not decode this video."));
        video.src = url;
      });
    }

    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? resolve({ width: image.naturalWidth, height: image.naturalHeight })
          : reject(new Error("The image dimensions could not be read."));
      image.onerror = () => reject(new Error("The browser could not decode this image."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
