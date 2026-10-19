import { constrainVideoCrop, type VideoCropSelection } from "./video-crop";

/** Export only the selected pixels; PNG retains the favicon's alpha channel. */
export async function cropImageFile(source: Blob, selection: VideoCropSelection, signal: AbortSignal) {
  signal.throwIfAborted();
  const url = URL.createObjectURL(source);
  const image = new Image();
  const canvas = document.createElement("canvas");
  let rejectPending: ((error: Error) => void) | undefined;
  const abort = () => rejectPending?.(new DOMException("Cropping was cancelled.", "AbortError"));
  const timeout = setTimeout(() => rejectPending?.(new Error("Opening or cropping the favicon timed out. Try again.")), 15000);
  signal.addEventListener("abort", abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      rejectPending = reject;
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The favicon could not be decoded. Upload the image again and retry cropping."));
      image.src = url;
    });
    signal.throwIfAborted();
    const bounds = { width: image.naturalWidth, height: image.naturalHeight };
    if (bounds.width !== selection.sourceDimensions.width || bounds.height !== selection.sourceDimensions.height) {
      throw new Error("The favicon changed while cropping. Reopen the crop editor and try again.");
    }
    const crop = constrainVideoCrop(selection.crop, bounds, 1);
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("The image crop editor could not start.");
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      rejectPending = reject;
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("The cropped favicon could not be created.")), "image/png");
    });
    signal.throwIfAborted();
    return new File([blob], "website-favicon-cropped.png", { type: "image/png" });
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
