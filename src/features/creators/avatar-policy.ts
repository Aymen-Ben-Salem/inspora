export const DEFAULT_CREATOR_AVATAR = "/brand/default-avatar.svg";
// The largest avatar is shown at 174 CSS pixels, so 256 stays sharp at about
// 1.5x density; 400 covers 2x screens and is the recommended size.
export const MIN_CREATOR_AVATAR_SIZE = 256;
export const RECOMMENDED_CREATOR_AVATAR_SIZE = 400;
export const MAX_CREATOR_AVATAR_SIZE = 512;
export const MAX_CREATOR_AVATAR_BYTES = 10 * 1024 * 1024;
export const CREATOR_AVATAR_SIZE_MESSAGE = "This photo is too small. Choose one at least 256 × 256 pixels.";
export const CREATOR_AVATAR_SOFT_NOTICE = "Photo updated. It's under 400 × 400 pixels, so it may look slightly soft on sharp screens.";

export class CreatorAvatarError extends Error {}

export function assertCreatorAvatarDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
    Math.min(width, height) < MIN_CREATOR_AVATAR_SIZE) {
    throw new CreatorAvatarError(CREATOR_AVATAR_SIZE_MESSAGE);
  }
}

/** A stored avatar's square side; below the recommendation earns a soft notice, not a rejection. */
export function creatorAvatarSoftNotice(storedSize: number | null | undefined) {
  return storedSize && storedSize < RECOMMENDED_CREATOR_AVATAR_SIZE ? CREATOR_AVATAR_SOFT_NOTICE : null;
}
