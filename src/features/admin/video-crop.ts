export type VideoCrop = { x: number; y: number; width: number; height: number };
export type VideoDimensions = { width: number; height: number };
export type VideoCropSelection = { crop: VideoCrop; sourceDimensions: VideoDimensions };
export type CropCorner = "nw" | "ne" | "sw" | "se";

const align = (value: number, step: number) => Math.floor(value / step) * step;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// H.264 needs chroma-aligned offsets; static image crops can use single pixels.
export function constrainVideoCrop(crop: VideoCrop, bounds: VideoDimensions, step: 1 | 2 = 2): VideoCrop {
  if (![...Object.values(crop), bounds.width, bounds.height].every(Number.isFinite) || bounds.width < step || bounds.height < step) {
    throw new Error("The crop needs valid video dimensions.");
  }
  const x = align(clamp(crop.x, 0, align(bounds.width, step) - step), step);
  const y = align(clamp(crop.y, 0, align(bounds.height, step) - step), step);
  return {
    x, y,
    width: align(clamp(crop.width, step, bounds.width - x), step),
    height: align(clamp(crop.height, step, bounds.height - y), step),
  };
}

export function cropForAspectRatio(bounds: VideoDimensions, ratio?: number, step: 1 | 2 = 2): VideoCrop {
  if (ratio !== undefined && (!Number.isFinite(ratio) || ratio <= 0)) throw new Error("Choose a valid aspect ratio.");
  const width = ratio ? Math.min(bounds.width, bounds.height * ratio) : bounds.width;
  const height = ratio ? width / ratio : bounds.height;
  return constrainVideoCrop({ x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height }, bounds, step);
}

export function moveVideoCrop(crop: VideoCrop, dx: number, dy: number, bounds: VideoDimensions, step: 1 | 2 = 2): VideoCrop {
  return constrainVideoCrop({ ...crop, x: clamp(crop.x + dx, 0, bounds.width - crop.width), y: clamp(crop.y + dy, 0, bounds.height - crop.height) }, bounds, step);
}

export function centerVideoCrop(crop: VideoCrop, bounds: VideoDimensions, step: 1 | 2 = 2): VideoCrop {
  return constrainVideoCrop({ ...crop, x: (bounds.width - crop.width) / 2, y: (bounds.height - crop.height) / 2 }, bounds, step);
}

export function resizeVideoCrop(crop: VideoCrop, corner: CropCorner, dx: number, dy: number, bounds: VideoDimensions, ratio?: number, step: 1 | 2 = 2): VideoCrop {
  const east = corner.endsWith("e");
  const south = corner.startsWith("s");
  const anchorX = east ? crop.x : crop.x + crop.width;
  const anchorY = south ? crop.y : crop.y + crop.height;
  const availableWidth = east ? bounds.width - anchorX : anchorX;
  const availableHeight = south ? bounds.height - anchorY : anchorY;
  let width = clamp(crop.width + (east ? dx : -dx), step, availableWidth);
  let height = clamp(crop.height + (south ? dy : -dy), step, availableHeight);
  if (ratio) {
    width = Math.abs(dx) >= Math.abs(dy * ratio) ? width : height * ratio;
    width = clamp(width, Math.max(step, step * ratio), Math.min(availableWidth, availableHeight * ratio));
    height = width / ratio;
  }
  return constrainVideoCrop({ x: east ? anchorX : anchorX - width, y: south ? anchorY : anchorY - height, width, height }, bounds, step);
}

export function videoCropFilter(crop: VideoCrop) {
  if (!Object.values(crop).every((value) => Number.isInteger(value) && value >= 0 && value % 2 === 0) || crop.width < 2 || crop.height < 2) {
    throw new Error("The crop must use even pixel dimensions.");
  }
  return `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`;
}
