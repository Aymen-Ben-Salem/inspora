import type { MediaUploadKind } from "./media-upload";

export const RESPONSIVE_IMAGE_WIDTHS = [640, 960, 1600, 2560] as const;
export const WEBP_QUALITY = 0.84;

export type OptimizedImage = {
  file: File;
  width: number;
  height: number;
};

export function getOptimizedImageWidths(sourceWidth: number, kind: MediaUploadKind) {
  const maximumWidth = kind === "creator-avatar" ? 256 : 2560;
  const outputWidth = Math.min(sourceWidth, maximumWidth);
  if (kind === "creator-avatar") return [outputWidth];

  const widths = RESPONSIVE_IMAGE_WIDTHS.filter((width) => width < outputWidth);
  return [...widths, outputWidth];
}

function outputFileName(fileName: string, width: number) {
  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-");
  return `${baseName || "image"}-${width}w.webp`;
}

function canvasToWebp(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob?.type === "image/webp"
          ? resolve(blob)
          : reject(new Error("This browser could not create an optimized WebP image.")),
      "image/webp",
      WEBP_QUALITY,
    );
  });
}

export async function optimizeStaticImage(file: File, kind: MediaUploadKind) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("The browser could not decode this image for optimization.");
  }

  try {
    const widths = getOptimizedImageWidths(bitmap.width, kind);
    return await Promise.all(
      widths.map(async (width): Promise<OptimizedImage> => {
        const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) throw new Error("The image optimizer could not start.");

        context.drawImage(bitmap, 0, 0, width, height);
        const blob = await canvasToWebp(canvas);
        return {
          file: new File([blob], outputFileName(file.name, width), {
            type: "image/webp",
          }),
          width,
          height,
        };
      }),
    );
  } finally {
    bitmap.close();
  }
}

export function isOptimizableStaticImage(contentType: string) {
  return ["image/avif", "image/jpeg", "image/png", "image/webp"].includes(
    contentType,
  );
}
