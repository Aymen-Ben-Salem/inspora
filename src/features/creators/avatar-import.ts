import "server-only";
import { metadataFetcher } from "@/features/sponsorship/metadata";
import { freezeAdminCreatorAvatar, getR2PublicUrl, storeCreatorAvatar } from "@/storage/r2";
import { creatorAvatarUrl } from "./avatar-image-url";
import { CreatorAvatarError, DEFAULT_CREATOR_AVATAR, MAX_CREATOR_AVATAR_BYTES } from "./avatar-policy";
import type { AdminCreatorInput } from "./types";

type Avatar = { avatarUrl: string; avatarStorageProvider: "r2" | null; avatarStorageKey: string | null };
export const defaultCreatorAvatar: Avatar = { avatarUrl: DEFAULT_CREATOR_AVATAR, avatarStorageProvider: null, avatarStorageKey: null };

function storedAvatar(stored: { url: string; storageKey: string }): Avatar {
  return { avatarUrl: stored.url, avatarStorageProvider: "r2", avatarStorageKey: stored.storageKey };
}

export async function importCreatorAvatarUrl(value: string): Promise<Avatar> {
  try {
    const url = new URL(creatorAvatarUrl(value));
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    // Reuse the bounded public-resource transport: every redirect is checked,
    // DNS is pinned, and private/special destinations are rejected.
    const response = await metadataFetcher.fetchPublic(url.href, MAX_CREATOR_AVATAR_BYTES, AbortSignal.timeout(10000));
    if (response.url.protocol !== "https:") throw new Error();
    return storedAvatar(await storeCreatorAvatar(response.bytes));
  } catch (error) {
    if (error instanceof CreatorAvatarError) throw error;
    throw new CreatorAvatarError("The photo could not be imported. Upload an image or try a different HTTPS image URL.");
  }
}

export async function prepareAdminCreatorAvatar(
  input: Pick<AdminCreatorInput, "avatarUrl" | "avatarStorageProvider" | "avatarStorageKey">,
  existing?: { avatarUrl: string; avatarStorageProvider: string | null; avatarStorageKey: string | null },
  xImageUrl?: string,
) {
  // Ordinary edits retain legacy photos verbatim; no bulk refresh or downgrade.
  if (existing?.avatarUrl === input.avatarUrl && input.avatarUrl !== DEFAULT_CREATOR_AVATAR) return {
    avatarUrl: existing.avatarUrl, avatarStorageProvider: existing.avatarStorageProvider, avatarStorageKey: existing.avatarStorageKey,
  };
  if (input.avatarUrl === DEFAULT_CREATOR_AVATAR) {
    if (xImageUrl) {
      try { return await importCreatorAvatarUrl(xImageUrl); } catch { /* Creating a profile can still use the default photo. */ }
    }
    return defaultCreatorAvatar;
  }
  if (input.avatarStorageProvider === "r2" && input.avatarStorageKey) {
    if (input.avatarUrl !== getR2PublicUrl(input.avatarStorageKey)) throw new CreatorAvatarError("The uploaded photo URL does not match its file.");
    return storedAvatar(await freezeAdminCreatorAvatar(input.avatarStorageKey));
  }
  return importCreatorAvatarUrl(input.avatarUrl);
}
