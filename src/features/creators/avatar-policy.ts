export const DEFAULT_CREATOR_AVATAR = "/brand/default-avatar.svg";
export const MIN_CREATOR_AVATAR_SIZE = 400;
export const MAX_CREATOR_AVATAR_SIZE = 512;
export const MAX_CREATOR_AVATAR_BYTES = 10 * 1024 * 1024;
export const CREATOR_AVATAR_SIZE_MESSAGE = "Choose a photo at least 400 × 400 pixels. The photo will be cropped to a square.";

export class CreatorAvatarError extends Error {}

export function assertCreatorAvatarDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
    Math.min(width, height) < MIN_CREATOR_AVATAR_SIZE) {
    throw new CreatorAvatarError(CREATOR_AVATAR_SIZE_MESSAGE);
  }
}
