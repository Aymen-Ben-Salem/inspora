const MIME_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

export function getLogoAssetFileName(slug: string, mimeType?: string) {
  const safeSlug = slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "logo";
  const extension = MIME_EXTENSIONS[mimeType?.split(";", 1)[0]?.toLowerCase() ?? ""] ?? "png";
  return `${safeSlug}.${extension}`;
}
export function getAttachmentDisposition(fileName: string) {
  const asciiName = fileName.replace(/[^a-z0-9._-]+/gi, "-");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
