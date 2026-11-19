/**
 * Advisory quality checks shown after an admin upload succeeds. They never
 * block an upload: some works only exist at a lower quality.
 */

/** Detail views show a logo at up to ~1000 CSS px, so 2x screens need ~2000 px. */
export const RECOMMENDED_LOGO_LONG_SIDE = 2000;
/** App-store icons are 1024 px at most; smaller exports look soft when enlarged. */
export const RECOMMENDED_ICON_SIDE = 1024;
export const RECOMMENDED_RECORDING_WIDTH = 1920;
/**
 * Bits per pixel per frame, assuming 30 fps. Scrolling text starts to smear
 * below about 0.03 (e.g. 1716x1076 at 1 Mbps is 0.018).
 */
export const MIN_RECORDING_BITS_PER_PIXEL = 0.03;

export const LOGO_UPLOAD_GUIDANCE =
  "For sharp results use a PNG or SVG export at least 2000 px on the long side. Avoid screenshots and social-media downloads, which are small and already compressed.";
export const ICON_UPLOAD_GUIDANCE =
  "Use the 1024 × 1024 app icon, ideally a PNG export rather than a screenshot.";
export const RECORDING_UPLOAD_GUIDANCE =
  "Record on a Retina/HiDPI screen (at least 1920 px wide, ideally 2560+) with a high-quality export setting, 30 or 60 fps, under 50 MB.";

export type LogoQualityFacts = {
  logoKind: "logo" | "icon";
  width: number;
  height: number;
  sourceMimeType?: string;
};

export function logoQualityNotice({ logoKind, width, height, sourceMimeType }: LogoQualityFacts) {
  const notes: string[] = [];
  const longSide = Math.max(width, height);
  const recommended = logoKind === "icon" ? RECOMMENDED_ICON_SIDE : RECOMMENDED_LOGO_LONG_SIDE;
  if (longSide < recommended) {
    notes.push(`This image is ${width} × ${height} px, so it may look soft when enlarged on sharp screens. A ${recommended} px or larger export is recommended.`);
  }
  if (sourceMimeType === "image/jpeg") {
    notes.push("JPEG files carry compression artifacts around edges; a PNG export is sharper if one exists.");
  }
  return notes.length ? notes.join(" ") : null;
}

export type RecordingQualityFacts = {
  width: number;
  height: number;
  sizeBytes: number;
  durationSeconds: number;
};

export function recordingQualityNotice({ width, height, sizeBytes, durationSeconds }: RecordingQualityFacts) {
  const notes: string[] = [];
  if (width < RECOMMENDED_RECORDING_WIDTH) {
    notes.push(`This recording is ${width} px wide, so text may look soft in the detail view. Record at ${RECOMMENDED_RECORDING_WIDTH} px or wider.`);
  }
  if (durationSeconds > 0 && width > 0 && height > 0) {
    const bitsPerSecond = sizeBytes * 8 / durationSeconds;
    if (bitsPerSecond / (width * height * 30) < MIN_RECORDING_BITS_PER_PIXEL) {
      notes.push(`It is compressed heavily (about ${(bitsPerSecond / 1e6).toFixed(1)} Mbps), so scrolling text may smear. Export with a higher quality setting if you can.`);
    }
  }
  return notes.length ? notes.join(" ") : null;
}

/** Reads a video file's duration in the browser; 0 when it cannot be read. */
export async function readVideoDuration(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve) => {
      const video = document.createElement("video");
      const timer = setTimeout(() => resolve(0), 15000);
      video.preload = "metadata";
      video.muted = true;
      video.onloadedmetadata = () => { clearTimeout(timer); resolve(Number.isFinite(video.duration) ? video.duration : 0); };
      video.onerror = () => { clearTimeout(timer); resolve(0); };
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
