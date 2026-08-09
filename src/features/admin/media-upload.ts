import type { AdminMediaInput } from "./types";

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
export const RECOMMENDED_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_MEDIA_MIME_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const;

export type AcceptedMediaMimeType = (typeof ACCEPTED_MEDIA_MIME_TYPES)[number];
export type MediaUploadKind = "post-media" | "creator-avatar";

export function isAcceptedUploadForKind(
  kind: MediaUploadKind,
  contentType: AcceptedMediaMimeType,
) {
  return (
    kind === "post-media" ||
    (contentType.startsWith("image/") && contentType !== "image/gif")
  );
}

export function getMediaUploadLimit(contentType: AcceptedMediaMimeType) {
  return contentType.startsWith("video/")
    ? MAX_VIDEO_UPLOAD_BYTES
    : MAX_IMAGE_UPLOAD_BYTES;
}

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

function videoPosterUrl(url: string) {
  if (!url.includes("/video/upload/")) return undefined;

  return url
    .replace("/video/upload/", "/video/upload/so_0,f_jpg/")
    .replace(/\.[a-z0-9]+$/i, ".jpg");
}

export function parseCloudinaryUploadResponse(
  value: unknown,
  fileName: string,
): UploadedAdminMedia | null {
  if (!value || typeof value !== "object") return null;

  const response = value as Record<string, unknown>;
  if (response.resource_type !== "image" && response.resource_type !== "video") {
    return null;
  }
  if (typeof response.secure_url !== "string" || typeof response.public_id !== "string") {
    return null;
  }
  if (
    typeof response.width !== "number" ||
    typeof response.height !== "number" ||
    response.width <= 0 ||
    response.height <= 0
  ) {
    return null;
  }

  try {
    if (new URL(response.secure_url).hostname !== "res.cloudinary.com") return null;
  } catch {
    return null;
  }

  return {
    type: response.resource_type,
    url: response.secure_url,
    posterUrl:
      response.resource_type === "video" ? videoPosterUrl(response.secure_url) : undefined,
    storageProvider: "cloudinary",
    storageKey: response.public_id,
    alt: defaultAltText(fileName),
    width: response.width,
    height: response.height,
  };
}
