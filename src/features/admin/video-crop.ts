export type VideoCrop = { x: number; y: number; width: number; height: number };
export type VideoDimensions = { width: number; height: number };
export type CropCorner = "nw" | "ne" | "sw" | "se";

const even = (value: number) => Math.floor(value / 2) * 2;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// H.264's 4:2:0 output needs even dimensions and chroma-aligned offsets.
export function constrainVideoCrop(crop: VideoCrop, bounds: VideoDimensions): VideoCrop {
  if (![...Object.values(crop), bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 2 || bounds.height < 2) {
    throw new Error("The crop needs valid video dimensions.");
  }
  const x = even(clamp(crop.x, 0, even(bounds.width) - 2));
  const y = even(clamp(crop.y, 0, even(bounds.height) - 2));
  return {
    x, y,
    width: even(clamp(crop.width, 2, bounds.width - x)),
    height: even(clamp(crop.height, 2, bounds.height - y)),
  };
}

export function cropForAspectRatio(bounds: VideoDimensions, ratio?: number): VideoCrop {
  if (ratio !== undefined && (!Number.isFinite(ratio) || ratio <= 0)) throw new Error("Choose a valid aspect ratio.");
  const width = ratio ? Math.min(bounds.width, bounds.height * ratio) : bounds.width;
  const height = ratio ? width / ratio : bounds.height;
  return constrainVideoCrop({ x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height }, bounds);
}

export function moveVideoCrop(crop: VideoCrop, dx: number, dy: number, bounds: VideoDimensions): VideoCrop {
  return constrainVideoCrop({ ...crop, x: clamp(crop.x + dx, 0, bounds.width - crop.width), y: clamp(crop.y + dy, 0, bounds.height - crop.height) }, bounds);
}

export function resizeVideoCrop(crop: VideoCrop, corner: CropCorner, dx: number, dy: number, bounds: VideoDimensions, ratio?: number): VideoCrop {
  const east = corner.endsWith("e");
  const south = corner.startsWith("s");
  const anchorX = east ? crop.x : crop.x + crop.width;
  const anchorY = south ? crop.y : crop.y + crop.height;
  const availableWidth = east ? bounds.width - anchorX : anchorX;
  const availableHeight = south ? bounds.height - anchorY : anchorY;
  let width = clamp(crop.width + (east ? dx : -dx), 2, availableWidth);
  let height = clamp(crop.height + (south ? dy : -dy), 2, availableHeight);
  if (ratio) {
    width = Math.abs(dx) >= Math.abs(dy * ratio) ? width : height * ratio;
    width = clamp(width, Math.max(2, 2 * ratio), Math.min(availableWidth, availableHeight * ratio));
    height = width / ratio;
  }
  return constrainVideoCrop({ x: east ? anchorX : anchorX - width, y: south ? anchorY : anchorY - height, width, height }, bounds);
}

export function videoCropFilter(crop: VideoCrop) {
  if (!Object.values(crop).every((value) => Number.isInteger(value) && value >= 0 && value % 2 === 0) || crop.width < 2 || crop.height < 2) {
    throw new Error("The crop must use even pixel dimensions.");
  }
  return `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`;
}
