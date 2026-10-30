import "server-only";
import sharp from "sharp";
import { assertCreatorAvatarDimensions, CreatorAvatarError, MAX_CREATOR_AVATAR_BYTES, MAX_CREATOR_AVATAR_SIZE } from "./avatar-policy";

// Inspect decoded bytes, not filenames, request dimensions or HTTP MIME claims.
export async function prepareCreatorAvatar(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_CREATOR_AVATAR_BYTES) {
    throw new CreatorAvatarError("Choose a photo up to 10 MB.");
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp", "avif", "heif"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
      throw new CreatorAvatarError("Choose a static JPG, PNG, WebP or AVIF photo.");
    }
    assertCreatorAvatarDimensions(metadata.width ?? 0, metadata.height ?? 0);
    const size = Math.min(metadata.width!, metadata.height!, MAX_CREATOR_AVATAR_SIZE);
    if (metadata.format === "webp" && metadata.width === size && metadata.height === size && !metadata.exif && !metadata.xmp) {
      // Decode to verify the complete stream, while retaining a browser-optimized
      // photo's bytes instead of applying lossy compression for a second time.
      await image.clone().raw().toBuffer();
      return Buffer.from(bytes);
    }
    return await image.rotate().resize(size, size, { fit: "cover", position: "centre", withoutEnlargement: true })
      .webp({ quality: 84 }).toBuffer();
  } catch (error) {
    if (error instanceof CreatorAvatarError) throw error;
    throw new CreatorAvatarError("This photo could not be read. Choose a different image.");
  }
}
