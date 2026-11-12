import { canvasToWebp } from "./image-optimization";

export type VideoPoster = {
  file: File;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
};

function waitForVideoFrame(video: HTMLVideoElement, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      video.onloadeddata = null;
      video.onerror = null;
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new DOMException("Media preparation was cancelled.", "AbortError"));
    const timer = setTimeout(() => finish(new Error("Reading the video frame timed out.")), 15000);
    video.onloadeddata = () => finish();
    video.onerror = () => finish(new Error("The browser could not decode this video."));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function createVideoPoster(file: File, signal?: AbortSignal): Promise<VideoPoster> {
  signal?.throwIfAborted();
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  let canvas: HTMLCanvasElement | undefined;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;

  try {
    await waitForVideoFrame(video, signal);
    const width = Math.min(video.videoWidth, 1920);
    const height = Math.max(1, Math.round((video.videoHeight * width) / video.videoWidth));
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("The video poster generator could not start.");
    context.drawImage(video, 0, 0, width, height);

    return {
      file: new File([await canvasToWebp(canvas, context)], `${file.name.replace(/\.[^.]+$/, "")}-poster.webp`, { type: "image/webp" }),
      width,
      height,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    };
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}
