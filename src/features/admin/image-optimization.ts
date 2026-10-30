import type { MediaUploadKind } from "./media-upload";
import { assertCreatorAvatarDimensions, MAX_CREATOR_AVATAR_SIZE } from "../creators/avatar-policy";

export const RESPONSIVE_IMAGE_WIDTHS = [640, 960, 1600, 2560] as const;
export const WEBP_QUALITY = 0.84;

export type OptimizedImage = {
  file: File;
  width: number;
  height: number;
};

export function getOptimizedImageWidths(sourceWidth: number, kind: MediaUploadKind) {
  const isSmallAsset =
    kind === "creator-avatar" ||
    kind === "sponsor-icon" ||
    kind === "website-favicon";
  const maximumWidth = kind === "creator-avatar" ? MAX_CREATOR_AVATAR_SIZE : isSmallAsset ? 256 : 2560;
  const outputWidth = Math.min(sourceWidth, maximumWidth);
  if (isSmallAsset) return [outputWidth];

  const widths = RESPONSIVE_IMAGE_WIDTHS.filter((width) => width < outputWidth);
  return [...widths, outputWidth];
}

function outputFileName(fileName: string, width: number) {
  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-");
  return `${baseName || "image"}-${width}w.webp`;
}

async function canvasToWebp(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY);
  });
  if (blob?.type === "image/webp") return blob;

  // Safari can decode WebP but export PNG from canvas. Encode the RGBA pixels
  // instead so responsive variants keep their WebP format and transparency.
  const { default: encode } = await import("@jsquash/webp/encode.js");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const bytes = await encode(pixels, { quality: WEBP_QUALITY * 100 });
  return new Blob([bytes], { type: "image/webp" });
}

export async function optimizeStaticImage(file: File, kind: MediaUploadKind, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("The browser could not decode this image for optimization.");
  }

  try {
    const avatar = kind === "creator-avatar";
    if (avatar) assertCreatorAvatarDimensions(bitmap.width, bitmap.height);
    const sourceSize = Math.min(bitmap.width, bitmap.height);
    const widths = getOptimizedImageWidths(avatar ? sourceSize : bitmap.width, kind);
    const outputs: OptimizedImage[] = [];
    for (const width of widths) {
      signal?.throwIfAborted();
      const height = avatar ? width : Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      try {
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("The image optimizer could not start.");

        if (avatar) context.drawImage(bitmap, (bitmap.width - sourceSize) / 2, (bitmap.height - sourceSize) / 2, sourceSize, sourceSize, 0, 0, width, height);
        else context.drawImage(bitmap, 0, 0, width, height);
        const blob = await canvasToWebp(canvas, context);
        signal?.throwIfAborted();
        outputs.push({
          file: new File([blob], outputFileName(file.name, width), {
            type: "image/webp",
          }),
          width,
          height,
        });
      } finally {
        // Releasing the backing store matters for tall website screenshots.
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return outputs;
  } finally {
    bitmap.close();
  }
}

export function isOptimizableStaticImage(contentType: string) {
  return ["image/avif", "image/jpeg", "image/png", "image/webp"].includes(
    contentType,
  );
}
