import { WEBP_QUALITY } from "./image-optimization";

export type VideoPoster = {
  file: File;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
};

function waitForVideoFrame(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("The browser could not decode this video."));
  });
}

function canvasToPoster(canvas: HTMLCanvasElement, fileName: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(
              new File([blob], `${fileName.replace(/\.[^.]+$/, "")}-poster.webp`, {
                type: "image/webp",
              }),
            )
          : reject(new Error("The video poster could not be generated.")),
      "image/webp",
      WEBP_QUALITY,
    );
  });
}

export async function createVideoPoster(file: File): Promise<VideoPoster> {
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = sourceUrl;

  try {
    await waitForVideoFrame(video);
    const width = Math.min(video.videoWidth, 1920);
    const height = Math.max(1, Math.round((video.videoHeight * width) / video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("The video poster generator could not start.");
    context.drawImage(video, 0, 0, width, height);

    return {
      file: await canvasToPoster(canvas, file.name),
      width,
      height,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}
