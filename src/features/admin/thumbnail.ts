import type { ImageVariant } from "@/storage/types";

export function adminThumbnailUrl(original: string, variants: ImageVariant[]) {
  const sorted = variants.filter((variant) => variant.width > 0 && variant.url).sort((a, b) => a.width - b.width);
  return sorted.find((variant) => variant.width >= 640)?.url ?? sorted[sorted.length - 1]?.url ?? original;
}
