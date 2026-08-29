export const VIDEO_PREVIEW_MAX_WIDTH = 1080;
export const VIDEO_PREVIEW_MAX_HEIGHT = 1920;

type VideoPreviewDimensions = {
  width: number;
  height: number;
};

export function assertVideoPreviewDimensions({
  width,
  height,
}: VideoPreviewDimensions) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("The generated video preview has invalid dimensions.");
  }

  if (
    width > VIDEO_PREVIEW_MAX_WIDTH ||
    height > VIDEO_PREVIEW_MAX_HEIGHT
  ) {
    throw new Error(
      `The generated video preview is ${width}?${height}; expected at most ${VIDEO_PREVIEW_MAX_WIDTH}?${VIDEO_PREVIEW_MAX_HEIGHT}.`,
    );
  }
}
