import { MIN_CREATOR_AVATAR_SIZE } from "./avatar-policy";

/** A square region of the source photo, in its (orientation-corrected) pixels. */
export type AvatarCrop = { x: number; y: number; size: number };
export type AvatarSource = { width: number; height: number };
/** What the person controls: zoom (1 = the largest square) and the crop centre. */
export type AvatarView = { zoom: number; centerX: number; centerY: number };

const MAX_ZOOM = 4;

/** Zooming further would make the crop smaller than the minimum avatar size. */
export function maxAvatarZoom(source: AvatarSource) {
  const shortSide = Math.min(source.width, source.height);
  return Math.max(1, Math.min(MAX_ZOOM, shortSide / MIN_CREATOR_AVATAR_SIZE));
}

export function initialAvatarView(source: AvatarSource): AvatarView {
  return { zoom: 1, centerX: source.width / 2, centerY: source.height / 2 };
}

export function clampAvatarView(source: AvatarSource, view: AvatarView): AvatarView {
  const zoom = Math.min(maxAvatarZoom(source), Math.max(1, Number.isFinite(view.zoom) ? view.zoom : 1));
  const half = Math.min(source.width, source.height) / zoom / 2;
  const clamp = (value: number, length: number) => Math.min(length - half, Math.max(half, Number.isFinite(value) ? value : length / 2));
  return { zoom, centerX: clamp(view.centerX, source.width), centerY: clamp(view.centerY, source.height) };
}

/** Moves the crop by source pixels; dragging the photo right moves the crop left. */
export function panAvatarView(source: AvatarSource, view: AvatarView, dx: number, dy: number) {
  return clampAvatarView(source, { ...view, centerX: view.centerX + dx, centerY: view.centerY + dy });
}

export function zoomAvatarView(source: AvatarSource, view: AvatarView, zoom: number) {
  return clampAvatarView(source, { ...view, zoom });
}

export function avatarCropFromView(source: AvatarSource, view: AvatarView): AvatarCrop {
  const clamped = clampAvatarView(source, view);
  const size = Math.max(1, Math.floor(Math.min(source.width, source.height) / clamped.zoom));
  const x = Math.round(Math.min(source.width - size, Math.max(0, clamped.centerX - size / 2)));
  const y = Math.round(Math.min(source.height - size, Math.max(0, clamped.centerY - size / 2)));
  return { x, y, size };
}

/** The largest centred square, used when no crop was chosen. */
export function centeredAvatarCrop(source: AvatarSource): AvatarCrop {
  return avatarCropFromView(source, initialAvatarView(source));
}

export function isValidAvatarCrop(source: AvatarSource, crop: AvatarCrop) {
  return [crop.x, crop.y, crop.size].every(Number.isInteger) &&
    crop.x >= 0 && crop.y >= 0 && crop.size >= MIN_CREATOR_AVATAR_SIZE &&
    crop.x + crop.size <= source.width && crop.y + crop.size <= source.height;
}
