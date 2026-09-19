export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_WEBSITE_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
export const RECOMMENDED_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_MEDIA_MIME_TYPES = [
  "image/avif", "image/gif", "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/webm",
] as const;

export type AcceptedMediaMimeType = (typeof ACCEPTED_MEDIA_MIME_TYPES)[number];
export type MediaUploadKind =
  | "post-media" | "logo-media" | "website-recording" | "website-poster"
  | "website-section" | "website-favicon" | "creator-avatar"
  | "sponsor-media" | "sponsor-icon";

export function isAcceptedUploadForKind(kind: MediaUploadKind, contentType: AcceptedMediaMimeType) {
  const staticImage = contentType.startsWith("image/") && contentType !== "image/gif";
  if (kind === "post-media" || kind === "sponsor-media") return true;
  if (kind === "website-recording") return contentType === "video/mp4" || contentType === "video/webm";
  return staticImage;
}

export function isAcceptedSubmissionUpload(
  kind: "design" | "logo", contentType: string,
): contentType is AcceptedMediaMimeType {
  if (!ACCEPTED_MEDIA_MIME_TYPES.some((item) => item === contentType)) return false;
  return isAcceptedUploadForKind(kind === "design" ? "post-media" : "logo-media", contentType as AcceptedMediaMimeType);
}

export function getMediaUploadLimit(contentType: AcceptedMediaMimeType, kind?: MediaUploadKind) {
  if (kind === "website-section" && contentType.startsWith("image/")) return MAX_WEBSITE_IMAGE_UPLOAD_BYTES;
  return contentType.startsWith("video/") ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
}
