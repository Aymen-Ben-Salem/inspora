import type { LogoMedia } from "@/domain/logo";

// Pasting an external URL could retain the editor's default 1080 x 659 size.
// This original JPEG was verified as 3840 x 4800 in the image-delivery audit.
// Keep this archive-only correction separate from legacy detail-dialog sizing;
// remove the entry when intrinsic dimensions have a reliable stored source.
const verifiedLegacyImages: Record<string, { url: string; width: number; height: number }> = {
  "028ac089-09c9-4127-b54a-852f3edc5278": {
    url: "https://mir-s3-cdn-cf.behance.net/project_modules/max_3840_webp/d5a6bc201268029.6671961f0ea17.jpg",
    width: 3840,
    height: 4800,
  },
};

export function getLogoCardImageDimensions(media: LogoMedia) {
  const verified = verifiedLegacyImages[media.id];
  if (verified?.url === media.url && !media.variants?.length) {
    return { width: verified.width, height: verified.height };
  }
  return { width: media.width, height: media.height };
}
